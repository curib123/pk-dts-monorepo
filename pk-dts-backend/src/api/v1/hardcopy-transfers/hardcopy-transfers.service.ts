import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HardcopyTransferStatus, HardcopyTransferWorkflowStepStatus, Prisma, RecipientAcceptanceStatus } from "@prisma/client";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { isAdministrativeRole } from "../../../common/auth/administrative-role.util";
import { hasPermission } from "../../../common/auth/document-workflow-permissions";
import { toBigIntId } from "../../../common/utils/prisma-id.util";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { CreateHardcopyTransferDto } from "./dto/create-hardcopy-transfer.dto";

type TransferWorkflowNode = {
  key: string;
  label: string;
  type: "APPROVAL" | "END";
  stage?: string;
  assignment?: {
    type: "USER" | "ROLE" | "REQUESTER_LEADER";
    user_id?: string;
    role_id?: string;
  };
};

type TransferWorkflowGraph = {
  start_node_key: string;
  nodes: TransferWorkflowNode[];
  edges: Array<{ from: string; to: string; outcome: string }>;
};

@Injectable()
export class HardcopyTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateHardcopyTransferDto, actor: AuthenticatedUser) {
    this.assertActorPermission(actor, "hardcopy-transfers.create");
    const documentId = toBigIntId(dto.document_id, "document_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    const document = await this.prisma.document.findUnique({
      where: { document_id: documentId },
      include: {
        hardcopy: true,
        approver_configuration: true,
        assignments: { orderBy: { assigned_at: "desc" }, select: { user_id: true } },
      },
    });
    if (!document?.hardcopy) throw new NotFoundException("Hardcopy document not found.");
    if (!["Approved", "Completed"].includes(document.status)) {
      throw new ConflictException("A Hardcopy transfer can only be requested for an approved Hardcopy document.");
    }
    const isAdministrator = isAdministrativeRole(actor.role.role_name);
    const assignedHolderId = document.assignments[0]?.user_id ?? null;
    const manuallySelectedHolderId = dto.current_holder_user_id
      ? toBigIntId(dto.current_holder_user_id, "current_holder_user_id")
      : null;
    const holderId = isAdministrator
      ? manuallySelectedHolderId ?? assignedHolderId
      : actorId;
    if (!holderId) {
      throw new BadRequestException("Select a Current Holder when the Hardcopy document has no assigned user.");
    }
    if (isAdministrator && holderId === actorId) {
      throw new BadRequestException("The Current Holder must be another user when an administrator creates the transfer.");
    }
    const holder = await this.prisma.user.findUnique({
      where: { user_id: holderId },
      select: { user_id: true, firstname: true, lastname: true },
    });
    if (!holder) throw new NotFoundException("The selected Current Holder was not found.");
    return this.prisma.$transaction(async (tx) => {
      const destination = await this.resolveDestinationStorage(tx, dto);
      const transfer = await tx.hardcopyTransferRequest.create({
        data: {
          document_id: documentId,
          hardcopy_id: document.hardcopy!.hardcopy_id,
          from_area_id: document.hardcopy!.area_id,
          from_specific_id: document.hardcopy!.specific_id,
          from_asset_id: document.hardcopy!.asset_id,
          from_location_id: document.hardcopy!.location_id,
          from_sequence_id: document.hardcopy!.sequence_id,
          destination_area_id: destination.area_id,
          destination_specific_id: destination.specific_id,
          destination_asset_id: destination.asset_id,
          destination_location_id: destination.location_id,
          destination_sequence_id: destination.sequence_id,
          document_copy_number: dto.document_copy_number?.trim() || null,
          current_holder: [holder.firstname, holder.lastname].filter(Boolean).join(" ") || null,
          transfer_to: dto.transfer_to?.trim() || null,
          requested_by_user_id: actorId,
          reason: dto.reason.trim(),
          approver_user_id: null,
          assigned_recipient_user_id: actorId,
          comments: dto.comments?.trim() || null,
        },
      });
      await this.recordHistory(tx, transfer.transfer_request_id, null, HardcopyTransferStatus.Draft, "create", actor, dto.comments);
      return transfer;
    });
  }

  listMine(actor: AuthenticatedUser) {
    const userId = toBigIntId(actor.user_id, "current_user_id");
    return this.prisma.hardcopyTransferRequest.findMany({
      where: { OR: [{ requested_by_user_id: userId }, { assigned_recipient_user_id: userId }] },
      include: {
        document: { include: { hardcopy: { include: { area: true, specific: true, asset: true, location: true, sequence: true } } } },
        from_area: true, from_specific: true, from_asset: true, from_location: true, from_sequence: true,
        destination_area: true, destination_specific: true, destination_asset: true, destination_location: true, destination_sequence: true,
        assigned_recipient: true, approver: true,
        workflow_version_ref: true,
        current_workflow_step: { include: { assignee: true } },
        workflow_steps: { orderBy: { sequence: "asc" }, include: { assignee: true, assigned_role: true, actor: true, history: { orderBy: { created_at: "asc" } } } },
        history: { orderBy: { created_at: "asc" } },
      },
      orderBy: { updated_at: "desc" },
    });
  }

  listPending(actor: AuthenticatedUser) {
    return this.prisma.hardcopyTransferRequest.findMany({
      where: {
        OR: [
          {
            status: HardcopyTransferStatus.ForApproval,
            workflow_steps: { some: { assigned_user_id: toBigIntId(actor.user_id, "current_user_id"), status: HardcopyTransferWorkflowStepStatus.PENDING } },
          },
          {
            status: HardcopyTransferStatus.ForApproval,
            workflow_version_id: null,
            approver_user_id: toBigIntId(actor.user_id, "current_user_id"),
          },
        ],
      },
      include: {
        document: { include: { hardcopy: { include: { area: true, specific: true, asset: true, location: true, sequence: true } } } },
        from_area: true, from_specific: true, from_asset: true, from_location: true, from_sequence: true,
        destination_area: true, destination_specific: true, destination_asset: true, destination_location: true, destination_sequence: true,
        requester: true, assigned_recipient: true, approver: true,
        current_workflow_step: { include: { assignee: true } },
        workflow_steps: { orderBy: { sequence: "asc" }, include: { assignee: true, assigned_role: true, actor: true } },
      },
      orderBy: { created_at: "asc" },
    });
  }

  async submit(id: string, actor: AuthenticatedUser) {
    this.assertActorPermission(actor, "hardcopy-transfers.create");
    const transferId = toBigIntId(id, "transfer_request_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.hardcopyTransferRequest.findUnique({
        where: { transfer_request_id: transferId },
        include: { workflow_steps: { orderBy: { sequence: "asc" } } },
      });
      if (!transfer) throw new NotFoundException("Hardcopy transfer request not found.");
      if (transfer.requested_by_user_id !== actorId) throw new ForbiddenException("Only the transfer requester can submit this transfer.");
      if (transfer.status !== HardcopyTransferStatus.Draft) throw new ConflictException(`Cannot move a ${transfer.status} transfer to ${HardcopyTransferStatus.ForApproval}.`);
      if (transfer.workflow_steps.length) throw new ConflictException("This transfer already has a workflow route.");

      const version = await tx.workflowVersion.findFirst({
        where: {
          status: "PUBLISHED",
          workflow_definition: { workflow_key: "system-hardcopy-transfer", is_active: true },
        },
        orderBy: { version_number: "desc" },
        include: { workflow_definition: true },
      });
      if (!version) throw new ConflictException("No published Hardcopy transfer workflow is configured.");
      const nodes = this.workflowNodesInOrder(version.graph as TransferWorkflowGraph);
      const usedAssigneeIds = new Set<bigint>();
      const resolved = [] as Array<{
        node: TransferWorkflowNode;
        assignedUserId: bigint;
        assignedRoleId: bigint | null;
        assignmentSource: string;
        userName: string;
        positionTitle: string | null;
      }>;
      for (const node of nodes) {
        const assignment = await this.resolveTransferAssignee(tx, node, actorId, usedAssigneeIds);
        usedAssigneeIds.add(assignment.assignedUserId);
        resolved.push({ node, ...assignment });
      }
      await tx.hardcopyTransferWorkflowStep.createMany({
        data: resolved.map(({ node, assignedUserId, assignedRoleId, assignmentSource, userName, positionTitle }, index) => ({
          transfer_request_id: transferId,
          node_key: node.key,
          sequence: index + 1,
          stage: node.stage || "CUSTOM",
          stage_label: node.label,
          assignment_type: node.assignment?.type || null,
          assignment_source: assignmentSource,
          assigned_user_id: assignedUserId,
          assigned_role_id: assignedRoleId,
          assigned_user_name_snapshot: userName,
          assigned_position_title_snapshot: positionTitle,
          status: index === 0 ? HardcopyTransferWorkflowStepStatus.PENDING : HardcopyTransferWorkflowStepStatus.QUEUED,
        })),
      });
      const firstStep = await tx.hardcopyTransferWorkflowStep.findFirst({
        where: { transfer_request_id: transferId },
        orderBy: { sequence: "asc" },
      });
      if (!firstStep) throw new ConflictException("The published Hardcopy transfer workflow has no approval steps.");
      const updated = await tx.hardcopyTransferRequest.update({
        where: { transfer_request_id: transferId },
        data: {
          status: HardcopyTransferStatus.ForApproval,
          workflow_version_id: version.workflow_version_id,
          workflow_version: version.version_number,
          workflow_name: version.workflow_definition.name,
          workflow_snapshot: version.graph as Prisma.InputJsonValue,
          current_workflow_step_id: firstStep.workflow_step_id,
          approver_user_id: firstStep.assigned_user_id,
        },
      });
      await this.recordHistory(tx, transferId, transfer.status, updated.status, "submit", actor);
      await this.recordWorkflowHistory(tx, firstStep.workflow_step_id, null, HardcopyTransferWorkflowStepStatus.PENDING, "assign", actor);
      return updated;
    });
  }

  async approve(id: string, actor: AuthenticatedUser, comments?: string) {
    return this.review(id, actor, HardcopyTransferStatus.Approved, "approve", comments);
  }

  async returnForCorrection(id: string, actor: AuthenticatedUser, comments?: string) {
    if (!comments?.trim()) throw new BadRequestException("Explain what must be corrected before returning the transfer.");
    return this.review(id, actor, HardcopyTransferStatus.Returned, "return", comments);
  }

  async reject(id: string, actor: AuthenticatedUser, comments?: string) {
    if (!comments?.trim()) throw new BadRequestException("Explain why the transfer is being rejected.");
    return this.review(id, actor, HardcopyTransferStatus.Rejected, "reject", comments);
  }

  async resubmit(id: string, actor: AuthenticatedUser) {
    this.assertActorPermission(actor, "hardcopy-transfers.create");
    const transferId = toBigIntId(id, "transfer_request_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.hardcopyTransferRequest.findUnique({
        where: { transfer_request_id: transferId },
        include: { workflow_steps: { orderBy: { sequence: "asc" } } },
      });
      if (!transfer) throw new NotFoundException("Hardcopy transfer request not found.");
      if (transfer.requested_by_user_id !== actorId) throw new ForbiddenException("Only the transfer requester can resubmit this transfer.");
      if (transfer.status !== HardcopyTransferStatus.Returned) throw new ConflictException(`Cannot resubmit a ${transfer.status} transfer.`);
      if (!transfer.workflow_steps.length) return this.changeStatusInTransaction(tx, transfer, HardcopyTransferStatus.ForApproval, "resubmit", actor);
      const firstStep = transfer.workflow_steps[0];
      await tx.hardcopyTransferWorkflowStep.updateMany({
        where: { transfer_request_id: transferId },
        data: { status: HardcopyTransferWorkflowStepStatus.QUEUED, decision: null, comments: null, acted_by_user_id: null, acted_at: null },
      });
      await tx.hardcopyTransferWorkflowStep.update({ where: { workflow_step_id: firstStep.workflow_step_id }, data: { status: HardcopyTransferWorkflowStepStatus.PENDING } });
      const updated = await tx.hardcopyTransferRequest.update({
        where: { transfer_request_id: transferId },
        data: { status: HardcopyTransferStatus.ForApproval, current_workflow_step_id: firstStep.workflow_step_id, approver_user_id: firstStep.assigned_user_id },
      });
      await this.recordHistory(tx, transferId, transfer.status, updated.status, "resubmit", actor);
      await this.recordWorkflowHistory(tx, firstStep.workflow_step_id, HardcopyTransferWorkflowStepStatus.RETURNED, HardcopyTransferWorkflowStepStatus.PENDING, "resubmit", actor);
      return updated;
    });
  }

  async cancel(id: string, actor: AuthenticatedUser, comments?: string) {
    this.assertActorPermission(actor, "hardcopy-transfers.create");
    const transferId = toBigIntId(id, "transfer_request_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.hardcopyTransferRequest.findUnique({ where: { transfer_request_id: transferId } });
      if (!transfer) throw new NotFoundException("Hardcopy transfer request not found.");
      if (transfer.requested_by_user_id !== actorId) throw new ForbiddenException("Only the transfer requester can cancel this transfer.");
      const cancellable = new Set<HardcopyTransferStatus>([
        HardcopyTransferStatus.Draft,
        HardcopyTransferStatus.ForApproval,
        HardcopyTransferStatus.Returned,
      ]);
      if (!cancellable.has(transfer.status)) {
        throw new ConflictException(`Cannot cancel a ${transfer.status} transfer.`);
      }
      const updated = await tx.hardcopyTransferRequest.update({ where: { transfer_request_id: transferId }, data: { status: HardcopyTransferStatus.Cancelled, comments: comments?.trim() || transfer.comments } });
      await this.recordHistory(tx, transferId, transfer.status, updated.status, "cancel", actor, comments);
      return updated;
    });
  }

  private async review(id: string, actor: AuthenticatedUser, next: HardcopyTransferStatus, action: "approve" | "return" | "reject", comments?: string) {
    this.assertActorPermission(actor, "hardcopy-transfers.approve");
    const transferId = toBigIntId(id, "transfer_request_id");
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.hardcopyTransferRequest.findUnique({
        where: { transfer_request_id: transferId },
        include: { workflow_steps: { orderBy: { sequence: "asc" } } },
      });
      if (!transfer) throw new NotFoundException("Hardcopy transfer request not found.");
      if (transfer.status !== HardcopyTransferStatus.ForApproval) throw new ConflictException("This transfer is not awaiting approval.");
      const actorId = toBigIntId(actor.user_id, "current_user_id");
      if (transfer.workflow_steps?.length) {
        const currentStep = transfer.workflow_steps.find((step) => step.status === HardcopyTransferWorkflowStepStatus.PENDING);
        if (!currentStep || transfer.current_workflow_step_id !== currentStep.workflow_step_id) {
          throw new ConflictException("This transfer has no current approval step.");
        }
        if (currentStep.assigned_user_id !== actorId) throw new ForbiddenException("You are not assigned to the current Hardcopy transfer approval step.");
        const stepStatus = action === "approve"
          ? HardcopyTransferWorkflowStepStatus.APPROVED
          : action === "return"
            ? HardcopyTransferWorkflowStepStatus.RETURNED
            : HardcopyTransferWorkflowStepStatus.REJECTED;
        await tx.hardcopyTransferWorkflowStep.update({
          where: { workflow_step_id: currentStep.workflow_step_id },
          data: { status: stepStatus, decision: action, comments: comments?.trim() || null, acted_by_user_id: actorId, acted_at: new Date() },
        });
        await this.recordWorkflowHistory(tx, currentStep.workflow_step_id, HardcopyTransferWorkflowStepStatus.PENDING, stepStatus, action, actor, comments);
        if (action === "approve") {
          const nextStep = transfer.workflow_steps.find((step) => step.sequence > currentStep.sequence && step.status === HardcopyTransferWorkflowStepStatus.QUEUED);
          if (nextStep) {
            await tx.hardcopyTransferWorkflowStep.update({ where: { workflow_step_id: nextStep.workflow_step_id }, data: { status: HardcopyTransferWorkflowStepStatus.PENDING } });
            const updated = await tx.hardcopyTransferRequest.update({
              where: { transfer_request_id: transferId },
              data: { current_workflow_step_id: nextStep.workflow_step_id, approver_user_id: nextStep.assigned_user_id, comments: comments?.trim() || transfer.comments },
            });
            await this.recordHistory(tx, transferId, transfer.status, updated.status, action, actor, comments);
            return updated;
          }
          const updated = await tx.hardcopyTransferRequest.update({
            where: { transfer_request_id: transferId },
            data: {
              status: HardcopyTransferStatus.ForTransfer,
              current_workflow_step_id: null,
              requested_by_user_id: transfer.requested_by_user_id,
              assigned_recipient_user_id: transfer.requested_by_user_id,
              approver_user_id: actorId,
              approval_date: new Date(),
              comments: comments?.trim() || transfer.comments,
            },
          });
          await this.recordHistory(tx, transferId, transfer.status, updated.status, action, actor, comments);
          return updated;
        }
        const updated = await tx.hardcopyTransferRequest.update({
          where: { transfer_request_id: transferId },
          data: { status: next, current_workflow_step_id: null, comments: comments?.trim() || transfer.comments },
        });
        await this.recordHistory(tx, transferId, transfer.status, updated.status, action, actor, comments);
        return updated;
      }
      if (transfer.approver_user_id !== actorId) throw new ForbiddenException("You are not the configured Hardcopy transfer approver.");
      const updated = await tx.hardcopyTransferRequest.update({ where: { transfer_request_id: transferId }, data: { status: next, ...(next === HardcopyTransferStatus.Approved ? { approval_date: new Date() } : {}), comments: comments?.trim() || transfer.comments } });
      await this.recordHistory(tx, transferId, transfer.status, updated.status, action, actor, comments);
      return updated;
    });
  }

  async markForTransfer(id: string, actor: AuthenticatedUser) {
    return this.changeStatus(id, HardcopyTransferStatus.Approved, HardcopyTransferStatus.ForTransfer, "for-transfer", actor);
  }

  async dispatch(id: string, actor: AuthenticatedUser) {
    return this.changeStatus(id, HardcopyTransferStatus.ForTransfer, HardcopyTransferStatus.Transferred, "transfer", actor, { transfer_date: new Date() });
  }

  async awaitAcceptance(id: string, actor: AuthenticatedUser) {
    return this.changeStatus(id, HardcopyTransferStatus.Transferred, HardcopyTransferStatus.PendingRecipientAcceptance, "await-recipient-acceptance", actor);
  }

  async complete(id: string, actor: AuthenticatedUser, comments?: string) {
    this.assertActorPermission(actor, "hardcopy-transfers.create");
    if (!comments?.trim()) throw new BadRequestException("Confirm how the hardcopy was physically transferred.");
    const transferId = toBigIntId(id, "transfer_request_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.hardcopyTransferRequest.findUnique({ where: { transfer_request_id: transferId } });
      if (!transfer) throw new NotFoundException("Hardcopy transfer request not found.");
      return this.completeInTransaction(tx, transfer, actor, comments);
    });
  }

  async accept(id: string, actor: AuthenticatedUser, comments?: string) {
    this.assertActorPermission(actor, "hardcopy-transfers.accept");
    const transferId = toBigIntId(id, "transfer_request_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.hardcopyTransferRequest.findUnique({ where: { transfer_request_id: transferId } });
      if (!transfer) throw new NotFoundException("Hardcopy transfer request not found.");
      if (transfer.status === HardcopyTransferStatus.ForTransfer) return this.completeInTransaction(tx, transfer, actor, comments);
      if (transfer.status !== HardcopyTransferStatus.PendingRecipientAcceptance || transfer.assigned_recipient_user_id !== actorId) {
        throw new ForbiddenException("Only the assigned recipient can accept a pending physical transfer.");
      }
      if (transfer.destination_area_id && transfer.destination_location_id) {
        await tx.hardcopyDocument.update({
          where: { hardcopy_id: transfer.hardcopy_id },
          data: {
            area_id: transfer.destination_area_id,
            specific_id: transfer.destination_specific_id,
            asset_id: transfer.destination_asset_id,
            location_id: transfer.destination_location_id,
            sequence_id: transfer.destination_sequence_id,
          },
        });
      }
      const updated = await tx.hardcopyTransferRequest.update({
        where: { transfer_request_id: transferId },
        data: { status: HardcopyTransferStatus.Completed, recipient_acceptance: RecipientAcceptanceStatus.ACCEPTED, accepted_by_user_id: actorId, acceptance_at: new Date(), current_holder: transfer.current_holder ?? transfer.transfer_to, comments: comments?.trim() || transfer.comments },
      });
      await this.recordHistory(tx, transferId, transfer.status, updated.status, "accept", actor, comments);
      return updated;
    });
  }

  private async completeInTransaction(
    tx: Prisma.TransactionClient,
    transfer: Prisma.HardcopyTransferRequestGetPayload<{}>,
    actor: AuthenticatedUser,
    comments?: string,
  ) {
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    if (transfer.requested_by_user_id !== actorId) throw new ForbiddenException("Only the transfer requester can complete the physical transfer.");
    if (transfer.status !== HardcopyTransferStatus.ForTransfer) throw new ConflictException(`Cannot complete a ${transfer.status} transfer.`);
    if (!comments?.trim()) throw new BadRequestException("Confirm how the hardcopy was physically transferred.");
    if (!transfer.destination_location_id) throw new ConflictException("A destination storage location is required before completing the transfer.");
    await tx.hardcopyDocument.update({
      where: { hardcopy_id: transfer.hardcopy_id },
      data: {
        area_id: transfer.destination_area_id ?? undefined,
        specific_id: transfer.destination_specific_id ?? undefined,
        asset_id: transfer.destination_asset_id ?? undefined,
        location_id: transfer.destination_location_id,
        sequence_id: transfer.destination_sequence_id ?? undefined,
      },
    });
    const updated = await tx.hardcopyTransferRequest.update({
      where: { transfer_request_id: transfer.transfer_request_id },
      data: {
        status: HardcopyTransferStatus.Completed,
        recipient_acceptance: RecipientAcceptanceStatus.ACCEPTED,
        accepted_by_user_id: actorId,
        acceptance_at: new Date(),
        transfer_date: new Date(),
        assigned_recipient_user_id: actorId,
        current_holder: transfer.transfer_to || transfer.current_holder,
        comments: comments.trim(),
      },
    });
    await this.recordHistory(tx, transfer.transfer_request_id, transfer.status, updated.status, "complete", actor, comments);
    return updated;
  }

  private async changeStatusInTransaction(
    tx: Prisma.TransactionClient,
    transfer: Prisma.HardcopyTransferRequestGetPayload<{}>,
    next: HardcopyTransferStatus,
    action: string,
    actor: AuthenticatedUser,
    extra: Prisma.HardcopyTransferRequestUpdateInput = {},
  ) {
    const updated = await tx.hardcopyTransferRequest.update({
      where: { transfer_request_id: transfer.transfer_request_id },
      data: { status: next, ...extra },
    });
    await this.recordHistory(tx, transfer.transfer_request_id, transfer.status, updated.status, action, actor);
    return updated;
  }

  private workflowNodesInOrder(graph: TransferWorkflowGraph) {
    if (!graph?.start_node_key || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new ConflictException("The published Hardcopy transfer workflow is invalid.");
    }
    const nodesByKey = new Map(graph.nodes.map((node) => [node.key, node]));
    const ordered: TransferWorkflowNode[] = [];
    const visited = new Set<string>();
    let currentKey = graph.start_node_key;
    while (true) {
      if (visited.has(currentKey)) throw new ConflictException("The published Hardcopy transfer workflow contains a cycle.");
      visited.add(currentKey);
      const current = nodesByKey.get(currentKey);
      if (!current) throw new ConflictException("The published Hardcopy transfer workflow references a missing step.");
      if (current.type === "END") break;
      if (current.type !== "APPROVAL" || !current.assignment) throw new ConflictException(`Workflow step ${current.label} is not an assigned approval step.`);
      ordered.push(current);
      const edge = graph.edges.find((candidate) => candidate.from === currentKey && candidate.outcome === "APPROVE");
      if (!edge) throw new ConflictException(`Workflow step ${current.label} has no approval route.`);
      currentKey = edge.to;
      if (ordered.length > graph.nodes.length) throw new ConflictException("The published Hardcopy transfer workflow is too long.");
    }
    if (!ordered.length) throw new ConflictException("The published Hardcopy transfer workflow has no approval steps.");
    return ordered;
  }

  private async resolveTransferAssignee(
    tx: Prisma.TransactionClient,
    node: TransferWorkflowNode,
    requesterId: bigint,
    usedAssigneeIds: Set<bigint>,
  ) {
    const assignment = node.assignment!;
    let user: { user_id: bigint; firstname: string; lastname: string; position_title: string | null; role_id?: bigint } | null = null;
    let assignedRoleId: bigint | null = null;
    let assignmentSource = `WORKFLOW_${assignment.type}`;
    if (assignment.type === "USER") {
      if (!assignment.user_id) throw new ConflictException(`Workflow step ${node.label} has no selected user.`);
      user = await tx.user.findUnique({
        where: { user_id: toBigIntId(assignment.user_id, "workflow_assigned_user_id") },
        select: { user_id: true, firstname: true, lastname: true, position_title: true, role_id: true },
      });
    } else if (assignment.type === "ROLE") {
      if (!assignment.role_id) throw new ConflictException(`Workflow step ${node.label} has no selected role.`);
      assignedRoleId = toBigIntId(assignment.role_id, "workflow_assigned_role_id");
      const users = await tx.user.findMany({
        where: { role_id: assignedRoleId },
        select: { user_id: true, firstname: true, lastname: true, position_title: true, role_id: true },
        orderBy: { user_id: "asc" },
      });
      user = users.find((candidate) => candidate.user_id !== requesterId && !usedAssigneeIds.has(candidate.user_id)) || null;
    } else if (assignment.type === "REQUESTER_LEADER") {
      const requester = await tx.user.findUnique({
        where: { user_id: requesterId },
        select: { leader: { select: { user_id: true, firstname: true, lastname: true, position_title: true, role_id: true } } },
      });
      user = requester?.leader || null;
      assignmentSource = "REQUESTER_LEADER";
    }
    if (!user) throw new ConflictException(`Workflow step ${node.label} does not have an eligible approver.`);
    if (user.user_id === requesterId) throw new ConflictException(`${node.label} cannot be assigned to the transfer requester.`);
    if (usedAssigneeIds.has(user.user_id)) throw new ConflictException(`${node.label} must be assigned to a different user from the previous transfer step.`);
    return {
      assignedUserId: user.user_id,
      assignedRoleId,
      assignmentSource,
      userName: [user.firstname, user.lastname].filter(Boolean).join(" ") || "Assigned reviewer",
      positionTitle: user.position_title || null,
    };
  }

  private async recordWorkflowHistory(
    tx: Prisma.TransactionClient,
    workflowStepId: bigint,
    previous: HardcopyTransferWorkflowStepStatus | null,
    next: HardcopyTransferWorkflowStepStatus,
    action: string,
    actor: AuthenticatedUser,
    comments?: string,
  ) {
    await tx.hardcopyTransferWorkflowStepHistory.create({
      data: {
        workflow_step_id: workflowStepId,
        previous_status: previous,
        new_status: next,
        action,
        performed_by_user_id: toBigIntId(actor.user_id, "current_user_id"),
        comments: comments?.trim() || null,
      },
    });
  }

  private async changeStatus(id: string, expected: HardcopyTransferStatus, next: HardcopyTransferStatus, action: string, actor: AuthenticatedUser, extra: Prisma.HardcopyTransferRequestUpdateInput = {}) {
    const isRequesterAction = action === "submit" || action === "resubmit";
    this.assertActorPermission(actor, isRequesterAction ? "hardcopy-transfers.create" : "hardcopy-transfers.dispatch");
    const transferId = toBigIntId(id, "transfer_request_id");
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.hardcopyTransferRequest.findUnique({ where: { transfer_request_id: transferId } });
      if (!transfer) throw new NotFoundException("Hardcopy transfer request not found.");
      if (transfer.status !== expected) throw new ConflictException(`Cannot move a ${transfer.status} transfer to ${next}.`);
      if (transfer.workflow_version_id) {
        throw new ConflictException("Workflow-managed transfers must follow the configured approval route and requester completion step.");
      }
      const actorId = toBigIntId(actor.user_id, "current_user_id");
      if (isRequesterAction && transfer.requested_by_user_id !== actorId) throw new ForbiddenException("Only the transfer requester can submit this transfer.");
      if (!isRequesterAction && !isAdministrativeRole(actor.role.role_name) && transfer.approver_user_id !== actorId) throw new ForbiddenException("You are not authorized to execute this transfer action.");
      const updated = await tx.hardcopyTransferRequest.update({ where: { transfer_request_id: transferId }, data: { status: next, ...extra } });
      await this.recordHistory(tx, transferId, transfer.status, updated.status, action, actor);
      return updated;
    });
  }

  private async recordHistory(tx: Prisma.TransactionClient, transferId: bigint, previous: HardcopyTransferStatus | null, next: HardcopyTransferStatus, action: string, actor: AuthenticatedUser, comments?: string) {
    await tx.hardcopyTransferHistory.create({ data: { transfer_request_id: transferId, previous_status: previous, new_status: next, action, performed_by_user_id: toBigIntId(actor.user_id, "current_user_id"), comments: comments?.trim() || null } });
  }

  private async findApproverId() {
    const user = await this.prisma.user.findFirst({ where: { role: { role_name: { in: ["Admin", "ADMIN", "Administrator", "DOCUMENT_CONTROLLER", "Documentation Officer", "Document Controller", "Document Controller Officer", "PLANT_MANAGER", "Plant Manager"] } } }, select: { user_id: true }, orderBy: { user_id: "asc" } });
    return user?.user_id ?? null;
  }

  private async resolveDestinationStorage(
    tx: Prisma.TransactionClient,
    dto: CreateHardcopyTransferDto,
  ) {
    const locationId = toBigIntId(dto.destination_location_id, "destination_location_id");
    const location = await tx.location.findUnique({
      where: { location_id: locationId },
      include: {
        specific: true,
        asset: { include: { specific: true } },
      },
    });
    if (!location || !location.is_active) {
      throw new BadRequestException("The destination storage location does not exist or is inactive.");
    }

    const requestedAssetId = dto.destination_asset_id
      ? toBigIntId(dto.destination_asset_id, "destination_asset_id")
      : null;
    const requestedSpecificId = dto.destination_specific_id
      ? toBigIntId(dto.destination_specific_id, "destination_specific_id")
      : null;
    const requestedAreaId = dto.destination_area_id
      ? toBigIntId(dto.destination_area_id, "destination_area_id")
      : null;
    const requestedSequenceId = dto.destination_sequence_id
      ? toBigIntId(dto.destination_sequence_id, "destination_sequence_id")
      : null;
    const selectedAsset = requestedAssetId
      ? await tx.assetNumber.findUnique({
          where: { asset_id: requestedAssetId },
          include: { specific: true },
        })
      : null;
    if (requestedAssetId && !selectedAsset) {
      throw new BadRequestException("The destination asset number does not exist.");
    }
    if (requestedSequenceId) {
      const sequence = await tx.sequence.findUnique({ where: { sequence_id: requestedSequenceId }, select: { sequence_id: true } });
      if (!sequence) throw new BadRequestException("The destination sequence does not exist.");
    }

    const locationAssetId = location.asset_id;
    if (locationAssetId && requestedAssetId && locationAssetId !== requestedAssetId) {
      throw new BadRequestException("The selected asset number is not assigned to the destination location.");
    }
    if (location.specific_id && selectedAsset?.specific_id && location.specific_id !== selectedAsset.specific_id) {
      throw new BadRequestException("The selected asset number does not match the destination classification.");
    }
    const assetId = locationAssetId ?? requestedAssetId;
    const specificId = location.asset?.specific_id ?? location.specific_id ?? selectedAsset?.specific_id ?? requestedSpecificId;
    const areaId = location.asset?.specific?.area_id ?? location.specific?.area_id ?? selectedAsset?.specific?.area_id ?? requestedAreaId;

    if (requestedAreaId && areaId !== requestedAreaId) {
      throw new BadRequestException("The destination Area does not match the selected storage classification.");
    }
    if (requestedSpecificId && specificId !== requestedSpecificId) {
      throw new BadRequestException("The destination Specific does not match the selected storage location.");
    }
    if (!specificId) {
      throw new BadRequestException("The destination storage location must have a Specific classification.");
    }

    return {
      area_id: areaId,
      specific_id: specificId,
      asset_id: assetId,
      location_id: locationId,
      sequence_id: requestedSequenceId,
    };
  }

  private assertActorPermission(actor: AuthenticatedUser, permission: string) {
    if (!hasPermission(actor, permission)) {
      throw new ForbiddenException("You do not have permission to perform this Hardcopy transfer action.");
    }
  }

  private async assertTransferApprover(approverId: bigint) {
    const approver = await this.prisma.user.findUnique({
      where: { user_id: approverId },
      select: {
        user_id: true,
        role: {
          select: {
            role_name: true,
            role_permissions: {
              select: { permission: { select: { permission_name: true } } },
            },
          },
        },
      },
    });
    if (!approver) throw new ConflictException("The configured Hardcopy approver no longer exists.");
    if (isAdministrativeRole(approver.role.role_name)) return;
    const permissions = new Set(approver.role.role_permissions.map((link) => link.permission.permission_name));
    if (!permissions.has("hardcopy-transfers.approve") || !permissions.has("hardcopy-transfers.dispatch")) {
      throw new ConflictException("The configured Hardcopy approver must have Hardcopy transfer approval and dispatch permissions.");
    }
  }
}
