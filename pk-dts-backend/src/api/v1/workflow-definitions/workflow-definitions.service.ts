import { systemWorkflowKey } from "../../../common/constants/system-workflow";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, WorkflowVersionStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { toBigIntId } from "../../../common/utils/prisma-id.util";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CreateWorkflowDefinitionDto } from "./dto/create-workflow-definition.dto";
import { CreateWorkflowVersionDto } from "./dto/create-workflow-version.dto";
import { UpdateWorkflowVersionDto } from "./dto/update-workflow-version.dto";
import { assertSequentialWorkflowGraph } from "./sequential-workflow.validator";
import { WorkflowCondition, WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode } from "./workflow-graph.types";

const WORKFLOW_INCLUDE = {
  versions: {
    orderBy: { version_number: "desc" as const },
  },
};

const WORKFLOW_LIST_SELECT = {
  workflow_definition_id: true,
  workflow_key: true,
  name: true,
  description: true,
  document_type: true,
  is_active: true,
  versions: {
    orderBy: { version_number: "desc" as const },
    select: {
      workflow_version_id: true,
      workflow_definition_id: true,
      version_number: true,
      status: true,
      published_at: true,
    },
  },
} satisfies Prisma.WorkflowDefinitionSelect;

type WorkflowDefinitionListItem = Prisma.WorkflowDefinitionGetPayload<{ select: typeof WORKFLOW_LIST_SELECT }>;
const WORKFLOW_LIST_CACHE_TTL_MS = 15_000;

@Injectable()
export class WorkflowDefinitionsService {
  private readonly listCache = new Map<string, { expiresAt: number; value: WorkflowDefinitionListItem[] }>();

  constructor(private readonly prisma: PrismaService) {}

  async list(includeInactive = false) {
    const cacheKey = includeInactive ? "all" : "active";
    const cached = this.listCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.prisma.workflowDefinition.findMany({
      where: includeInactive ? undefined : { is_active: true },
      select: WORKFLOW_LIST_SELECT,
      orderBy: [{ document_type: "asc" }, { name: "asc" }],
    });
    this.listCache.set(cacheKey, { expiresAt: Date.now() + WORKFLOW_LIST_CACHE_TTL_MS, value });
    return value;
  }

  async getVersion(definitionIdValue: string, versionIdValue: string) {
    const definitionId = toBigIntId(definitionIdValue, "workflow_definition_id");
    const versionId = toBigIntId(versionIdValue, "workflow_version_id");
    const version = await this.prisma.workflowVersion.findFirst({
      where: {
        workflow_version_id: versionId,
        workflow_definition_id: definitionId,
      },
    });
    if (!version) throw new NotFoundException("Workflow version was not found.");

    const graph = version.graph as unknown as WorkflowGraph;
    const userIds = Array.from(
      new Set(
        (graph.nodes ?? [])
          .filter((node) => node.assignment?.type === "USER" && /^\d+$/.test(node.assignment.user_id ?? ""))
          .map((node) => BigInt(node.assignment!.user_id!)),
      ),
    );
    const roleIds = Array.from(
      new Set(
        (graph.nodes ?? [])
          .filter((node) => node.assignment?.type === "ROLE" && /^\d+$/.test(node.assignment.role_id ?? ""))
          .map((node) => BigInt(node.assignment!.role_id!)),
      ),
    );

    const [users, roles] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { user_id: { in: userIds } },
            select: {
              user_id: true,
              firstname: true,
              lastname: true,
              username: true,
              position_title: true,
              role: { select: { role_name: true } },
            },
          })
        : Promise.resolve([]),
      roleIds.length
        ? this.prisma.role.findMany({
            where: { role_id: { in: roleIds } },
            select: { role_id: true, role_name: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      ...version,
      assignment_references: {
        users: users.map((user) => ({
          user_id: user.user_id.toString(),
          firstname: user.firstname,
          lastname: user.lastname,
          username: user.username,
          position_title: user.position_title,
          role_name: user.role.role_name,
        })),
        roles: roles.map((role) => ({
          role_id: role.role_id.toString(),
          role_name: role.role_name,
        })),
      },
    };
  }

  async publishedDefault(documentType: string, action?: string) {
    if (!["SOFTCOPY", "HARDCOPY"].includes(documentType)) throw new BadRequestException("A valid document type is required.");
    if (action && !["CREATE", "REVISE", "CREATE_REVISE", "CANCELLATION", "TRANSFER"].includes(action)) throw new BadRequestException("Invalid document request action.");
    const version = await this.prisma.workflowVersion.findFirst({
      where: { status: WorkflowVersionStatus.PUBLISHED, workflow_definition: { workflow_key: systemWorkflowKey(documentType, action), is_active: true } },
      orderBy: { version_number: "desc" },
      select: { workflow_version_id: true, version_number: true, workflow_definition: { select: { workflow_key: true, name: true } } },
    });
    return version ? [version] : [];
  }

  async published(documentType?: string) {
    return this.prisma.workflowVersion.findMany({
      where: {
        status: WorkflowVersionStatus.PUBLISHED,
        workflow_definition: {
          is_active: true,
          ...(documentType ? { OR: [{ document_type: documentType as never }, { document_type: null }] } : {}),
        },
      },
      include: { workflow_definition: true },
      orderBy: [{ workflow_definition: { name: "asc" } }, { version_number: "desc" }],
    });
  }

  async create(dto: CreateWorkflowDefinitionDto, actor: AuthenticatedUser) {
    assertSequentialWorkflowGraph(dto.graph);
    const graph = await this.validateGraph(dto.graph);
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    const created = await this.prisma.$transaction(async (tx) => {
      const definition = await tx.workflowDefinition.create({
        data: {
          workflow_key: dto.workflow_key.trim().toLowerCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          document_type: dto.document_type ?? null,
          created_by_user_id: actorId,
        },
      });
      await tx.workflowVersion.create({
        data: {
          workflow_definition_id: definition.workflow_definition_id,
          version_number: 1,
          graph: graph as unknown as Prisma.InputJsonValue,
          created_by_user_id: actorId,
        },
      });
      return tx.workflowDefinition.findUnique({ where: { workflow_definition_id: definition.workflow_definition_id }, include: WORKFLOW_INCLUDE });
    });
    this.invalidateListCache();
    return created;
  }

  async createVersion(id: string, dto: CreateWorkflowVersionDto, actor: AuthenticatedUser) {
    const definitionId = toBigIntId(id, "workflow_definition_id");
    const definition = await this.prisma.workflowDefinition.findUnique({
      where: { workflow_definition_id: definitionId },
      include: { versions: { orderBy: { version_number: "desc" }, take: 1 } },
    });
    if (!definition) throw new NotFoundException("Workflow definition was not found.");
    const latest = definition.versions[0];
    const graphValue = dto.graph ?? latest?.graph;
    assertSequentialWorkflowGraph(graphValue);
    const graph = await this.validateGraph(graphValue);
    const version = await this.prisma.workflowVersion.create({
      data: {
        workflow_definition_id: definitionId,
        version_number: (latest?.version_number ?? 0) + 1,
        graph: graph as unknown as Prisma.InputJsonValue,
        created_by_user_id: toBigIntId(actor.user_id, "current_user_id"),
      },
    });
    this.invalidateListCache();
    return version;
  }

  async updateVersion(definitionIdValue: string, versionIdValue: string, dto: UpdateWorkflowVersionDto) {
    const definitionId = toBigIntId(definitionIdValue, "workflow_definition_id");
    const versionId = toBigIntId(versionIdValue, "workflow_version_id");
    const version = await this.prisma.workflowVersion.findFirst({ where: { workflow_version_id: versionId, workflow_definition_id: definitionId } });
    if (!version) throw new NotFoundException("Workflow version was not found.");
    if (version.status !== WorkflowVersionStatus.DRAFT) throw new ConflictException("Published workflow versions are immutable. Create a new draft version instead.");
    assertSequentialWorkflowGraph(dto.graph);
    const graph = await this.validateGraph(dto.graph);
    const updated = await this.prisma.workflowVersion.update({
      where: { workflow_version_id: versionId },
      data: { graph: graph as unknown as Prisma.InputJsonValue },
    });
    this.invalidateListCache();
    return updated;
  }

  async publish(definitionIdValue: string, versionIdValue: string, actor: AuthenticatedUser) {
    const definitionId = toBigIntId(definitionIdValue, "workflow_definition_id");
    const versionId = toBigIntId(versionIdValue, "workflow_version_id");
    const published = await this.prisma.$transaction(async (tx) => {
      const version = await tx.workflowVersion.findFirst({ where: { workflow_version_id: versionId, workflow_definition_id: definitionId } });
      if (!version) throw new NotFoundException("Workflow version was not found.");
      if (version.status !== WorkflowVersionStatus.DRAFT) throw new ConflictException("Only a draft workflow version can be published.");
      assertSequentialWorkflowGraph(version.graph);
      await this.validateGraph(version.graph, tx);
      await tx.workflowVersion.updateMany({
        where: { workflow_definition_id: definitionId, status: WorkflowVersionStatus.PUBLISHED },
        data: { status: WorkflowVersionStatus.ARCHIVED },
      });
      return tx.workflowVersion.update({
        where: { workflow_version_id: versionId },
        data: {
          status: WorkflowVersionStatus.PUBLISHED,
          published_by_user_id: toBigIntId(actor.user_id, "current_user_id"),
          published_at: new Date(),
        },
      });
    });
    this.invalidateListCache();
    return published;
  }

  async setActive(id: string, isActive: boolean) {
    const workflowDefinitionId = toBigIntId(id, "workflow_definition_id");
    const result = await this.prisma.workflowDefinition.updateMany({ where: { workflow_definition_id: workflowDefinitionId }, data: { is_active: isActive } });
    if (!result.count) throw new NotFoundException("Workflow definition was not found.");
    const definition = await this.prisma.workflowDefinition.findUnique({ where: { workflow_definition_id: workflowDefinitionId }, include: WORKFLOW_INCLUDE });
    this.invalidateListCache();
    return definition;
  }

  async validateGraph(value: unknown, database: Prisma.TransactionClient | PrismaService = this.prisma): Promise<WorkflowGraph> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Workflow graph must be an object.");
    const graph = value as Partial<WorkflowGraph>;
    if (!Array.isArray(graph.nodes) || !graph.nodes.length || graph.nodes.length > 50) throw new BadRequestException("A workflow must contain between 1 and 50 nodes.");
    if (!Array.isArray(graph.edges) || graph.edges.length > 150) throw new BadRequestException("A workflow can contain at most 150 connections.");
    const nodes = graph.nodes as WorkflowGraphNode[];
    const edges = graph.edges as WorkflowGraphEdge[];
    const nodeKeys = new Set<string>();
    const assignmentLookups = new Map<string, Promise<unknown>>();
    for (const node of nodes) {
      if (!node || !/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(node.key || "")) throw new BadRequestException("Every workflow node needs a valid unique key.");
      if (nodeKeys.has(node.key)) throw new BadRequestException(`Workflow node key ${node.key} is duplicated.`);
      nodeKeys.add(node.key);
      if (!node.label?.trim() || node.label.length > 150) throw new BadRequestException(`Workflow node ${node.key} needs a label.`);
      if (!["APPROVAL", "END"].includes(node.type)) throw new BadRequestException(`Workflow node ${node.key} has an invalid type.`);
      if (node.type === "APPROVAL" && !node.assignment) throw new BadRequestException(`Approval node ${node.label} needs an assignment rule.`);
      if (node.assignment) await this.validateAssignment(node, database, assignmentLookups);
    }
    if (!graph.start_node_key || !nodeKeys.has(graph.start_node_key)) throw new BadRequestException("Select a valid workflow start node.");
    if (nodes.find((node) => node.key === graph.start_node_key)?.type !== "APPROVAL") throw new BadRequestException("A workflow must start at an approval step.");
    const edgeKeys = new Set<string>();
    for (const edge of edges) {
      if (!edge?.key || edgeKeys.has(edge.key)) throw new BadRequestException("Every workflow connection needs a unique key.");
      edgeKeys.add(edge.key);
      if (!nodeKeys.has(edge.from) || !nodeKeys.has(edge.to)) throw new BadRequestException(`Workflow connection ${edge.key} references a missing node.`);
      if (nodes.find((node) => node.key === edge.from)?.type === "END") throw new BadRequestException("An end node cannot have outgoing connections.");
      if (!["APPROVE", "REJECT", "RETURN", "DEFAULT"].includes(edge.outcome)) throw new BadRequestException(`Workflow connection ${edge.key} has an invalid outcome.`);
      this.validateConditions(edge.conditions ?? []);
    }
    this.assertAcyclic(nodes, edges);
    return { schema_version: 2, start_node_key: graph.start_node_key, nodes, edges };
  }

  private async validateAssignment(node: WorkflowGraphNode, database: Prisma.TransactionClient | PrismaService, lookups: Map<string, Promise<unknown>>) {
    const lookup = (key: string, read: () => Promise<unknown>) => {
      let result = lookups.get(key);
      if (!result) { result = read(); lookups.set(key, result); }
      return result;
    };
    const assignment = node.assignment!;
    if (!["USER", "ROLE", "REQUESTER", "REQUESTER_LEADER", "PERMISSION"].includes(assignment.type)) throw new BadRequestException(`Node ${node.label} has an invalid assignment type.`);
    if (assignment.type === "USER") {
      if (!assignment.user_id) throw new BadRequestException(`Node ${node.label} needs an assigned user.`);
      const user = await lookup(`user:${assignment.user_id}`, () => database.user.findUnique({ where: { user_id: toBigIntId(assignment.user_id!, "workflow_user_id") }, select: { user_id: true } }));
      if (!user) throw new BadRequestException(`The assigned user for ${node.label} does not exist.`);
    }
    if (assignment.type === "ROLE") {
      if (!assignment.role_id) throw new BadRequestException(`Node ${node.label} needs an assigned role.`);
      const role = await lookup(`role:${assignment.role_id}`, () => database.role.findUnique({ where: { role_id: toBigIntId(assignment.role_id!, "workflow_role_id") }, select: { role_id: true } }));
      if (!role) throw new BadRequestException(`The assigned role for ${node.label} does not exist.`);
    }
    const permission = assignment.type === "PERMISSION" ? assignment.permission : node.required_permission;
    if (assignment.type === "PERMISSION" && !assignment.permission?.trim()) throw new BadRequestException(`Node ${node.label} needs an assigned permission.`);
    if (permission) {
      const found = await lookup(`permission:${permission}`, () => database.permission.findUnique({ where: { permission_name: permission }, select: { permission_id: true } }));
      if (!found) throw new BadRequestException(`Permission ${permission} used by ${node.label} does not exist.`);
    }
  }

  private validateConditions(conditions: WorkflowCondition[]) {
    if (!Array.isArray(conditions)) throw new BadRequestException("Workflow conditions must be an array.");
    const fields = new Set(["document_type", "action_requested", "business_document_type", "requester_type"]);
    for (const condition of conditions) {
      if (!condition || !fields.has(condition.field) || !["EQUALS", "NOT_EQUALS", "IN"].includes(condition.operator)) throw new BadRequestException("A workflow connection contains an invalid condition.");
      if (condition.operator === "IN" ? !Array.isArray(condition.value) || !condition.value.length || condition.value.some((value) => typeof value !== "string") : typeof condition.value !== "string") throw new BadRequestException("A workflow condition has an invalid comparison value.");
    }
  }

  private assertAcyclic(nodes: WorkflowGraphNode[], edges: WorkflowGraphEdge[]) {
    const adjacent = new Map(nodes.map((node) => [node.key, [] as string[]]));
    edges.forEach((edge) => adjacent.get(edge.from)!.push(edge.to));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (key: string) => {
      if (visiting.has(key)) throw new BadRequestException("Workflow connections cannot contain a cycle.");
      if (visited.has(key)) return;
      visiting.add(key);
      adjacent.get(key)?.forEach(visit);
      visiting.delete(key);
      visited.add(key);
    };
    nodes.forEach((node) => visit(node.key));
  }

  private invalidateListCache() {
    this.listCache.clear();
  }
}
