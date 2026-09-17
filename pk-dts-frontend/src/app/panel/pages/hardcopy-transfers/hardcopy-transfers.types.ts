export type HardcopyTransferStatus = 'Draft' | 'ForApproval' | 'ForTransfer' | 'Completed' | 'Returned' | 'Rejected' | 'Cancelled' | 'Approved' | 'Transferred' | 'PendingRecipientAcceptance';

export interface TransferUser {
    user_id: string;
    firstname?: string | null;
    lastname?: string | null;
    username?: string | null;
    position_title?: string | null;
}

export interface TransferWorkflowStep {
    workflow_step_id: string;
    node_key: string;
    sequence: number;
    stage: string;
    stage_label: string;
    assignment_type?: string | null;
    assignment_source?: string | null;
    assigned_user_id: string;
    assigned_user_name_snapshot: string;
    assigned_position_title_snapshot?: string | null;
    status: 'QUEUED' | 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED';
    decision?: string | null;
    comments?: string | null;
    acted_at?: string | null;
    assignee?: TransferUser | null;
    actor?: TransferUser | null;
}

export interface TransferHistory {
    transfer_history_id: string;
    action: string;
    previous_status?: HardcopyTransferStatus | null;
    new_status: HardcopyTransferStatus;
    comments?: string | null;
    created_at: string;
    performed_by?: TransferUser | null;
}

export interface HardcopyTransfer {
    transfer_request_id: string;
    document_id: string;
    hardcopy_id: string;
    document?: { document_title?: string | null; document_number?: string | null } | null;
    reason: string;
    transfer_to?: string | null;
    current_holder?: string | null;
    status: HardcopyTransferStatus;
    workflow_name?: string | null;
    workflow_version?: number | null;
    workflow_steps?: TransferWorkflowStep[];
    current_workflow_step?: TransferWorkflowStep | null;
    history?: TransferHistory[];
    requested_by_user_id: string;
    assigned_recipient_user_id: string;
    destination_area?: { area_name?: string | null } | null;
    destination_specific?: { specific_name?: string | null } | null;
    destination_location?: { location_name?: string | null } | null;
    destination_sequence?: { sequence_code?: string | null } | null;
    destination_area_id?: string | null;
    destination_specific_id?: string | null;
    destination_location_id?: string | null;
    destination_sequence_id?: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateHardcopyTransferPayload {
    document_id: string;
    destination_location_id: string;
    destination_area_id?: string;
    destination_specific_id?: string;
    destination_sequence_id?: string;
    transfer_to?: string;
    reason: string;
}
