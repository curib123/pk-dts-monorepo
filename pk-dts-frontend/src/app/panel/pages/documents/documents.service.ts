import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, filter, forkJoin, map, of, shareReplay, switchMap, tap, throwError, timeout } from 'rxjs';
import { BACKEND_API_BASE_URL } from '@/app/config/api-config';
import {
    ApiResponseEnvelope,
    AreaReference,
    AssetReference,
    BatchHardcopyImportResponse,
    BatchHardcopyUploadProgress,
    BatchSoftcopyFolderUploadProgress,
    BatchSoftcopyFolderImportResponse,
    DocumentAssistantResponse,
    DocumentAssistantMode,
    DocumentDetail,
    DisposalRequestSummary,
    DocumentFormValue,
    DocumentSummary,
    DocumentUploadAnalysis,
    DocumentUserSummary,
    LocationReference,
    PaginatedResponse,
    RevisionFormValue,
    RevisionSummary,
    SequenceReference,
    SoftcopyCategoryReference,
    SpecificReference
} from './documents.types';

const DOCUMENTS_API = `${BACKEND_API_BASE_URL}/documents`;
const USERS_API = `${BACKEND_API_BASE_URL}/users`;
const AREAS_API = `${BACKEND_API_BASE_URL}/areas`;
const ASSET_NUMBERS_API = `${BACKEND_API_BASE_URL}/asset-numbers`;
const SPECIFICS_API = `${BACKEND_API_BASE_URL}/specifics`;
const LOCATIONS_API = `${BACKEND_API_BASE_URL}/locations`;
const SEQUENCES_API = `${BACKEND_API_BASE_URL}/sequences`;
const SOFTCOPY_CATEGORIES_API = `${BACKEND_API_BASE_URL}/softcopy-categories`;
const LIST_LIMIT = 1000;
const LIST_CACHE_TTL_MS = 15_000;
const DOCUMENT_DETAIL_TIMEOUT_MS = 30_000;

type ApiResponse<T> = ApiResponseEnvelope<T> | T;

@Injectable({ providedIn: 'root' })
export class DocumentsService {
    private http = inject(HttpClient);
    private listCache = new Map<string, { expiresAt: number; request: Observable<unknown[]> }>();

    listDocuments() {
        return this.fetchAllPages<DocumentSummary>(DOCUMENTS_API);
    }

    listDisposedDocuments() {
        return this.fetchAllPages<DocumentSummary>(`${DOCUMENTS_API}/disposed`);
    }

    listMyRequests() { return this.fetchAllPages<DocumentSummary>(`${DOCUMENTS_API}/requests/mine`); }
    listMyRequestsPage(page = 1, limit = 10) { return this.fetchPage<DocumentSummary>(`${DOCUMENTS_API}/requests/mine`, page, limit); }
    listPendingRequests() { return this.fetchAllPages<DocumentSummary>(`${DOCUMENTS_API}/requests/pending`); }
    workflowAction(id: string, action: 'submit' | 'approve' | 'request-revision' | 'reject' | 'cancel' | 'complete', remarks = '') {
        const reviewAwareAction = action === 'submit'
            ? 'submit-review'
            : action === 'approve'
                ? 'approve-review'
                : action === 'complete'
                    ? 'complete-review'
                    : action;
        return this.http.post<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}/${reviewAwareAction}`, { remarks }).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    getApprovalDocument(id: string) {
        return this.http.get<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}/approval-view`).pipe(
            timeout(DOCUMENT_DETAIL_TIMEOUT_MS),
            map((response) => this.unwrap(response))
        );
    }

    getDocument(id: string) {
        return this.http.get<ApiResponse<DocumentDetail | null>>(`${DOCUMENTS_API}/${id}`).pipe(
            timeout(DOCUMENT_DETAIL_TIMEOUT_MS),
            map((response) => this.unwrap(response))
        );
    }

    listRevisions(id: string) {
        return this.http.get<ApiResponse<RevisionSummary[]>>(`${DOCUMENTS_API}/${id}/revisions`).pipe(map((response) => this.unwrap(response)));
    }

    reassignWorkflowStep(documentId: string, workflowStepId: string, userId: string, reason: string) {
        return this.http.patch<ApiResponse<import('./documents.types').DocumentWorkflowStepSummary>>(
            `${DOCUMENTS_API}/${documentId}/workflow-steps/${workflowStepId}/assignee`,
            { user_id: userId, reason }
        ).pipe(map((response) => this.unwrap(response)));
    }

    createDocument(payload: DocumentFormValue, createdBy: string) {
        const reviewFileFlow = this.usesRequestReviewFile(payload);
        const createPayload: DocumentFormValue = reviewFileFlow
            ? { ...payload, action: 'DRAFT' }
            : payload;
        const formData = new FormData();
        const cleanPayload = this.cleanDocumentPayload(createPayload, createdBy, false);
        Object.entries(cleanPayload).forEach(([key, value]) => {
            if (value !== undefined && value !== null) formData.append(key, String(value));
        });
        if (payload.document_type === 'SOFTCOPY' && payload.direct_create && payload.initial_file) {
            formData.append('file', payload.initial_file);
        }
        return this.http.post<ApiResponse<DocumentDetail>>(DOCUMENTS_API, formData).pipe(
            map((response) => this.unwrap(response)),
            switchMap((document) => reviewFileFlow && payload.initial_file ? this.uploadRequestReviewFile(document.document_id, payload) : of(document)),
            switchMap((document) => payload.document_type === 'SOFTCOPY' && this.scanAttachmentsOnly(payload.attached_scan_files, payload.initial_file).length ? this.uploadAttachments(document.document_id, this.scanAttachmentsOnly(payload.attached_scan_files, payload.initial_file)) : of(document)),
            switchMap((document) => reviewFileFlow && payload.action === 'SUBMIT' ? this.workflowAction(document.document_id, 'submit') : of(document)),
            tap(() => this.invalidateListCache())
        );
    }

    updateDocument(id: string, payload: DocumentFormValue) {
        return this.http.patch<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}`, this.cleanDocumentPayload(payload, '', true)).pipe(
            map((response) => this.unwrap(response)),
            switchMap((document) => this.usesRequestReviewFile(payload) && payload.initial_file ? this.uploadRequestReviewFile(id, payload) : of(document)),
            switchMap((document) => this.scanAttachmentsOnly(payload.attached_scan_files, payload.initial_file).length ? this.uploadAttachments(id, this.scanAttachmentsOnly(payload.attached_scan_files, payload.initial_file)) : of(document)),
            switchMap((document) => payload.action === 'SUBMIT' ? this.workflowAction(id, 'submit') : of(document)),
            tap(() => this.invalidateListCache())
        );
    }

    changeDirectory(id: string, softcopyCategoryId: string) {
        return this.http.patch<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}/directory`, { softcopy_category_id: softcopyCategoryId }).pipe(
            map((response) => this.unwrap(response)),
            tap(() => this.invalidateListCache())
        );
    }

    private uploadRequestReviewFile(documentId: string, payload: DocumentFormValue) {
        if (!payload.initial_file) return throwError(() => new Error('A review Softcopy file is required.'));
        const formData = new FormData();
        if (payload.initial_revision_number.trim()) formData.append('revision_number', payload.initial_revision_number.trim());
        const revisionReason = payload.proposed_change?.trim() || payload.brief_description?.trim() || payload.reason_for_change || '';
        if (revisionReason) formData.append('reason_of_revision', revisionReason);
        if (payload.new_effective_date) formData.append('effective_date', new Date(payload.new_effective_date).toISOString());
        if (payload.page_number?.trim()) formData.append('page_number', payload.page_number.trim());
        if (payload.series_number?.trim()) formData.append('series_number', payload.series_number.trim());
        if (payload.softcopy_category_id) formData.append('softcopy_category_id', payload.softcopy_category_id);
        if (payload.revision_level_from?.trim()) formData.append('revision_level_from', payload.revision_level_from.trim());
        if (payload.revision_level_to?.trim()) formData.append('revision_level_to', payload.revision_level_to.trim());
        if (payload.previous_effective_date) formData.append('previous_effective_date', new Date(payload.previous_effective_date).toISOString());
        if (payload.new_effective_date) formData.append('new_effective_date', new Date(payload.new_effective_date).toISOString());
        formData.append('file', payload.initial_file, payload.initial_file.name);
        return this.http.post<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${documentId}/request-review-file`, formData).pipe(
            map((response) => this.unwrap(response)),
            tap(() => this.invalidateListCache())
        );
    }

    private usesRequestReviewFile(payload: Pick<DocumentFormValue, 'document_type' | 'action_requested' | 'direct_create'>) {
        return payload.document_type === 'SOFTCOPY' && !payload.direct_create && payload.action_requested !== 'CANCELLATION';
    }

    moveDocumentToFolder(id: string, softcopyCategoryId: string) {
        return this.http.patch<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}`, { softcopy_category_id: softcopyCategoryId }).pipe(
            map((response) => this.unwrap(response)),
            tap(() => this.invalidateListCache())
        );
    }

    uploadAttachments(id: string, files: File[]) {
        const formData = new FormData();
        files.forEach((file) => formData.append('attachments', file, file.name));
        return this.http.post<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}/attachments`, formData).pipe(map((response) => this.unwrap(response)));
    }

    private scanAttachmentsOnly(files: File[], revisionFile?: File | null) {
        return files.filter((file) => !revisionFile || file.name.trim().toLowerCase() !== revisionFile.name.trim().toLowerCase() || file.size !== revisionFile.size);
    }

    deleteAttachment(documentId: string, attachmentId: string) {
        return this.http.delete<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${documentId}/attachments/${attachmentId}`).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    disposeDocument(id: string, payload: { disposal_action: string; disposal_action_other?: string; disposal_remarks: string; disposed_by_user_id: string; disposed_by_name?: string }) {
        return this.http.post<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}/dispose`, payload).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    restoreDocument(id: string) {
        return this.http.post<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}/restore`, {}).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    deleteDocument(id: string) {
        return this.http.delete<ApiResponse<DocumentDetail | null>>(`${DOCUMENTS_API}/${id}`).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    requestDocumentDisposal(id: string, payload: { disposal_action: string; disposal_action_other?: string; disposal_remarks: string; disposed_by_user_id: string }) {
        return this.http.post<ApiResponse<DisposalRequestSummary>>(`${DOCUMENTS_API}/${id}/disposal-request`, payload).pipe(map((response) => this.unwrap(response)));
    }

    listPendingDisposalRequests() {
        return this.http.get<ApiResponse<DisposalRequestSummary[]>>(`${DOCUMENTS_API}/disposal-requests/pending`).pipe(map((response) => this.unwrap(response)));
    }

    listDisposalRequests() {
        return this.http.get<ApiResponse<DisposalRequestSummary[]>>(`${DOCUMENTS_API}/disposal-requests/all`).pipe(map((response) => this.unwrap(response)));
    }

    listMyDisposalRequests() {
        return this.http.get<ApiResponse<DisposalRequestSummary[]>>(`${DOCUMENTS_API}/disposal-requests/mine`).pipe(map((response) => this.unwrap(response)));
    }

    reviewDisposalRequest(id: string, action: 'approve' | 'reject', remarks = '') {
        return this.http.post<ApiResponse<DisposalRequestSummary>>(`${DOCUMENTS_API}/disposal-requests/${id}/${action}`, { remarks }).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    assignDocumentUsers(id: string, userIds: string[]) {
        return this.http
            .put<ApiResponse<DocumentDetail>>(`${DOCUMENTS_API}/${id}/assignments`, { user_ids: userIds })
            .pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    uploadRevision(documentId: string, payload: RevisionFormValue) {
        const formData = new FormData();
        formData.append('uploaded_by', payload.uploaded_by);
        if (payload.revision_number.trim()) formData.append('revision_number', payload.revision_number.trim());
        if (payload.reason_of_revision.trim()) {
            formData.append('reason_of_revision', payload.reason_of_revision.trim());
        }
        if (payload.effective_date) {
            formData.append('effective_date', new Date(payload.effective_date).toISOString());
        }
        if (payload.page_number.trim()) {
            formData.append('page_number', payload.page_number.trim());
        }
        if (payload.series_number?.trim()) formData.append('series_number', payload.series_number.trim());
        if (payload.revision_level_from?.trim()) formData.append('revision_level_from', payload.revision_level_from.trim());
        if (payload.revision_level_to?.trim()) formData.append('revision_level_to', payload.revision_level_to.trim());
        if (payload.previous_effective_date) formData.append('previous_effective_date', new Date(payload.previous_effective_date).toISOString());
        if (payload.new_effective_date) formData.append('new_effective_date', new Date(payload.new_effective_date).toISOString());
        if (payload.set_as_current) formData.append('set_as_current', 'true');
        if (payload.softcopy_category_id) formData.append('softcopy_category_id', payload.softcopy_category_id);
        if (payload.file) {
            formData.append('file', payload.file);
        }

        return this.http.post<ApiResponse<RevisionSummary>>(`${DOCUMENTS_API}/${documentId}/revisions`, formData).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    correctRevision(documentId: string, revisionId: string, payload: RevisionFormValue) {
        const formData = new FormData();
        formData.append('uploaded_by', payload.uploaded_by);
        formData.append('reason_of_revision', payload.reason_of_revision.trim());
        formData.append('correction_reason', payload.correction_reason?.trim() || payload.reason_of_revision.trim());
        if (payload.revision_number.trim()) formData.append('revision_number', payload.revision_number.trim());
        if (payload.effective_date) formData.append('effective_date', new Date(payload.effective_date).toISOString());
        if (payload.page_number.trim()) formData.append('page_number', payload.page_number.trim());
        if (payload.series_number?.trim()) formData.append('series_number', payload.series_number.trim());
        if (payload.softcopy_category_id) formData.append('softcopy_category_id', payload.softcopy_category_id);
        if (payload.file) formData.append('file', payload.file);
        return this.http.post<ApiResponse<RevisionSummary>>(`${DOCUMENTS_API}/${documentId}/revisions/${revisionId}/correct`, formData).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    finalizeRevision(documentId: string, revisionId: string, reason: string) {
        return this.http.post<ApiResponse<RevisionSummary>>(`${DOCUMENTS_API}/${documentId}/revisions/${revisionId}/finalize`, { reason }).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    analyzeDocumentFile(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        return this.http.post<ApiResponse<DocumentUploadAnalysis>>(`${DOCUMENTS_API}/analyze-upload`, formData).pipe(map((response) => this.unwrap(response)));
    }

    batchUploadHardcopy(file: File, createdBy: string): Observable<BatchHardcopyUploadProgress> {
        const formData = new FormData();
        formData.append('created_by', createdBy);
        formData.append('file', file);

        return this.http
            .post<ApiResponse<BatchHardcopyImportResponse>>(`${DOCUMENTS_API}/batch-hardcopy`, formData, {
                observe: 'events',
                reportProgress: true
            })
            .pipe(
                filter((event) => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
                map((event) => {
                    if (event.type === HttpEventType.UploadProgress) {
                        const total = event.total || file.size || 1;
                        const progress = Math.min(95, Math.round((event.loaded / total) * 100));
                        return {
                            phase: 'uploading' as const,
                            progress
                        };
                    }

                    return {
                        phase: 'complete' as const,
                        progress: 100,
                        result: this.unwrap(event.body as ApiResponse<BatchHardcopyImportResponse>)
                    };
                }),
                tap((progress) => {
                    if (progress.phase === 'complete') this.invalidateListCache();
                })
            );
    }

    batchUploadSoftcopyFolder(files: File[], relativePaths: string[], createdBy: string): Observable<BatchSoftcopyFolderUploadProgress> {
        const formData = new FormData();
        formData.append('created_by', createdBy);
        formData.append('relative_paths', JSON.stringify(relativePaths));
        files.forEach((file) => formData.append('files', file, file.name));
        const totalBytes = files.reduce((total, file) => total + file.size, 0) || 1;

        return this.http
            .post<ApiResponse<BatchSoftcopyFolderImportResponse>>(`${DOCUMENTS_API}/batch-softcopy-folder`, formData, {
                observe: 'events',
                reportProgress: true
            })
            .pipe(
                filter((event) => event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response),
                map((event) =>
                    event.type === HttpEventType.UploadProgress
                        ? { phase: 'uploading' as const, progress: Math.min(95, Math.round((event.loaded / (event.total || totalBytes)) * 100)) }
                        : { phase: 'complete' as const, progress: 100, result: this.unwrap(event.body as ApiResponse<BatchSoftcopyFolderImportResponse>) }
                ),
                tap((progress) => {
                    if (progress.phase === 'complete') this.invalidateListCache();
                })
            );
    }

    assistantSearch(query: string, limit = 8, mode: DocumentAssistantMode = 'online') {
        return this.http
            .post<ApiResponse<DocumentAssistantResponse>>(`${DOCUMENTS_API}/assistant/search`, {
                query,
                limit,
                mode
            })
            .pipe(map((response) => this.unwrap(response)));
    }

    listUsers() {
        return this.fetchAllPages<DocumentUserSummary>(USERS_API);
    }

    listAreas() {
        return this.fetchAllPages<AreaReference>(AREAS_API);
    }

    listAssetNumbers() {
        return this.fetchAllPages<AssetReference>(ASSET_NUMBERS_API);
    }

    listSpecifics() {
        return this.fetchAllPages<SpecificReference>(SPECIFICS_API);
    }

    listLocations() {
        return this.fetchAllPages<LocationReference>(LOCATIONS_API);
    }

    listSequences() {
        return this.fetchAllPages<SequenceReference>(SEQUENCES_API);
    }

    listSoftcopyCategories() {
        return this.fetchAllPages<SoftcopyCategoryReference>(SOFTCOPY_CATEGORIES_API);
    }

    createSoftcopyCategory(payload: { category_name: string; parent_category_id?: string }) {
        return this.http.post<ApiResponse<SoftcopyCategoryReference>>(SOFTCOPY_CATEGORIES_API, payload).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    updateSoftcopyCategory(id: string, payload: { category_name?: string; parent_category_id?: string }) {
        return this.http.patch<ApiResponse<SoftcopyCategoryReference>>(`${SOFTCOPY_CATEGORIES_API}/${id}`, payload).pipe(map((response) => this.unwrap(response)), tap(() => this.invalidateListCache()));
    }

    private cleanDocumentPayload(payload: DocumentFormValue, createdBy: string, isUpdate: boolean) {
        if (isUpdate) {
            return {
                ...(payload.workflow_editable ? {
                    workflow_version_id: payload.workflow_version_id || '',
                    ...(!payload.workflow_version_id && payload.workflow_steps.length ? {
                        workflow_name: payload.workflow_name,
                        workflow_version: String(payload.workflow_version || 1),
                        workflow_plan: JSON.stringify(payload.workflow_steps)
                    } : {})
                } : {}),
                ...(payload.document_type === 'SOFTCOPY' ? { document_number: payload.document_number.trim() || null } : {}),
                document_title: payload.document_title.trim(),
                document_type: payload.document_type,
                ...(payload.document_type === 'SOFTCOPY' && payload.softcopy_category_id ? { softcopy_category_id: payload.softcopy_category_id } : {}),
                ...(payload.document_type === 'SOFTCOPY'
                    ? {
                          ...(payload.requested_by_name.trim() ? { requested_by_name: payload.requested_by_name.trim() } : { requested_by_name: null }),
                          ...this.controlFields(payload)
                      }
                    : { requested_by_name: null }),
                    ...(payload.document_type === 'HARDCOPY'
                        ? {
                              asset_id: payload.asset_id || null,
                              area_id: payload.area_id,
                              specific_id: payload.specific_id || null,
                              location_id: payload.location_id,
                              sequence_id: payload.sequence_id || null,
                              retention_enabled: String(payload.retention_enabled),
                              ...(payload.retention_enabled
                                  ? {
                                        retention_start_date: payload.retention_start_date || null,
                                        retention_end_date: payload.retention_end_date || null
                                    }
                                  : {
                                        retention_start_date: null,
                                        retention_end_date: null
                                    })
                          }
                    : {})
            };
        }

        return {
            ...(payload.document_type === 'SOFTCOPY' && payload.document_number.trim() ? { document_number: payload.document_number.trim() } : {}),
            document_title: payload.document_title.trim(),
            document_type: payload.document_type,
            ...(payload.document_type === 'SOFTCOPY' && payload.softcopy_category_id ? { softcopy_category_id: payload.softcopy_category_id } : {}),
            ...(payload.document_type === 'SOFTCOPY' && payload.initial_revision_number.trim() ? { initial_revision_number: payload.initial_revision_number.trim() } : {}),
            ...(payload.document_type === 'SOFTCOPY' && payload.direct_create ? { direct_create: 'true', direct_creation_reason: payload.direct_creation_reason?.trim() || '' } : {}),
            ...(!isUpdate && payload.assigned_user_ids.length ? { assigned_user_ids: JSON.stringify(payload.assigned_user_ids) } : {}),
            ...(!isUpdate && payload.workflow_version_id ? { workflow_version_id: payload.workflow_version_id } : {}),
            ...(!payload.workflow_version_id && payload.workflow_steps.length && (!isUpdate || payload.action === 'SUBMIT')
                ? {
                      workflow_name: payload.workflow_name.trim() || undefined,
                      workflow_version: String(payload.workflow_version || 1),
                      workflow_plan: JSON.stringify(payload.workflow_steps)
                  }
                : {}),
            action: payload.action,
            requester_type: payload.document_type === 'HARDCOPY' ? 'CURRENT_USER' : payload.requester_type,
            ...(isUpdate ? {} : { created_by: createdBy }),
            ...(payload.document_type === 'SOFTCOPY' && payload.requested_by_name.trim() ? { requested_by_name: payload.requested_by_name.trim() } : isUpdate ? { requested_by_name: null } : {}),
            ...(payload.document_type === 'SOFTCOPY' ? this.controlFields(payload) : {}),
            ...(payload.asset_id ? { asset_id: payload.asset_id } : isUpdate ? { asset_id: null } : {}),
            ...(payload.area_id ? { area_id: payload.area_id } : {}),
            ...(payload.specific_id ? { specific_id: payload.specific_id } : isUpdate ? { specific_id: null } : {}),
            ...(payload.location_id ? { location_id: payload.location_id } : {}),
            ...(payload.sequence_id ? { sequence_id: payload.sequence_id } : isUpdate ? { sequence_id: null } : {})
            ,...(payload.document_type === 'HARDCOPY'
                ? {
                      retention_enabled: String(payload.retention_enabled),
                      retention_start_date: payload.retention_enabled ? payload.retention_start_date || null : null,
                      retention_end_date: payload.retention_enabled ? payload.retention_end_date || null : null
                  }
                : {})
        };
    }

    private controlFields(payload: DocumentFormValue) {
        return {
            ...(payload.department?.trim() ? { department: payload.department.trim() } : {}),
            ...(payload.business_document_type ? { business_document_type: payload.business_document_type } : {}),
            ...(payload.series_number?.trim() ? { series_number: payload.series_number.trim() } : {}),
            ...(payload.page_number?.trim() ? { page_number: payload.page_number.trim() } : {}),
            ...(payload.action_requested ? { action_requested: payload.action_requested } : {}),
            ...(payload.from_party?.trim() ? { from_party: payload.from_party.trim() } : {}),
            ...(payload.to_party?.trim() ? { to_party: payload.to_party.trim() } : {}),
            ...(payload.reason_for_change ? { reason_for_change: payload.reason_for_change } : {}),
            ...(payload.brief_description?.trim() ? { brief_description: payload.brief_description.trim() } : {}),
            ...(payload.proposed_change?.trim() ? { proposed_change: payload.proposed_change.trim() } : {}),
            ...(payload.revision_level_from?.trim() ? { revision_level_from: payload.revision_level_from.trim() } : {}),
            ...(payload.revision_level_to?.trim() ? { revision_level_to: payload.revision_level_to.trim() } : {}),
            ...(payload.previous_effective_date ? { previous_effective_date: payload.previous_effective_date } : {}),
            ...(payload.new_effective_date ? { new_effective_date: payload.new_effective_date } : {})
        };
    }

    private fetchAllPages<T>(url: string) {
        const cached = this.listCache.get(url);
        if (cached && cached.expiresAt > Date.now()) return cached.request as Observable<T[]>;
        if (cached) this.listCache.delete(url);

        const request = this.fetchPage<T>(url, 1).pipe(
            switchMap((firstPage) => {
                const totalPages = firstPage.meta?.total_pages ?? 1;
                if (totalPages <= 1) return of(firstPage.items ?? []);

                const remainingPages = Array.from({ length: totalPages - 1 }, (_, index) => this.fetchPage<T>(url, index + 2));
                return forkJoin(remainingPages).pipe(
                    map((pages) => [firstPage, ...pages].flatMap((page) => page.items ?? []))
                );
            }),
            catchError((error: unknown) => {
                this.listCache.delete(url);
                return throwError(() => error);
            }),
            shareReplay({ bufferSize: 1, refCount: false })
        );

        this.listCache.set(url, { expiresAt: Date.now() + LIST_CACHE_TTL_MS, request: request as Observable<unknown[]> });
        return request;
    }

    private fetchPage<T>(url: string, page: number, limit = LIST_LIMIT): Observable<PaginatedResponse<T>> {
        return this.http
            .get<ApiResponse<PaginatedResponse<T>>>(url, {
                params: {
                    page,
                    limit
                }
            })
            .pipe(map((response) => this.unwrap(response)));
    }

    private invalidateListCache() {
        this.listCache.clear();
    }

    private unwrap<T>(response: ApiResponse<T>): T {
        if (this.isEnvelope(response)) {
            return response.data;
        }

        return response;
    }

    private isEnvelope<T>(response: ApiResponse<T>): response is ApiResponseEnvelope<T> {
        return !!response && typeof response === 'object' && 'data' in response;
    }
}
