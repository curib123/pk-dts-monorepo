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

describe("assertSequentialWorkflowGraph", () => {
  it("accepts one ordered approval chain", () => {
    expect(() => assertSequentialWorkflowGraph(sequentialGraph)).not.toThrow();
  });

  it("rejects permission-based approver selection", () => {
    const graph = structuredClone(sequentialGraph);
    graph.nodes[0].assignment = {
      type: "PERMISSION",
      permission: "document-requests.approve-noted-by",
    } as never;
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });

  it("rejects branching and non-approve decision routing", () => {
    const graph = structuredClone(sequentialGraph);
    graph.edges.push({ key: "leader-reject", from: "leader", to: "approved", outcome: "REJECT" });
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });

  it("rejects conditional routing", () => {
    const graph = structuredClone(sequentialGraph);
    (graph.edges[0] as any).conditions = [
      { field: "document_type", operator: "EQUALS", value: "SOFTCOPY" },
    ];
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });

  it("rejects an out-of-order start node", () => {
    const graph = structuredClone(sequentialGraph);
    graph.start_node_key = "plant-manager";
    expect(() => assertSequentialWorkflowGraph(graph)).toThrow(BadRequestException);
  });
});
