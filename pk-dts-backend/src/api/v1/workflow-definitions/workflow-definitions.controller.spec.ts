import { BadRequestException } from "@nestjs/common";
import { WorkflowDefinitionsController } from "./workflow-definitions.controller";

const actor = {
  user_id: "1",
  username: "admin",
  role: { role_id: "1", role_name: "Admin", permissions: ["document-workflow.publish"] },
} as any;

const sequentialGraph = {
  schema_version: 2,
  start_node_key: "leader",
  nodes: [
    { key: "leader", label: "Leader", type: "APPROVAL", assignment: { type: "REQUESTER_LEADER" } },
    { key: "approved", label: "Approved", type: "END" },
  ],
  edges: [{ key: "leader-approve", from: "leader", to: "approved", outcome: "APPROVE" }],
};

describe("WorkflowDefinitionsController", () => {
  it("publishes a sequential draft", async () => {
    const service = {
      list: jest.fn().mockResolvedValue([
        { workflow_definition_id: 1n, versions: [{ workflow_version_id: 2n, graph: sequentialGraph }] },
      ]),
      publish: jest.fn().mockResolvedValue({ workflow_version_id: 2n }),
    } as any;
    const controller = new WorkflowDefinitionsController(service);

    await expect(controller.publish("1", "2", actor)).resolves.toEqual({ workflow_version_id: 2n });
    expect(service.publish).toHaveBeenCalledWith("1", "2", actor);
  });

  it("rejects publishing a legacy branching draft", async () => {
    const branching = {
      ...sequentialGraph,
      nodes: [
        ...sequentialGraph.nodes,
        { key: "other", label: "Other approval", type: "APPROVAL", assignment: { type: "REQUESTER_LEADER" } },
      ],
      edges: [
        ...sequentialGraph.edges,
        { key: "leader-reject", from: "leader", to: "other", outcome: "REJECT" },
      ],
    };
    const service = {
      list: jest.fn().mockResolvedValue([
        { workflow_definition_id: 1n, versions: [{ workflow_version_id: 2n, graph: branching }] },
      ]),
      publish: jest.fn(),
    } as any;
    const controller = new WorkflowDefinitionsController(service);

    await expect(controller.publish("1", "2", actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.publish).not.toHaveBeenCalled();
  });
});
