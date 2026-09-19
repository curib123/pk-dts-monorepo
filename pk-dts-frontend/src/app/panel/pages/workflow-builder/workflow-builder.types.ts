export type WorkflowDocumentType = 'SOFTCOPY' | 'HARDCOPY' | null;
export type WorkflowVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** Editable assignment types exposed by the sequential Workflow Builder. */
export type EditableWorkflowAssignmentType = 'USER' | 'ROLE' | 'REQUESTER' | 'REQUESTER_LEADER';
/** PERMISSION remains readable only for previously-published graph versions. */
export type WorkflowAssignmentType = EditableWorkflowAssignmentType | 'PERMISSION';

/** Legacy graph wire-format outcomes. New builder writes only APPROVE edges. */
export type WorkflowOutcome = 'APPROVE' | 'REJECT' | 'RETURN' | 'DEFAULT';

/** Legacy graph conditions are retained only so historical versions can be read safely. */
export interface WorkflowCondition {
    field: 'document_type' | 'action_requested' | 'business_document_type' | 'requester_type';
    operator: 'EQUALS' | 'NOT_EQUALS' | 'IN';
    value: string | string[];
}

export interface WorkflowNode {
    key: string;
    label: string;
    type: 'APPROVAL' | 'END';
    stage?: 'NOTED_BY' | 'PLANT_MANAGER' | 'DOCUMENT_CONTROLLER_ADMIN' | 'HARDCOPY_APPROVAL' | 'CUSTOM';
    assignment?: {
        type: WorkflowAssignmentType;
        user_id?: string;
        role_id?: string;
        /** Legacy compatibility only. New writes must not set this. */
        permission?: string;
    };
    /** Legacy compatibility only. Permissions are managed separately from route assignment. */
    required_permission?: string;
    /** Legacy visual-canvas metadata. New sequential writes omit positions. */
    position?: { x: number; y: number };
}

/**
 * Legacy persistence/runtime wire format. The product model is now a sequential list;
 * new writes serialize exactly one APPROVE edge from each ordered step to the next.
 */
export interface WorkflowEdge {
    key: string;
    from: string;
    to: string;
    outcome: WorkflowOutcome;
    conditions?: WorkflowCondition[];
}

export interface WorkflowGraph {
    schema_version: 2;
    start_node_key: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

export interface WorkflowVersionSummary {
    workflow_version_id: string;
    workflow_definition_id: string;
    version_number: number;
    status: WorkflowVersionStatus;
    published_at?: string | null;
    _count?: { documents: number };
}

export interface WorkflowVersion extends WorkflowVersionSummary {
    graph: WorkflowGraph;
}

export interface WorkflowDefinition {
    workflow_definition_id: string;
    workflow_key: string;
    name: string;
    description?: string | null;
    document_type: WorkflowDocumentType;
    is_active: boolean;
    versions: WorkflowVersionSummary[];
}

export interface PublishedWorkflowVersion extends WorkflowVersion {
    workflow_definition: WorkflowDefinition;
}

export interface PublishedWorkflowOption {
    workflow_version_id: string;
    version_number: number;
    workflow_definition: { workflow_key: string; name: string };
}
