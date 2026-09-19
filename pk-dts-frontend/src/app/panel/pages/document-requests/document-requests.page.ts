import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import type { PaginatorState } from 'primeng/types/paginator';
import { Subscription, catchError, finalize, forkJoin, of } from 'rxjs';
import { AuthService } from '@/app/auth/auth.service';
import { ConfirmationDialogComponent } from '@/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { LoadingShimmerComponent } from '@/app/shared/components/loading-shimmer/loading-shimmer.component';
import { PaginationComponent } from '@/app/shared/components/pagination/pagination.component';
import { AlertDialogService } from '@/app/shared/services/alert-dialog.service';
import { SystemSettingsService } from '@/app/shared/services/system-settings.service';
import { DataViewMode, DataViewSwitchComponent } from '@/app/shared/components/data-view-switch/data-view-switch.component';
import { RecordCardComponent, RecordGridComponent } from '@/app/shared/components/record-grid/record-grid.component';
import { DocumentDetailDialogComponent } from '../documents/components/document-detail-dialog/document-detail-dialog.component';
import { DocumentFormDialogComponent } from '../documents/components/document-form-dialog/document-form-dialog.component';
import { RevisionUploadDialogComponent } from '../documents/components/revision-upload-dialog/revision-upload-dialog.component';
import { DocumentsService } from '../documents/documents.service';
import {
    AreaReference,
    AssetReference,
    DocumentDetail,
    DocumentFormValue,
    DocumentStatusHistory,
    DocumentSummary,
    LocationReference,
    SequenceReference,
    SoftcopyCategoryReference,
    SpecificReference,
    RevisionFormValue,
    RevisionSummary
} from '../documents/documents.types';

@Component({
    selector: 'app-document-requests-page',
    standalone: true,
    imports: [CommonModule, ButtonModule, TableModule, DataViewSwitchComponent, RecordGridComponent, RecordCardComponent, DocumentDetailDialogComponent, DocumentFormDialogComponent, RevisionUploadDialogComponent, ConfirmationDialogComponent, LoadingShimmerComponent, PaginationComponent],
    template: `
        <section class="requests-page">
            <div class="request-heading">
                <div>
                    <span>PERSONAL WORKFLOW</span>
                    <h1>My Requests</h1>
                    <p>Create and track document requests submitted by your account, including their approval history and current status.</p>
                </div>
                <p-button
                    *ngIf="canCreateRequest()"
                    label="Create Document Request"
                    icon="pi pi-plus"
                    (onClick)="openCreateDialog()"
                />
            </div>

            <div class="feedback success" *ngIf="successMessage()">{{ successMessage() }}</div>
            <div class="feedback error" *ngIf="errorMessage()">{{ errorMessage() }}</div>

            <div class="request-table">
                <app-data-view-switch [(mode)]="viewMode" title="Request results" />

                <app-loading-shimmer *ngIf="loading()" label="Loading your document requests" [columns]="6" />

                <p-table *ngIf="viewMode === 'list' && !loading()" [value]="requests()" responsiveLayout="scroll">
                    <ng-template pTemplate="header"><tr><th>Document</th><th>Requester</th><th>Status</th><th>Updated</th><th>Returned by</th><th>Return reason</th><th>Actions</th></tr></ng-template>
                    <ng-template pTemplate="body" let-item><tr>
                        <td><strong>{{ item.document_type === 'HARDCOPY' ? item.document_title : (item.document_number || 'No document number') }}</strong><small>{{ item.document_title }}</small></td>
                        <td>{{ requester(item) }}</td><td><span class="status">{{ statusLabel(item.status) }}</span></td>
                        <td>{{ item.updated_at || item.created_at | date:'medium' }}</td><td>{{ returnActor(item) }}</td><td>{{ returnReason(item) }}</td>
                        <td>
                            <div class="row-actions">
                                <p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" [loading]="viewLoading() && viewingDocumentId === item.document_id" [disabled]="viewLoading() && viewingDocumentId !== item.document_id" (onClick)="openRequestDetails(item)" />
                                <ng-container *ngIf="(item.status === 'Draft' || item.status === 'ForRevision' || item.status === 'ReturnedForCorrection') && (canEditRequest() || canSubmitRequest())">
                                    <p-button *ngIf="canEditRequest()" label="Edit" icon="pi pi-pencil" size="small" [outlined]="true" [disabled]="submitting || saving() || viewLoading()" (onClick)="openEditDialog(item)" />
                                    <p-button *ngIf="canUploadRequestedRevision(item)" label="Upload revision" icon="pi pi-upload" size="small" [outlined]="true" [disabled]="submitting || saving() || viewLoading()" (onClick)="openRevisionDialog(item)" />
                                    <p-button *ngIf="canSubmitRequest()" [label]="item.status === 'Draft' ? 'Submit' : 'Resubmit'" size="small" [disabled]="submitting || saving() || viewLoading()" (onClick)="openSubmitConfirmation(item)" />
                                    <p-button *ngIf="canDeleteDraftRequest(item)" label="Remove draft" icon="pi pi-trash" size="small" severity="danger" [outlined]="true" [disabled]="submitting || saving() || viewLoading()" (onClick)="openDeleteConfirmation(item)" />
                                </ng-container>
                            </div>
                        </td>
                    </tr></ng-template>
                    <ng-template pTemplate="emptymessage"><tr><td colspan="7">No requests found.</td></tr></ng-template>
                </p-table>

                <app-record-grid *ngIf="viewMode === 'grid' && !loading()" [empty]="!requests().length" emptyTitle="No requests found" emptyMessage="Create a document request to start your workflow.">
                    <app-record-card *ngFor="let item of requests()" icon="pi pi-file-edit" eyebrow="Document request" [title]="item.document_type === 'HARDCOPY' ? item.document_title : (item.document_number || 'No document number')" [subtitle]="item.document_title">
                        <div record-badges><span>{{ statusLabel(item.status) }}</span></div>
                        <div record-details>
                            <div><span>Requester</span><strong>{{ requester(item) }}</strong></div>
                            <div><span>Updated</span><strong>{{ requestUpdatedAt(item) | date:'medium' }}</strong></div>
                            <div><span>Returned by</span><strong>{{ returnActor(item) }}</strong></div>
                            <div class="wide"><span>Return reason</span><strong>{{ returnReason(item) }}</strong></div>
                        </div>
                        <div record-actions>
                            <p-button label="View" icon="pi pi-eye" size="small" [outlined]="true" [loading]="viewLoading() && viewingDocumentId === item.document_id" [disabled]="viewLoading() && viewingDocumentId !== item.document_id" (onClick)="openRequestDetails(item)" />
                            <ng-container *ngIf="(item.status === 'Draft' || item.status === 'ForRevision' || item.status === 'ReturnedForCorrection') && (canEditRequest() || canSubmitRequest())">
                                <p-button *ngIf="canEditRequest()" label="Edit" icon="pi pi-pencil" size="small" [outlined]="true" [disabled]="submitting || saving() || viewLoading()" (onClick)="openEditDialog(item)" />
                                <p-button *ngIf="canUploadRequestedRevision(item)" label="Upload revision" icon="pi pi-upload" size="small" [outlined]="true" [disabled]="submitting || saving() || viewLoading()" (onClick)="openRevisionDialog(item)" />
                                <p-button *ngIf="canSubmitRequest()" [label]="item.status === 'Draft' ? 'Submit' : 'Resubmit'" size="small" [disabled]="submitting || saving() || viewLoading()" (onClick)="openSubmitConfirmation(item)" />
                                <p-button *ngIf="canDeleteDraftRequest(item)" label="Remove draft" icon="pi pi-trash" size="small" severity="danger" [outlined]="true" [disabled]="submitting || saving() || viewLoading()" (onClick)="openDeleteConfirmation(item)" />
                            </ng-container>
                        </div>
                    </app-record-card>
                </app-record-grid>

                <app-pagination
                    *ngIf="totalRecords() > 0 && !loading()"
                    [first]="(page - 1) * rows"
                    [rows]="rows"
                    [totalRecords]="totalRecords()"
                    [rowsPerPageOptions]="[10, 20, 50, 100]"
                    currentPageReportTemplate="Showing {first} to {last} of {totalRecords} requests"
                    (pageChange)="onPageChange($event)"
                />
            </div>
        </section>

        <app-document-detail-dialog
            [(visible)]="detailDialogVisible"
            [document]="selectedDocumentDetail()"
            [loading]="viewLoading()"
            [revisions]="selectedRevisions()"
            [users]="[]"
            [canConfigureWorkflow]="false"
            [canAccessFiles]="canViewRequestFiles()"
            [canDeleteAttachments]="false"
        />

        <app-document-form-dialog
            [(visible)]="createDialogVisible"
            [mode]="documentFormMode"
            [form]="documentForm"
            [areas]="areas()"
            [assets]="assets()"
            [specifics]="specifics()"
            [locations]="locations()"
            [sequences]="sequences()"
            [softcopyCategories]="softcopyCategories()"
            [currentUserName]="currentUserName()"
            [referenceLoading]="referenceLoading()"
            [saving]="saving()"
            (save)="saveRequest($event)"
        />
        <app-confirmation-dialog [(visible)]="submitConfirmationVisible" title="Submit request?" [message]="submitConfirmationMessage()" [confirmLabel]="pendingSubmit?.status === 'ForRevision' ? 'Resubmit' : 'Submit'" tone="primary" (confirm)="confirmSubmit()" (cancel)="clearPendingSubmit()" />
        <app-confirmation-dialog [(visible)]="deleteConfirmationVisible" title="Remove draft request?" [message]="deleteConfirmationMessage()" confirmLabel="Remove draft" tone="danger" (confirm)="confirmDelete()" (cancel)="clearPendingDelete()" />
        <app-revision-upload-dialog
            [(visible)]="revisionDialogVisible"
            [form]="revisionForm"
            [saving]="saving()"
            [documentNumber]="revisionDocumentNumber"
            [currentRevision]="revisionCurrent"
            [existingRevisions]="revisionHistory"
            [softcopyCategories]="softcopyCategories()"
            (save)="uploadRequestedRevision($event)"
        />
    `,
    styles: [`
        .requests-page{display:grid;gap:1.25rem}.request-heading,.request-table{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:1.4rem}.request-heading{border-left:6px solid var(--brand-primary);display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}.request-heading span{color:var(--brand-primary);font-size:.72rem;font-weight:800;letter-spacing:.14em}.request-heading h1{margin:.25rem 0;color:#111827}.request-heading p,.tab-copy{margin:0;color:#64748b}.request-table h2{margin:0 0 .35rem}.workflow-tabs{display:flex;gap:.65rem;flex-wrap:wrap;padding:.4rem;border-radius:16px;background:#f1f5f9;width:max-content;max-width:100%}.workflow-tabs button{border:0;background:transparent;border-radius:12px;padding:.8rem 1rem;font-weight:800;color:#64748b;cursor:pointer}.workflow-tabs button.active{background:#fff;color:var(--brand-primary);box-shadow:0 4px 14px rgba(15,23,42,.09)}.workflow-tabs button span{margin-left:.45rem;padding:.15rem .45rem;border-radius:999px;background:#e2e8f0;color:#475569;font-size:.72rem}.status{display:inline-block;padding:.35rem .65rem;border-radius:999px;background:#111827;color:#fff;font-size:.75rem;font-weight:700}.disposal-status[data-status="Pending"]{background:#f59e0b}.disposal-status[data-status="Approved"]{background:#15803d}.disposal-status[data-status="Rejected"]{background:var(--brand-primary)}td small{display:block;color:#64748b;margin-top:.25rem}.row-actions{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}.feedback{border-radius:12px;padding:.85rem 1rem;font-weight:600}.feedback.success{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}.feedback.error{background:var(--brand-soft);color:var(--brand-primary-deep);border:1px solid var(--brand-border)}
    `]
})
export class DocumentRequestsPage implements OnInit, OnDestroy {
    private documents = inject(DocumentsService);
    private auth = inject(AuthService);
    private alerts = inject(AlertDialogService);
    private systemSettings = inject(SystemSettingsService);

    requests = signal<DocumentSummary[]>([]);
    totalRecords = signal(0);
    areas = signal<AreaReference[]>([]);
    assets = signal<AssetReference[]>([]);
    specifics = signal<SpecificReference[]>([]);
    locations = signal<LocationReference[]>([]);
    sequences = signal<SequenceReference[]>([]);
    softcopyCategories = signal<SoftcopyCategoryReference[]>([]);
    selectedDocumentDetail = signal<DocumentDetail | null>(null);
    selectedRevisions = signal<RevisionSummary[]>([]);
    referenceLoading = signal(false);
    saving = signal(false);
    loading = signal(true);
    viewLoading = signal(false);
    successMessage = signal('');
    errorMessage = signal('');
    viewingDocumentId = '';
    detailDialogVisible = false;
    private detailRequest?: Subscription;
    createDialogVisible = false;
    submitConfirmationVisible = false;
    deleteConfirmationVisible = false;
    submitting = false;
    pendingSubmit: DocumentSummary | null = null;
    pendingDelete: DocumentSummary | null = null;
    documentFormMode: 'create' | 'update' = 'create';
    editingDocumentId = '';
    revisionDialogVisible = false;
    revisionDocumentId = '';
    revisionDocumentNumber = '';
    revisionCurrent: RevisionSummary | null = null;
    revisionHistory: RevisionSummary[] = [];
    revisionForm: RevisionFormValue = this.emptyRevisionForm();
    documentForm = this.emptyDocumentForm();
    viewMode: DataViewMode = 'list';
    page = 1;
    rows = 10;

    ngOnInit() { this.viewMode = this.systemSettings.defaultDataView(); this.rows = this.systemSettings.defaultRowsPerPage(); this.load(); }
    ngOnDestroy() { this.detailRequest?.unsubscribe(); }

    load() {
        this.loading.set(true);
        this.errorMessage.set('');
        this.documents.listMyRequestsPage(this.page, this.rows).pipe(
            finalize(() => this.loading.set(false))
        ).subscribe({
            next: (response) => {
                this.requests.set(response.items ?? []);
                this.totalRecords.set(response.meta?.total ?? response.items?.length ?? 0);
                this.page = response.meta?.page ?? this.page;
            },
            error: (error) => {
                this.requests.set([]);
                this.totalRecords.set(0);
                this.errorMessage.set(this.requestError(error, 'Unable to load your document requests.'));
            }
        });
    }

    onPageChange(event: PaginatorState) {
        if (this.loading()) return;
        this.page = (event.page ?? 0) + 1;
        this.rows = event.rows ?? this.rows;
        this.load();
    }

    openRequestDetails(item: DocumentSummary) {
        this.detailRequest?.unsubscribe();
        this.viewingDocumentId = item.document_id;
        this.viewLoading.set(true);
        this.errorMessage.set('');
        this.selectedDocumentDetail.set(item);
        this.selectedRevisions.set(item.softcopy?.revisions ?? []);
        this.detailDialogVisible = true;

        this.detailRequest = this.documents.getDocument(item.document_id).pipe(
            finalize(() => {
                if (this.viewingDocumentId === item.document_id) {
                    this.viewLoading.set(false);
                    this.viewingDocumentId = '';
                }
            })
        ).subscribe({
            next: (document) => {
                if (!document) {
                    const message = 'This document request is no longer available.';
                    this.detailDialogVisible = false;
                    this.selectedDocumentDetail.set(null);
                    this.selectedRevisions.set([]);
                    this.errorMessage.set(message);
                    this.alerts.error('Request unavailable', message);
                    return;
                }
                this.selectedDocumentDetail.set(document);
                this.selectedRevisions.set(document.softcopy?.revisions ?? []);
            },
            error: (error) => {
                const message = this.requestError(error, 'The request summary is available, but the full workflow details could not be loaded.');
                this.errorMessage.set(message);
                this.alerts.error('Unable to load full request details', message);
            }
        });
    }

    openCreateDialog() {
        this.documentFormMode = 'create';
        this.editingDocumentId = '';
        this.documentForm = this.emptyDocumentForm();
        this.successMessage.set('');
        this.errorMessage.set('');
        this.createDialogVisible = true;
        this.loadReferences();
    }

    openEditDialog(item: DocumentSummary) {
        this.saving.set(true);
        this.documents.getDocument(item.document_id).pipe(
            finalize(() => this.saving.set(false))
        ).subscribe({
            next: (document) => {
                if (!document) {
                    this.errorMessage.set('This document request is no longer available.');
                    this.alerts.error('Request unavailable', this.errorMessage());
                    return;
                }
                this.openLoadedEditDialog(document);
            },
            error: (error) => {
                this.errorMessage.set(this.requestError(error, 'Unable to load the saved document request.'));
                this.alerts.error('Unable to edit request', this.errorMessage());
            }
        });
    }

    private openLoadedEditDialog(item: DocumentSummary) {
        const isDraft = item.status?.trim().toLowerCase() === 'draft';
        this.documentFormMode = isDraft ? 'create' : 'update';
        this.editingDocumentId = item.document_id;
        this.documentForm = {
            document_number: item.document_number || item.softcopy?.document_number || '',
            document_title: item.document_title,
            document_type: item.document_type,
            action: 'DRAFT',
            requester_type: item.requested_by_name ? 'MANUAL_NAME' : 'CURRENT_USER',
            requested_by_name: item.requested_by_name || '',
            request_date: item.request_date || '',
            department: item.department || '',
            business_document_type: item.business_document_type || 'Forms',
            action_requested: item.action_requested || (item.document_type === 'SOFTCOPY' ? 'CREATE' : undefined),
            from_party: item.from_party || '',
            to_party: item.to_party || '',
            reason_for_change: item.reason_for_change || 'Improvement',
            brief_description: item.brief_description || '',
            proposed_change: item.proposed_change || '',
            revision_level_from: item.revision_level_from || '',
            revision_level_to: item.revision_level_to || '',
            previous_effective_date: item.previous_effective_date?.slice(0, 10) || '',
            new_effective_date: item.new_effective_date?.slice(0, 10) || '',
            asset_id: item.hardcopy?.asset?.asset_id || '',
            area_id: item.hardcopy?.area?.area_id || '',
            specific_id: item.hardcopy?.specific?.specific_id || '',
            location_id: item.hardcopy?.location?.location_id || '',
            sequence_id: item.hardcopy?.sequence?.sequence_id || '',
            softcopy_category_id: item.softcopy?.category?.softcopy_category_id || '',
            initial_revision_number: item.softcopy?.current_revision?.revision_number || '',
            series_number: item.softcopy?.series_number || item.softcopy?.current_revision?.series_number || '',
            page_number: item.softcopy?.current_revision?.page_number || '',
            initial_file: null,
            attached_scan_files: [], assigned_user_ids: [],
            workflow_editable: isDraft,
            workflow_version_id: item.workflow_version_id || '',
            workflow_name: item.approver_configuration?.workflow_name || '',
            workflow_version: item.approver_configuration?.workflow_version || 1,
            workflow_steps: item.approver_configuration?.workflow_plan || (item.workflow_steps || []).map((step) => ({ stage: step.stage, assigned_user_id: step.assignee?.user_id || '' })),
            retention_enabled: item.hardcopy?.retention_enabled ?? false,
            retention_start_date: item.hardcopy?.retention_start_date?.slice(0, 10) || '', retention_end_date: item.hardcopy?.retention_end_date?.slice(0, 10) || ''
        };
        this.successMessage.set('');
        this.errorMessage.set('');
        this.createDialogVisible = true;
        this.loadReferences();
    }

    saveRequest(form: DocumentFormValue) {
        if (this.editingDocumentId) {
            this.updateRequest(form);
            return;
        }
        this.createRequest(form);
    }

    createRequest(form: DocumentFormValue) {
        const currentUserId = this.auth.user()?.user_id || '';
        if (!currentUserId) {
            this.errorMessage.set('Your login session could not be identified. Please sign in again.');
            this.alerts.error('Missing session', this.errorMessage());
            return;
        }

        this.saving.set(true);
        this.documents.createDocument(form, currentUserId).pipe(
            finalize(() => this.saving.set(false))
        ).subscribe({
            next: () => {
                this.createDialogVisible = false;
                this.documentForm = this.emptyDocumentForm();
                this.successMessage.set(form.action === 'DRAFT' ? 'Document request saved as draft.' : 'Document request submitted for approval.');
                this.alerts.success('Document request saved', this.successMessage());
                this.load();
            },
            error: (error) => {
                this.errorMessage.set(this.requestError(error, 'Unable to create the document request. Please review the form and try again.'));
                this.alerts.error('Unable to create request', this.errorMessage());
            }
        });
    }

    private updateRequest(form: DocumentFormValue) {
        const documentId = this.editingDocumentId;
        this.saving.set(true);
        this.documents.updateDocument(documentId, form).pipe(
            finalize(() => this.saving.set(false))
        ).subscribe({
            next: () => {
                this.createDialogVisible = false;
                this.editingDocumentId = '';
                this.documentForm = this.emptyDocumentForm();
                this.successMessage.set('Document request changes saved. You can now resubmit it for approval.');
                this.alerts.success('Document request updated', this.successMessage());
                this.load();
            },
            error: (error) => {
                const detail = typeof error?.error?.message === 'string'
                    ? error.error.message
                    : Array.isArray(error?.error?.message) ? error.error.message.join(' ') : '';
                this.errorMessage.set(detail || 'Unable to save changes to this document request.');
                this.alerts.error('Unable to save request', this.errorMessage());
            }
        });
    }

    openSubmitConfirmation(item: DocumentSummary) {
        this.errorMessage.set('');
        this.pendingSubmit = item;
        this.submitConfirmationVisible = true;
    }

    submitConfirmationMessage() {
        const verb = this.pendingSubmit?.status === 'ForRevision' ? 'resubmit' : 'submit';
        return `Confirm that you want to ${verb} ${this.pendingSubmit?.document_number || 'this document request'} for approval.`;
    }

    confirmSubmit() {
        const item = this.pendingSubmit;
        if (!item || this.submitting) return;
        this.submitting = true;
        this.documents.workflowAction(item.document_id, 'submit').pipe(
            finalize(() => { this.submitting = false; })
        ).subscribe({
            next: () => {
                this.requests.update((items) => items.map((request) => request.document_id === item.document_id ? { ...request, status: request.document_type === 'SOFTCOPY' ? 'ForNotedBy' : 'ForApproval' } : request));
                this.clearPendingSubmit();
                this.successMessage.set('Document request submitted for approval.');
                this.alerts.success('Document request submitted', this.successMessage());
                this.load();
            },
            error: (error) => { this.errorMessage.set(this.requestError(error, 'Unable to submit this document request.')); this.alerts.error('Unable to submit request', this.errorMessage()); }
        });
    }

    clearPendingSubmit() { this.pendingSubmit = null; this.submitConfirmationVisible = false; }

    openDeleteConfirmation(item: DocumentSummary) {
        if (!this.canDeleteDraftRequest(item)) return;
        this.errorMessage.set('');
        this.pendingDelete = item;
        this.deleteConfirmationVisible = true;
    }

    deleteConfirmationMessage() {
        return `Remove the draft ${this.pendingDelete?.document_number || this.pendingDelete?.document_title || 'document request'}? This cannot be undone.`;
    }

    confirmDelete() {
        const item = this.pendingDelete;
        if (!item || this.saving()) return;
        this.saving.set(true);
        this.documents.deleteDocument(item.document_id).pipe(
            finalize(() => this.saving.set(false))
        ).subscribe({
            next: () => {
                this.clearPendingDelete();
                this.successMessage.set('Draft document request removed.');
                this.alerts.success('Draft removed', this.successMessage());
                this.load();
            },
            error: (error) => {
                this.errorMessage.set(this.requestError(error, 'Unable to remove this draft document request.'));
                this.alerts.error('Unable to remove draft', this.errorMessage());
            }
        });
    }

    clearPendingDelete() { this.pendingDelete = null; this.deleteConfirmationVisible = false; }

    private requestError(error: any, fallback: string) {
        const message = error?.error?.message ?? error?.error?.error ?? error?.message;
        return Array.isArray(message) ? message.join(' ') : typeof message === 'string' && message.trim() ? message : fallback;
    }

    canUploadRequestedRevision(item: DocumentSummary) {
        return this.canEditRequest() && (item.status === 'ForRevision' || item.status === 'ReturnedForCorrection') && item.document_type === 'SOFTCOPY';
    }

    openRevisionDialog(item: DocumentSummary) {
        if (!this.canUploadRequestedRevision(item)) return;
        this.saving.set(true);
        this.documents.getDocument(item.document_id).pipe(
            finalize(() => this.saving.set(false))
        ).subscribe({
            next: (detail) => {
                this.revisionDocumentId = item.document_id;
                this.revisionDocumentNumber = detail?.document_number || item.document_number || 'No document number';
                this.revisionCurrent = detail?.softcopy?.current_revision || null;
                this.revisionHistory = detail?.softcopy?.revisions || [];
                const current = detail?.softcopy?.current_revision;
                this.revisionForm = {
                    ...this.emptyRevisionForm(),
                    series_number: detail?.softcopy?.series_number || current?.series_number || '',
                    page_number: current?.page_number || '',
                    effective_date: this.dateInputValue(current?.effective_date),
                    softcopy_category_id: detail?.softcopy?.category?.softcopy_category_id || ''
                };
                this.revisionDialogVisible = true;
            },
            error: () => {
                this.alerts.error('Unable to load revisions', 'The revision history could not be loaded.');
            }
        });
    }

    uploadRequestedRevision(form: RevisionFormValue) {
        if (!this.revisionDocumentId) return;
        this.saving.set(true);
        this.documents.uploadRevision(this.revisionDocumentId, form).pipe(
            finalize(() => this.saving.set(false))
        ).subscribe({
            next: () => {
                this.revisionDialogVisible = false;
                this.successMessage.set('The revised file was uploaded. You can now resubmit the request for approval.');
                this.alerts.success('Revision uploaded', this.successMessage());
                this.load();
            },
            error: () => {
                this.alerts.error('Unable to upload revision', 'Confirm the request is still marked For Revision and try again.');
            }
        });
    }

    canCreateRequest() { return this.auth.hasPermission('document-requests.create'); }
    canEditRequest() { return this.auth.hasPermission('document-requests.edit'); }
    canSubmitRequest() { return this.auth.hasPermission('document-requests.submit'); }
    canViewRequestFiles() { return this.auth.hasPermission('documents.download'); }
    canDeleteDraftRequest(item: DocumentSummary) {
        return item.status?.trim().toLowerCase() === 'draft'
            && this.auth.hasAnyPermission('documents.delete', 'document-requests.delete', 'documents.manage-own');
    }
    currentUserName() { const user = this.auth.user(); return [user?.firstname, user?.lastname].filter(Boolean).join(' ') || user?.username || ''; }
    requester(item: DocumentSummary) { return item.requested_by_name || [item.requester?.firstname, item.requester?.lastname].filter(Boolean).join(' ') || 'Current user'; }
    private latestReturn(item: DocumentSummary): DocumentStatusHistory | undefined { return item.status_history?.find((history) => history.action === 'request-revision'); }
    returnActor(item: DocumentSummary) { const actor = this.latestReturn(item)?.actor; return [actor?.firstname, actor?.lastname].filter(Boolean).join(' ') || actor?.username || 'None'; }
    returnReason(item: DocumentSummary) { return this.latestReturn(item)?.remarks || 'None'; }
    statusLabel(status: DocumentSummary['status']) {
        const labels: Record<string, string> = { Draft: 'Draft', PendingApproval: 'Pending Approval', ForNotedBy: 'For Noted By', ForPlantManagerApproval: 'For Plant Manager Approval', ForDocumentControllerAdmin: 'For Document Controller/Admin Approval', ForApproval: 'For Approval', Approved: 'Approved — Pending Release', Completed: 'Completed / Released', ReturnedForCorrection: 'For Revision', ForRevision: 'For Revision', Rejected: 'Rejected', Cancelled: 'Cancelled', Disposed: 'Disposed' };
        return status ? (labels[status] || status.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')) : 'N/A';
    }
    requestUpdatedAt(item: DocumentSummary) { return (item as DocumentSummary & { updated_at?: string }).updated_at || item.created_at; }
    private dateInputValue(value?: string | null) { return value ? value.slice(0, 10) : ''; }

    private loadReferences() {
        this.referenceLoading.set(true);
        forkJoin({
            areas: this.documents.listAreas().pipe(catchError(() => of([] as AreaReference[]))),
            assets: this.documents.listAssetNumbers().pipe(catchError(() => of([] as AssetReference[]))),
            specifics: this.documents.listSpecifics().pipe(catchError(() => of([] as SpecificReference[]))),
            locations: this.documents.listLocations().pipe(catchError(() => of([] as LocationReference[]))),
            sequences: this.documents.listSequences().pipe(catchError(() => of([] as SequenceReference[]))),
            softcopyCategories: this.documents.listSoftcopyCategories().pipe(catchError(() => of([] as SoftcopyCategoryReference[])))
        }).pipe(
            finalize(() => this.referenceLoading.set(false))
        ).subscribe(({ areas, assets, specifics, locations, sequences, softcopyCategories }) => {
            this.areas.set(areas);
            this.assets.set(assets);
            this.specifics.set(specifics);
            this.locations.set(locations);
            this.sequences.set(sequences);
            this.softcopyCategories.set(softcopyCategories.filter((category) => category.is_active !== false));
        });
    }

    private emptyDocumentForm(): DocumentFormValue {
        return {
            document_number: '', document_title: '', document_type: 'HARDCOPY', action: 'DRAFT',
            requester_type: 'CURRENT_USER', requested_by_name: '', asset_id: '', area_id: '',
            specific_id: '', location_id: '', sequence_id: '', softcopy_category_id: '',
            initial_revision_number: '', initial_file: null, attached_scan_files: [], assigned_user_ids: [],
            action_requested: 'CREATE',
            workflow_name: 'Direct Hardcopy Approval', workflow_version: 1,
            workflow_steps: [{ stage: 'HARDCOPY_APPROVAL', assigned_user_id: '' }], retention_enabled: false,
            retention_start_date: '', retention_end_date: ''
        };
    }

    private emptyRevisionForm(): RevisionFormValue {
        return { revision_number: '', reason_of_revision: '', effective_date: '', page_number: '', uploaded_by: this.auth.user()?.user_id || '', set_as_current: true, file: null };
    }
}
