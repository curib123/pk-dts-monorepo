import { BadRequestException, ConflictException } from "@nestjs/common";
import { WorkflowVersionStatus } from "@prisma/client";
import { WorkflowDefinitionsService } from "./workflow-definitions.service";

const graph = {
  schema_version: 2,
  start_node_key: "leader",
  nodes: [
    { key: "leader", label: "Leader approval", type: "APPROVAL", assignment: { type: "REQUESTER_LEADER" } },
    { key: "released", label: "Released", type: "END" },
  ],
  edges: [{ key: "leader-approved", from: "leader", to: "released", outcome: "APPROVE" }],
};

const actor = {
  user_id: "1",
  username: "admin",
  role: { role_id: "1", role_name: "Admin", permissions: ["document-workflow.publish"] },
} as any;

describe("WorkflowDefinitionsService", () => {
  it("accepts an acyclic graph with explicit assignment rules", async () => {
    const service = new WorkflowDefinitionsService({} as any);
    await expect(service.validateGraph(graph)).resolves.toMatchObject({ schema_version: 2, start_node_key: "leader" });
  });

  it("rejects workflow cycles before a version can be saved", async () => {
    const service = new WorkflowDefinitionsService({} as any);
    await expect(service.validateGraph({
      ...graph,
      edges: [
        ...graph.edges,
        { key: "released-back", from: "released", to: "leader", outcome: "DEFAULT" },
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not allow a published version to be edited", async () => {
    const prisma: any = {
      workflowVersion: { findFirst: jest.fn().mockResolvedValue({ status: WorkflowVersionStatus.PUBLISHED }) },
    };
    const service = new WorkflowDefinitionsService(prisma);
    await expect(service.updateVersion("1", "2", { graph })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects publishing a branching draft even when the service is called directly", async () => {
    const branching = {
      ...graph,
      nodes: [
        { key: "leader", label: "Leader approval", type: "APPROVAL", assignment: { type: "REQUESTER_LEADER" } },
        { key: "other", label: "Other approval", type: "APPROVAL", assignment: { type: "REQUESTER_LEADER" } },
        { key: "released", label: "Released", type: "END" },
      ],
      edges: [
        { key: "leader-approved", from: "leader", to: "released", outcome: "APPROVE" },
        { key: "leader-rejected", from: "leader", to: "other", outcome: "REJECT" },
      ],
    };
    const tx: any = {
      workflowVersion: {
        findFirst: jest.fn().mockResolvedValue({
          status: WorkflowVersionStatus.DRAFT,
          graph: branching,
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new WorkflowDefinitionsService(prisma);

    await expect(service.publish("1", "2", actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.workflowVersion.updateMany).not.toHaveBeenCalled();
  });

  it("caches repeated workflow-list reads and excludes full version graphs", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new WorkflowDefinitionsService({ workflowDefinition: { findMany } } as any);

    await service.list(true);
    await service.list(true);

    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0][0];
    expect(query.select.versions.select).toEqual({
      workflow_version_id: true,
      workflow_definition_id: true,
      version_number: true,
      status: true,
      published_at: true,
    });
    expect(query.select.versions.select).not.toHaveProperty("graph");
  });

  it("loads one workflow version graph on demand", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      workflow_version_id: 12n,
      workflow_definition_id: 4n,
      version_number: 3,
      status: WorkflowVersionStatus.DRAFT,
      graph,
    });
    const service = new WorkflowDefinitionsService({ workflowVersion: { findFirst } } as any);

    await expect(service.getVersion("4", "12")).resolves.toMatchObject({
      workflow_version_id: 12n,
      workflow_definition_id: 4n,
      graph,
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        workflow_version_id: 12n,
        workflow_definition_id: 4n,
      },
    });
  });

  it('looks up only the current published system default for the request action', async () => {
    const findFirst = jest.fn().mockResolvedValue({ workflow_version_id: 3n });
    const service = new WorkflowDefinitionsService({ workflowVersion: { findFirst } } as any);
    await expect(service.publishedDefault('SOFTCOPY', 'CANCELLATION')).resolves.toEqual([{ workflow_version_id: 3n }]);
    expect(findFirst.mock.calls[0][0].where).toEqual({ status: 'PUBLISHED', workflow_definition: { workflow_key: 'system-softcopy-cancellation', is_active: true } });
    expect(findFirst.mock.calls[0][0].select).not.toHaveProperty('graph');
    await expect(service.publishedDefault('INVALID')).rejects.toThrow('valid document type');
  });

  it('looks up the published hardcopy transfer workflow', async () => {
    const findFirst = jest.fn().mockResolvedValue({ workflow_version_id: 9n, version_number: 1 });
    const service = new WorkflowDefinitionsService({ workflowVersion: { findFirst } } as any);

    await expect(service.publishedDefault('HARDCOPY', 'TRANSFER')).resolves.toEqual([{ workflow_version_id: 9n, version_number: 1 }]);
    expect(findFirst.mock.calls[0][0].where.workflow_definition.workflow_key).toBe('system-hardcopy-transfer');
  });

});
