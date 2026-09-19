export interface ApiResponseEnvelope<T> {
    success?: boolean;
    path?: string;
    timestamp?: string;
    message?: string;
    data: T;
}

export interface PaginatedMeta {
    total?: number;
    page?: number;
    limit?: number;
    total_pages?: number;
    has_next_page?: boolean;
    has_previous_page?: boolean;
}

export interface PaginatedResponse<T> {
    items: T[];
    meta?: PaginatedMeta;
}

export interface DocumentListQuery {
    page: number;
    limit: number;
    search?: string;
    document_type?: DocumentTypeValue | '';
    status?: DocumentStatusValue | '';
    assignment?: 'assigned' | 'unassigned' | '';
    area_id?: string;
    location_id?: string;
    specific_id?: string;
    asset_id?: string;
    sequence_id?: string;
    category_id?: string;
    disposed_by?: string;
}

export type DocumentTypeValue = 'HARDCOPY' | 'SOFTCOPY';
export type DocumentStatusValue = 'Draft' | 'PendingApproval' | 'ForNotedBy' | 'ForPlantManagerApproval' | 'ForDocumentControllerAdmin' | 'ForApproval' | 'Approved' | 'Completed' | 'ReturnedForCorrection' | 'Rejected' | 'Cancelled' | 'ForTransfer' | 'Transferred' | 'PendingRecipientAcceptance' | 'ForRevision' | 'Disposed';
export type DocumentBusinessTypeValue = 'Forms' | 'Manual' | 'Procedures' | 'WorkInstruction' | 'Monitoring' | 'Others';
export type DocumentActionRequestedValue = 'CREATE' | 'REVISE' | 'CREATE_REVISE' | 'CANCELLATION';
export type DocumentChangeReasonValue = 'Improvement' | 'CorrectionOfPreviousReleases' | 'Others';
export type DisposalActionValue = 'Shred' | 'Scratch' | 'Reuse' | 'Other';
export type SoftcopyAttachmentStatusValue = 'PendingApproval' | 'Approved' | 'Rejected' | 'Cancelled';
export type DocumentWorkflowStageValue = 'NOTED_BY' | 'PLANT_MANAGER' | 'DOCUMENT_CONTROLLER_ADMIN' | 'HARDCOPY_APPROVAL';
export type WorkflowStepStatusValue = 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'CANCELLED';

export interface DocumentUserSummary {
    user_id: string;
    firstname: string;
    lastname: string;
    username?: string;
    position_title?: string | null;
    role?: {
        role_id?: string;
        role_name: string;
        description?: string | null;
    };
}

export interface WorkflowPlanStepValue {
    stage: DocumentWorkflowStageValue;
    assigned_user_id?: string;
    stage_label?: string;
}

export interface DocumentWorkflowStepSummary {
    workflow_step_id: string;
    stage: DocumentWorkflowStageValue;
    stage_label?: string | null;
    sequence: number;
    node_key?: string | null;
    status: WorkflowStepStatusValue;
    assignment_source?: string | null;
    required_permission?: string | null;
    assigned_user_name_snapshot?: string | null;
    assigned_position_title_snapshot?: string | null;
    assigned_at?: string;
    assignee?: DocumentUserSummary | null;
    acted_user_name_snapshot?: string | null;
    acted_position_title_snapshot?: string | null;
    acted_at?: string | null;
    actor?: DocumentUserSummary | null;
    decision?: string | null;
    comments?: string | null;
    assignment_history?: Array<{
        assignment_history_id: string;
        previous_user_name?: string | null;
        new_user_name: string;
        new_position_title?: string | null;
        reason: string;
        changed_at: string;
    }>;
}

export interface AssetReference {
    asset_id: string;
    asset_number: string;
    specific_id?: string | null;
    specific?: SpecificReference | null;
}

export interface AreaReference {
    area_id: string;
    area_name: string;
}

export interface SpecificReference {
    specific_id: string;
    specific_name: string;
    area_id?: string | null;
    area?: AreaReference | null;
}

export interface LocationReference {
    location_id: string;
    location_name: string;
    location_code?: string | null;
    is_active?: boolean;
    asset_id?: string | null;
    asset?: AssetReference | null;
    specific_id?: string | null;
    specific?: SpecificReference | null;
}

export interface DisposalRequestSummary {
    disposal_request_id: string;
    disposal_remarks: string;
    disposal_action: DisposalActionValue;
    disposal_action_other?: string | null;
    status: 'Pending' | 'Approved' | 'Rejected';
    created_at: string;
    reviewer_remarks?: string | null;
    document: DocumentSummary;
    requester: DocumentUserSummary;
    reviewer?: DocumentUserSummary | null;
    reviewed_at?: string | null;
}

export interface SequenceReference {
    sequence_id: string;
    sequence_code: string;
}

export interface SoftcopyCategoryReference {
    softcopy_category_id: string;
    category_name: string;
    folder_name: string;
    description?: string | null;
    is_active?: boolean;
    parent_category_id?: string | null;
    parent?: Pick<SoftcopyCategoryReference, 'softcopy_category_id' | 'category_name' | 'folder_name'> | null;
}

export interface RevisionSummary {
    revision_id: string;
    revision_number: string;
    file_name?: string;
    file_path?: string;
    file_url?: string;
    mime_type?: string;
    created_at?: string;
    updated_at?: string;
    effective_date?: string;
    page_number?: string;
    reason_of_revision?: string;
    series_number?: string | null;
    document_title?: string;
    revision_level_from?: string | null;
    revision_level_to?: string | null;
    previous_effective_date?: string | null;
    new_effective_date?: string | null;
    date_received?: string | null;
    date_released?: string | null;
    approval_date?: string | null;
    is_current?: boolean;
    is_historical?: boolean;
    approved_at?: string | null;
    superseded_by_revision_id?: string | null;
    correction_reason?: string | null;
    approver?: DocumentUserSummary | null;
    uploader?: DocumentUserSummary | null;
}

export interface HardcopySummary {
    hardcopy_id?: string;
    created_at?: string;
    asset?: AssetReference | null;
    area?: AreaReference | null;
    specific?: SpecificReference | null;
    location?: LocationReference | null;
    sequence?: SequenceReference | null;
    retention_enabled?: boolean;
    retention_start_date?: string | null;
    retention_end_date?: string | null;
    retention?: {
        enabled: boolean;
        start_date?: string | null;
        end_date?: string | null;
        years: number;
        months: number;
        days: number;
        days_remaining?: number | null;
        label: string;
        guidance: string;
    };
    attachments?: SoftcopyAttachmentSummary[];
}

export interface SoftcopyAttachmentSummary {
    attachment_id: string;
    file_name: string;
    file_path?: string;
    file_url?: string;
    file_size?: string;
    mime_type?: string;
    status?: SoftcopyAttachmentStatusValue;
    approved_at?: string | null;
    rejected_at?: string | null;
    rejection_reason?: string | null;
    created_at?: string;
    uploader?: DocumentUserSummary | null;
}

export interface SoftcopySummary {
    softcopy_id?: string;
    document_number?: string | null;
    series_number?: string | null;
    created_at?: string;
    current_revision?: RevisionSummary | null;
    revisions?: RevisionSummary[];
    category?: SoftcopyCategoryReference | null;
    attachments?: SoftcopyAttachmentSummary[];
}

export interface DocumentSummary {
    document_id: string;
    document_number: string | null;
    document_title: string;
    document_type: DocumentTypeValue;
    status?: DocumentStatusValue | null;
    disposal_remarks?: string | null;
    disposal_action?: DisposalActionValue | null;
    disposal_action_other?: string | null;
    disposed_at?: string | null;
    disposed_by_name?: string | null;
    disposer?: DocumentUserSummary | null;
    reviewer?: DocumentUserSummary | null;
    reviewed_at?: string | null;
    reviewer_remarks?: string | null;
    request_date?: string;
    department?: string | null;
    business_document_type?: DocumentBusinessTypeValue | null;
    action_requested?: DocumentActionRequestedValue;
    from_party?: string | null;
    to_party?: string | null;
    reason_for_change?: DocumentChangeReasonValue | null;
    brief_description?: string | null;
    proposed_change?: string | null;
    revision_level_from?: string | null;
    revision_level_to?: string | null;
    previous_effective_date?: string | null;
    new_effective_date?: string | null;
    date_received?: string | null;
    date_released?: string | null;
    approval_date?: string | null;
    legacy_imported?: boolean;
    legacy_import_note?: string | null;
    status_history?: DocumentStatusHistory[];
    requested_by_name?: string | null;
    requester?: DocumentUserSummary | null;
    created_at?: string;
    updated_at?: string;
    hardcopy?: HardcopySummary | null;
    softcopy?: SoftcopySummary | null;
    creator?: DocumentUserSummary | null;
    assignments?: Array<{
        user: DocumentUserSummary;
        assigner?: DocumentUserSummary | null;
        assigned_at?: string;
    }>;
    approver_configuration?: {
        workflow_name?: string | null;
        workflow_version?: number;
        workflow_plan?: WorkflowPlanStepValue[];
    } | null;
    workflow_version_id?: string | null;
    workflow_steps?: DocumentWorkflowStepSummary[];
    source_document_id?: string | null;
    source_document_updated_at?: string | null;
}

export interface DocumentDetail extends DocumentSummary {}

export interface DocumentFormValue {
    document_number: string;
    document_title: string;
    document_type: DocumentTypeValue;
    action: 'DRAFT' | 'SUBMIT';
    requester_type: 'CURRENT_USER' | 'MANUAL_NAME';
    requested_by_name: string;
    asset_id: string;
    area_id: string;
    specific_id: string;
    location_id: string;
    sequence_id: string;
    softcopy_category_id: string;
    initial_revision_number: string;
    series_number?: string;
    page_number?: string;
    initial_file: File | null;
    attached_scan_files: File[];
    assigned_user_ids: string[];
    workflow_name: string;
    workflow_version: number;
    workflow_version_id?: string;
    workflow_editable?: boolean;
    direct_create?: boolean;
    direct_creation_reason?: string;
    workflow_steps: WorkflowPlanStepValue[];
    request_date?: string;
    department?: string;
    business_document_type?: DocumentBusinessTypeValue;
    action_requested?: DocumentActionRequestedValue;
    from_party?: string;
    to_party?: string;
    reason_for_change?: DocumentChangeReasonValue;
    brief_description?: string;
    proposed_change?: string;
    revision_level_from?: string;
    revision_level_to?: string;
    previous_effective_date?: string;
    new_effective_date?: string;
    retention_enabled: boolean;
    retention_start_date: string;
    retention_end_date: string;
}

export interface DocumentStatusHistory {
    history_id: string;
    previous_status?: DocumentStatusValue | null;
    new_status: DocumentStatusValue;
    action: string;
    remarks?: string | null;
    created_at: string;
    actor?: DocumentUserSummary | null;
}

export interface RevisionFormValue {
    uploaded_by: string;
    revision_number: string;
    reason_of_revision: string;
    effective_date: string;
    page_number: string;
    set_as_current: boolean;
    correction_reason?: string;
    file: File | null;
    series_number?: string;
    revision_level_from?: string;
    revision_level_to?: string;
    previous_effective_date?: string;
    new_effective_date?: string;
    softcopy_category_id?: string;
}

export interface DocumentAssistantResponse {
    mode: 'online' | 'local';
    provider: 'mistral' | 'local-search';
    configured: boolean;
    usedFallback: boolean;
    answer: string;
    matches: DocumentSummary[];
}

export interface DocumentUploadAnalysis {
    document_number: string | null;
    document_title: string | null;
    detected: boolean;
    message: string;
}

export type DocumentAssistantMode = 'online' | 'local';

export interface BatchHardcopyImportRow {
    sheet_name: string;
    row_number: number;
    sequence: string;
    document_name: string;
    location_name: string;
    asset_number: string;
    area_name: string;
    specific_name: string;
}

export interface BatchSoftcopyFolderImportResult {
    relative_path: string;
    document_id?: string;
    document_number?: string | null;
    category_path: string;
    status: 'created' | 'error';
    message: string;
}

export interface BatchSoftcopyFolderImportResponse {
    summary: { total: number; created: number; errors: number };
    results: BatchSoftcopyFolderImportResult[];
}

export interface BatchSoftcopyFolderUploadProgress {
    phase: 'uploading' | 'complete';
    progress: number;
    result?: BatchSoftcopyFolderImportResponse;
}

export interface BatchHardcopyImportResult {
    row_number: number;
    sheet_name: string;
    generated_document_number: string | null;
    document_name: string;
    status: 'created' | 'skipped' | 'error';
    message: string;
    document_id?: string;
}

export interface BatchHardcopyImportResponse {
    summary: {
        total: number;
        created: number;
        skipped: number;
        errors: number;
    };
    results: BatchHardcopyImportResult[];
}

export interface BatchHardcopyUploadProgress {
    phase: 'uploading' | 'processing' | 'complete';
    progress: number;
    result?: BatchHardcopyImportResponse;
}
