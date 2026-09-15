import { BadRequestException } from "@nestjs/common";
import { assertSequentialWorkflowGraph } from "./sequential-workflow.validator";

const sequentialGraph = {
  schema_version: 2,
  start_node_key: "leader",
  nodes: [
    {
      key: "leader",
      label: "Leader / Noted By",
      type: "APPROVAL",
      stage: "NOTED_BY",
      assignment: { type: "REQUESTER_LEADER" },
    },
    {
      key: "plant-manager",
      label: "Plant Manager Approval",
      type: "APPROVAL",
      stage: "PLANT_MANAGER",
      assignment: { type: "ROLE", role_id: "2" },
    },
    { key: "approved", label: "Approved", type: "END" },
  ],
  edges: [
    { key: "leader-approve", from: "leader", to: "plant-manager", outcome: "APPROVE" },
    { key: "plant-manager-approve", from: "plant-manager", to: "approved", outcome: "APPROVE" },
  ],
};

const cloneGraph = () => JSON.parse(JSON.stringify(sequentialGraph));

describe("assertSequentialWorkflowGraph", () => {
  it("accepts one ordered approval chain", () => {
    expect(() => assertSequentialWorkflowGraph(sequentialGraph)).not.toThrow();
  });

  it("rejects permission-based approver selection", () => {
    const graph = cloneGraph();
    graph.nodes[0].assignment = {
      type: "PERMISSION",
      permission: "document-requests.approve-noted-by",
    };
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });

  it("rejects hidden required-permission metadata", () => {
    const graph = cloneGraph();
    graph.nodes[1].required_permission = "document-requests.approve-plant-manager";
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });

  it("rejects branching and non-approve decision routing", () => {
    const graph = cloneGraph();
    graph.edges.push({ key: "leader-reject", from: "leader", to: "approved", outcome: "REJECT" });
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });

  it("rejects conditional routing", () => {
    const graph = cloneGraph();
    graph.edges[0].conditions = [
      { field: "document_type", operator: "EQUALS", value: "SOFTCOPY" },
    ];
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });

  it("rejects an out-of-order start node", () => {
    const graph = cloneGraph();
    graph.start_node_key = "plant-manager";
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });
});
