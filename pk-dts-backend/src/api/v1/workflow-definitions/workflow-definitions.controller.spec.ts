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
      publish: jest.fn().mockResolvedValue({ workflow_version_id: 2n }),
    } as any;
    const controller = new WorkflowDefinitionsController(service);

    await expect(controller.publish("1", "2", actor)).resolves.toEqual({ workflow_version_id: 2n });
    expect(service.publish).toHaveBeenCalledWith("1", "2", actor);
  });

  it("loads one workflow version through the detail endpoint", async () => {
    const service = {
      getVersion: jest.fn().mockResolvedValue({
        workflow_version_id: 2n,
        workflow_definition_id: 1n,
        graph: sequentialGraph,
      }),
    } as any;
    const controller = new WorkflowDefinitionsController(service);

    await expect(controller.getVersion("1", "2")).resolves.toMatchObject({
      workflow_version_id: 2n,
      workflow_definition_id: 1n,
      graph: sequentialGraph,
    });
    expect(service.getVersion).toHaveBeenCalledWith("1", "2");
  });
});
