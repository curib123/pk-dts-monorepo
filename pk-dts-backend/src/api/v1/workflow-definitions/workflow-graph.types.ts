export type WorkflowAssignmentType = "USER" | "ROLE" | "REQUESTER" | "REQUESTER_LEADER" | "PERMISSION";
export type WorkflowOutcome = "APPROVE" | "REJECT" | "RETURN" | "DEFAULT";

export type WorkflowCondition = {
  field: "document_type" | "action_requested" | "business_document_type" | "requester_type";
  operator: "EQUALS" | "NOT_EQUALS" | "IN";
  value: string | string[];
};

export type WorkflowGraphNode = {
  key: string;
  label: string;
  type: "APPROVAL" | "END";
  stage?: "NOTED_BY" | "PLANT_MANAGER" | "DOCUMENT_CONTROLLER_ADMIN" | "HARDCOPY_APPROVAL" | "CUSTOM";
  assignment?: {
    type: WorkflowAssignmentType;
    user_id?: string;
    role_id?: string;
    permission?: string;
  };
  required_permission?: string;
  position?: { x: number; y: number };
};

export type WorkflowGraphEdge = {
  key: string;
  from: string;
  to: string;
  outcome: WorkflowOutcome;
  conditions?: WorkflowCondition[];
};

export type WorkflowGraph = {
  schema_version: 2;
  start_node_key: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};
