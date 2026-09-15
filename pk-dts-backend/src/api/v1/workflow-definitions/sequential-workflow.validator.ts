import { BadRequestException } from "@nestjs/common";
import { WorkflowGraph, WorkflowGraphNode } from "./workflow-graph.types";

const MAX_APPROVAL_STEPS = 15;
const ALLOWED_ASSIGNMENT_TYPES = new Set(["USER", "ROLE", "REQUESTER_LEADER"]);

/**
 * New workflow-builder writes are intentionally limited to one ordered approval chain.
 * The legacy graph runtime remains in place only so already-published versions and
 * in-progress request snapshots continue to execute without a destructive migration.
 */
export function assertSequentialWorkflowGraph(value: unknown): asserts value is WorkflowGraph {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Workflow must be a valid ordered approval route.");
  }

  const graph = value as Partial<WorkflowGraph>;
  if (graph.schema_version !== 2 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new BadRequestException("Workflow must use the supported approval-route format.");
  }

  const approvalNodes = graph.nodes.filter((node) => node?.type === "APPROVAL");
  const endNodes = graph.nodes.filter((node) => node?.type === "END");

  if (!approvalNodes.length || approvalNodes.length > MAX_APPROVAL_STEPS) {
    throw new BadRequestException(`Workflow must contain between 1 and ${MAX_APPROVAL_STEPS} approval steps.`);
  }
  if (endNodes.length !== 1 || graph.nodes.length !== approvalNodes.length + 1) {
    throw new BadRequestException("Workflow must contain one final Approved outcome and approval steps only.");
  }
  if (graph.start_node_key !== approvalNodes[0].key) {
    throw new BadRequestException("A workflow must start with its first approval step.");
  }

  const nodeKeys = new Set<string>();
  for (const node of graph.nodes) {
    validateNode(node, nodeKeys);
  }

  if (graph.edges.length !== approvalNodes.length) {
    throw new BadRequestException("Workflow steps must form one sequential approval chain.");
  }

  for (let index = 0; index < approvalNodes.length; index += 1) {
    const from = approvalNodes[index];
    const expectedTarget = approvalNodes[index + 1]?.key ?? endNodes[0].key;
    const outgoing = graph.edges.filter((edge) => edge.from === from.key);

    if (outgoing.length !== 1) {
      throw new BadRequestException(`Approval step ${from.label} must have exactly one next step.`);
    }

    const edge = outgoing[0];
    if (edge.outcome !== "APPROVE" || edge.to !== expectedTarget) {
      throw new BadRequestException("Workflow routing is fixed: approval proceeds to the next ordered step.");
    }
    if (edge.conditions?.length) {
      throw new BadRequestException("Conditional routing is not supported. Use a separate workflow for a different process.");
    }
  }

  const endOutgoing = graph.edges.some((edge) => edge.from === endNodes[0].key);
  if (endOutgoing) {
    throw new BadRequestException("The final Approved outcome cannot route to another step.");
  }
}

function validateNode(node: WorkflowGraphNode, nodeKeys: Set<string>) {
  if (!node || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(node.key || "")) {
    throw new BadRequestException("Every workflow step needs a valid unique key.");
  }
  if (nodeKeys.has(node.key)) {
    throw new BadRequestException(`Workflow step key ${node.key} is duplicated.`);
  }
  nodeKeys.add(node.key);

  if (!node.label?.trim() || node.label.length > 150) {
    throw new BadRequestException(`Workflow step ${node.key} needs a label.`);
  }

  if (node.type === "END") {
    if (node.assignment) {
      throw new BadRequestException("The final Approved outcome cannot have an approver assignment.");
    }
    return;
  }

  if (node.type !== "APPROVAL" || !node.assignment) {
    throw new BadRequestException(`Workflow step ${node.label} needs an approver assignment.`);
  }

  if (node.required_permission) {
    throw new BadRequestException("Workflow steps assign responsibility; permissions are managed separately through Roles and Permissions.");
  }
  if (!ALLOWED_ASSIGNMENT_TYPES.has(node.assignment.type)) {
    throw new BadRequestException("Approvers can only be the requester's leader, a specific user, or a role.");
  }
  if (node.assignment.type === "USER" && !node.assignment.user_id) {
    throw new BadRequestException(`Workflow step ${node.label} needs an assigned user.`);
  }
  if (node.assignment.type === "ROLE" && !node.assignment.role_id) {
    throw new BadRequestException(`Workflow step ${node.label} needs an assigned role.`);
  }
  if (node.assignment.type === "REQUESTER_LEADER" && (node.assignment.user_id || node.assignment.role_id || node.assignment.permission)) {
    throw new BadRequestException(`Workflow step ${node.label} has conflicting approver settings.`);
  }
  if (node.assignment.type !== "USER" && node.assignment.user_id) {
    throw new BadRequestException(`Workflow step ${node.label} has conflicting approver settings.`);
  }
  if (node.assignment.type !== "ROLE" && node.assignment.role_id) {
    throw new BadRequestException(`Workflow step ${node.label} has conflicting approver settings.`);
  }
  if (node.assignment.permission) {
    throw new BadRequestException("Permission-based approver selection is not supported in sequential workflows.");
  }
}
