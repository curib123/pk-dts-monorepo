import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DocumentActionRequested,
  DocumentStatus,
  DocumentType,
  WorkflowStepStatus,
} from "@prisma/client";
import { rename, rm, stat } from "fs/promises";
import { basename, isAbsolute, join } from "path";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { isAdministrativeRole } from "../../../common/auth/administrative-role.util";
import { toBigIntId } from "../../../common/utils/prisma-id.util";
import { PrismaService } from "../../../core/prisma/prisma.service";
import {
  buildRevisionPublicUrl,
  ensureRevisionCategoryUploadsRoot,
  revisionUploadsRoot,
} from "../../../config/upload-paths";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { CreateRevisionDto } from "./dto/create-revision.dto";
import { DocumentsService } from "./documents.service";
import { ElectronicDocumentStampService } from "./electronic-document-stamp.service";

type ProposalRevisionInput = {
  revisionNumber?: string | null;
  reason?: string | null;
  effectiveDate?: Date | null;
  pageNumber?: string | null;
  seriesNumber?: string | null;
  revisionLevelFrom?: string | null;
  revisionLevelTo?: string | null;
  previousEffectiveDate?: Date | null;
  newEffectiveDate?: Date | null;
};

@Injectable()
export class RequestTimeDocumentsService extends DocumentsService {
  constructor(
    private readonly requestPrisma: PrismaService,
    electronicDocumentStamp: ElectronicDocumentStampService,
  ) {
    super(requestPrisma, electronicDocumentStamp);
  }

  override async createRequest(
    dto: CreateDocumentDto,
    actorUserId: string,
    file?: Express.Multer.File,
    actor?: AuthenticatedUser,
  ) {
    const directCreate = dto.direct_create === true || dto.direct_create === "true";
    const proposalRequest =
      dto.document_type === DocumentType.SOFTCOPY &&
      !directCreate &&
      this.actionNeedsProposal(dto.action_requested);

    if (
      dto.document_type === DocumentType.SOFTCOPY &&
      !directCreate &&
      dto.action_requested === DocumentActionRequested.CANCELLATION &&
      file
    ) {
      throw new BadRequestException(
        "Cancellation requests do not accept a proposed revision file.",
      );
    }

    if (!proposalRequest) {
      return super.createRequest(dto, actorUserId, file, actor);
    }

    if (dto.action === "SUBMIT") {
      if (!file) {
        throw new BadRequestException(
          "A proposed Softcopy file is required before submitting a create or revision request.",
        );
      }
      this.assertProposalMetadata({
        effectiveDate: this.parseOptionalDate(dto.new_effective_date),
        pageNumber: dto.page_number,
        seriesNumber: dto.series_number,
      });
    }

    if (!file) {
      return super.createRequest(dto, actorUserId, undefined, actor);
    }

    // The core service intentionally rejects a file on a normal DCR. Persist the
    // request as a draft first, attach the candidate revision, then start the
    // existing workflow so every approver sees the exact submitted file.
    const requestedAction = dto.action ?? "DRAFT";
    const draft = await super.createRequest(
      { ...dto, action: "DRAFT" },
      actorUserId,
      undefined,
      actor,
    );
    if (!draft) return draft;

    const documentId = String(draft.document_id);
    await this.saveProposalRevision(documentId, actorUserId, file, {
      revisionNumber: dto.initial_revision_number,
      reason: dto.brief_description?.trim() || dto.proposed_change?.trim() || null,
      effectiveDate: this.parseOptionalDate(dto.new_effective_date),
      pageNumber: dto.page_number,
      seriesNumber: dto.series_number,
      revisionLevelFrom: dto.revision_level_from,
      revisionLevelTo: dto.revision_level_to,
      previousEffectiveDate: this.parseOptionalDate(dto.previous_effective_date),
      newEffectiveDate: this.parseOptionalDate(dto.new_effective_date),
    });

    if (requestedAction === "SUBMIT") {
      await this.markProposalReceived(documentId);
      await super.transition(documentId, actorUserId, "submit", undefined, actor);
    }

    return super.findOne(documentId, actor);
  }

  override async createRevision(
    documentIdValue: string,
    dto: CreateRevisionDto,
    file?: Express.Multer.File,
    actor?: AuthenticatedUser,
  ) {
    const documentId = toBigIntId(documentIdValue, "document_id");
    const document = await this.requestPrisma.document.findUnique({
      where: { document_id: documentId },
      include: {
        assignments: { select: { user_id: true } },
        softcopy: {
          include: {
            category: true,
            revisions: { orderBy: { created_at: "desc" } },
          },
        },
      },
    });
    if (!document) return null;

    const requestEditingStatuses = new Set<DocumentStatus>([
      DocumentStatus.Draft,
      DocumentStatus.ForRevision,
      DocumentStatus.ReturnedForCorrection,
    ]);
    if (!requestEditingStatuses.has(document.status)) {
      return super.createRevision(documentIdValue, dto, file, actor);
    }
    if (!file) {
      throw new BadRequestException("A proposed Softcopy file is required.");
    }
    if (document.document_type !== DocumentType.SOFTCOPY || !document.softcopy) {
      throw new BadRequestException(
        "Proposed revisions can only be uploaded for Softcopy documents.",
      );
    }
    if (!actor) {
      throw new ForbiddenException(
        "An authenticated request owner is required to upload a proposed revision.",
      );
    }

    this.assertCanManageRequest(document, actor);
    const effectiveDate = dto.effective_date ?? dto.new_effective_date ?? null;
    const seriesNumber = dto.series_number?.trim() || document.softcopy.series_number;
    this.assertProposalMetadata({
      effectiveDate,
      pageNumber: dto.page_number,
      seriesNumber,
    });

    const revision = await this.saveProposalRevision(
      documentIdValue,
      actor.user_id,
      file,
      {
        revisionNumber: dto.revision_number,
        reason: dto.reason_of_revision,
        effectiveDate,
        pageNumber: dto.page_number,
        seriesNumber,
        revisionLevelFrom: dto.revision_level_from,
        revisionLevelTo: dto.revision_level_to,
        previousEffectiveDate: dto.previous_effective_date,
        newEffectiveDate: dto.new_effective_date ?? effectiveDate,
      },
    );

    return this.withProposalUrl(revision);
  }

  override async transition(
    id: string,
    actorUserId: string,
    action:
      | "submit"
      | "approve"
      | "request-revision"
      | "reject"
      | "cancel"
      | "complete",
    remarks?: string,
    actor?: AuthenticatedUser,
  ) {
    if (action === "submit") {
      await this.assertProposalExistsBeforeSubmit(id);
      await this.markProposalReceived(id);
    }
    if (action === "approve") {
      await this.preflightFinalSoftcopyApproval(id);
    }

    const transitioned = await super.transition(
      id,
      actorUserId,
      action,
      remarks,
      actor,
    );

    if (action === "approve" && transitioned?.status === DocumentStatus.Approved) {
      await this.promotePendingProposal(
        toBigIntId(id, "document_id"),
        toBigIntId(actorUserId, "current_user_id"),
      );
      return super.findOne(id, actor);
    }

    return transitioned;
  }

  // The review dialog currently asks the controlled/uncontrolled endpoints for
  // Office/PDF previews. Until the candidate is approved, return the original
  // bytes so reviewers inspect the exact submitted proposal without a stamp.
  override async getStampedRevision(
    documentIdValue: string,
    revisionIdValue: string,
    user: AuthenticatedUser,
  ) {
    const pending = await this.pendingRawRevision(
      documentIdValue,
      revisionIdValue,
      user,
    );
    return pending ?? super.getStampedRevision(documentIdValue, revisionIdValue, user);
  }

  override async getUncontrolledRevision(
    documentIdValue: string,
    revisionIdValue: string,
    user: AuthenticatedUser,
  ) {
    const pending = await this.pendingRawRevision(
      documentIdValue,
      revisionIdValue,
      user,
    );
    return pending ?? super.getUncontrolledRevision(documentIdValue, revisionIdValue, user);
  }

  private actionNeedsProposal(action?: DocumentActionRequested | null) {
    return (action ?? DocumentActionRequested.CREATE) !== DocumentActionRequested.CANCELLATION;
  }

  private assertProposalMetadata(input: {
    effectiveDate?: Date | null;
    pageNumber?: string | null;
    seriesNumber?: string | null;
  }) {
    if (!input.seriesNumber?.trim()) {
      throw new BadRequestException(
        "Series Number is required for the proposed Softcopy file.",
      );
    }
    if (!input.pageNumber?.trim()) {
      throw new BadRequestException(
        "Page Number is required for the proposed Softcopy file.",
      );
    }
    if (!input.effectiveDate) {
      throw new BadRequestException(
        "Effective Date is required for the proposed Softcopy file.",
      );
    }
  }

  private async assertProposalExistsBeforeSubmit(documentIdValue: string) {
    const document = await this.requestPrisma.document.findUnique({
      where: { document_id: toBigIntId(documentIdValue, "document_id") },
      include: {
        softcopy: {
          include: { revisions: { orderBy: { created_at: "desc" } } },
        },
      },
    });
    if (
      !document ||
      document.document_type !== DocumentType.SOFTCOPY ||
      !this.actionNeedsProposal(document.action_requested)
    ) {
      return;
    }
    this.assertReadyProposal(document);
  }

  private async preflightFinalSoftcopyApproval(documentIdValue: string) {
    const document = await this.requestPrisma.document.findUnique({
      where: { document_id: toBigIntId(documentIdValue, "document_id") },
      include: {
        workflow_steps: { orderBy: { sequence: "asc" } },
        softcopy: {
          include: { revisions: { orderBy: { created_at: "desc" } } },
        },
      },
    });
    if (
      !document ||
      document.document_type !== DocumentType.SOFTCOPY ||
      !this.actionNeedsProposal(document.action_requested)
    ) {
      return;
    }

    const pending =
      document.workflow_steps.find(
        (step) =>
          step.status === WorkflowStepStatus.PENDING &&
          (!document.workflow_current_node_key ||
            step.node_key === document.workflow_current_node_key),
      ) ??
      document.workflow_steps.find(
        (step) => step.status === WorkflowStepStatus.PENDING,
      );
    if (!pending) return;

    const configuredNext = pending.on_approve_node_key
      ? document.workflow_steps.find(
          (step) => step.node_key === pending.on_approve_node_key,
        )
      : undefined;
    const legacyNext =
      !document.workflow_version_id &&
      document.workflow_steps.find(
        (step) =>
          step.sequence > pending.sequence &&
          [WorkflowStepStatus.QUEUED, WorkflowStepStatus.PENDING].includes(step.status),
      );
    if (!configuredNext && !legacyNext) this.assertReadyProposal(document);
  }

  private assertReadyProposal(document: any) {
    const proposal = this.pendingProposal(document.softcopy?.revisions ?? []);
    if (!proposal) {
      throw new ConflictException(
        "A proposed Softcopy file must be uploaded before this request can continue.",
      );
    }
    if (
      !document.softcopy?.document_number ||
      !proposal.file_path ||
      !proposal.document_title ||
      !proposal.series_number ||
      !proposal.page_number ||
      !proposal.effective_date
    ) {
      throw new ConflictException(
        "The proposed Softcopy requires Document Number, Revision Number, Effective Date, Series Number, Page Number, Document Title, and the uploaded file before approval.",
      );
    }
  }

  private assertCanManageRequest(document: any, actor: AuthenticatedUser) {
    if (
      isAdministrativeRole(actor.role.role_name) ||
      actor.role.permissions.includes("documents.edit")
    ) {
      return;
    }
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    if (
      document.created_by === actorId ||
      document.assignments?.some(
        (assignment: { user_id: bigint }) => assignment.user_id === actorId,
      )
    ) {
      return;
    }
    throw new ForbiddenException(
      "Staff can only upload a proposed revision for documents they created or that are assigned to them.",
    );
  }

  private pendingProposal(revisions: any[]) {
    return revisions.find(
      (revision) =>
        !revision.approved_at &&
        !revision.is_current &&
        !revision.is_historical,
    );
  }

  private nextRevisionNumber(revisions: any[]) {
    const numeric = revisions
      .map((revision) => String(revision.revision_number ?? "").trim())
      .filter((value) => /^\d+$/.test(value))
      .map(Number);
    return numeric.length
      ? String(Math.max(...numeric) + 1).padStart(3, "0")
      : "000";
  }

  private async saveProposalRevision(
    documentIdValue: string,
    uploaderUserId: string,
    file: Express.Multer.File,
    input: ProposalRevisionInput,
  ) {
    const document = await this.requestPrisma.document.findUnique({
      where: { document_id: toBigIntId(documentIdValue, "document_id") },
      include: {
        softcopy: {
          include: {
            category: true,
            revisions: { orderBy: { created_at: "desc" } },
          },
        },
      },
    });
    if (!document) throw new NotFoundException("Document not found.");
    if (document.document_type !== DocumentType.SOFTCOPY || !document.softcopy) {
      throw new BadRequestException(
        "A proposed revision can only be stored for a Softcopy document.",
      );
    }

    const pending = this.pendingProposal(document.softcopy.revisions);
    const revisionNumber =
      input.revisionNumber?.trim() ||
      pending?.revision_number ||
      this.nextRevisionNumber(document.softcopy.revisions);
    if (
      document.softcopy.revisions.some(
        (revision) =>
          revision.revision_number === revisionNumber &&
          revision.revision_id !== pending?.revision_id,
      )
    ) {
      throw new ConflictException(
        `Revision ${revisionNumber} already exists for this document.`,
      );
    }

    const storedFilePath = await this.moveProposalUpload(
      file,
      document.softcopy.category.folder_name,
    );
    const data = {
      revision_number: revisionNumber,
      reason_of_revision: input.reason?.trim() || null,
      effective_date: input.effectiveDate ?? null,
      page_number: input.pageNumber?.trim() || null,
      series_number:
        input.seriesNumber?.trim() || document.softcopy.series_number || null,
      document_title: document.document_title,
      revision_level_from: input.revisionLevelFrom?.trim() || null,
      revision_level_to: input.revisionLevelTo?.trim() || null,
      previous_effective_date: input.previousEffectiveDate ?? null,
      new_effective_date: input.newEffectiveDate ?? input.effectiveDate ?? null,
      date_received:
        document.status === DocumentStatus.Draft ? null : new Date(),
      date_released: null,
      approval_date: null,
      is_current: false,
      is_historical: false,
      approved_by_user_id: null,
      approved_at: null,
      file_name: file.originalname,
      file_path: storedFilePath,
      file_size: BigInt(file.size),
      mime_type: file.mimetype,
      uploaded_by: toBigIntId(uploaderUserId, "uploaded_by"),
    };

    if (pending) {
      const previousFilePath = pending.file_path;
      const revision = await this.requestPrisma.documentRevision.update({
        where: { revision_id: pending.revision_id },
        data,
      });
      if (previousFilePath && previousFilePath !== storedFilePath) {
        void this.removeProposalFile(previousFilePath);
      }
      return revision;
    }

    return this.requestPrisma.documentRevision.create({
      data: { ...data, softcopy_id: document.softcopy.softcopy_id },
    });
  }

  private async markProposalReceived(documentIdValue: string) {
    const document = await this.requestPrisma.document.findUnique({
      where: { document_id: toBigIntId(documentIdValue, "document_id") },
      include: {
        softcopy: {
          include: { revisions: { orderBy: { created_at: "desc" } } },
        },
      },
    });
    const proposal = this.pendingProposal(document?.softcopy?.revisions ?? []);
    if (proposal && !proposal.date_received) {
      await this.requestPrisma.documentRevision.update({
        where: { revision_id: proposal.revision_id },
        data: { date_received: new Date() },
      });
    }
  }

  private async moveProposalUpload(file: Express.Multer.File, folderName: string) {
    const categoryRoot = ensureRevisionCategoryUploadsRoot(folderName);
    const storedName = file.filename || basename(file.path || file.originalname);
    const destinationPath = join(categoryRoot, storedName);
    if (file.path && file.path !== destinationPath) {
      await rename(file.path, destinationPath);
    }
    // Match the core revision storage convention: persist the absolute path so
    // its URL serializer can retain the category folder.
    return destinationPath;
  }

  private async removeProposalFile(storagePath: string) {
    const filePath = isAbsolute(storagePath)
      ? storagePath
      : join(revisionUploadsRoot, storagePath);
    await rm(filePath, { force: true }).catch(() => undefined);
  }

  private async promotePendingProposal(documentId: bigint, approverId: bigint) {
    await this.requestPrisma.$transaction(async (tx) => {
      const document = await tx.document.findUnique({
        where: { document_id: documentId },
        include: {
          softcopy: {
            include: { revisions: { orderBy: { created_at: "desc" } } },
          },
        },
      });
      if (
        !document ||
        document.document_type !== DocumentType.SOFTCOPY ||
        !this.actionNeedsProposal(document.action_requested)
      ) {
        return;
      }

      this.assertReadyProposal(document);
      const proposal = this.pendingProposal(document.softcopy!.revisions)!;
      const now = new Date();
      if (
        document.softcopy!.current_revision_id &&
        document.softcopy!.current_revision_id !== proposal.revision_id
      ) {
        await tx.documentRevision.update({
          where: { revision_id: document.softcopy!.current_revision_id },
          data: { is_current: false, is_historical: true },
        });
      }
      await tx.documentRevision.update({
        where: { revision_id: proposal.revision_id },
        data: {
          is_current: true,
          is_historical: false,
          approved_by_user_id: approverId,
          approved_at: now,
          approval_date: now,
        },
      });
      await tx.softcopyDocument.update({
        where: { softcopy_id: document.softcopy!.softcopy_id },
        data: { current_revision_id: proposal.revision_id },
      });
    });
  }

  private async pendingRawRevision(
    documentIdValue: string,
    revisionIdValue: string,
    user: AuthenticatedUser,
  ) {
    const assignedDocument = await super.findOne(documentIdValue, user);
    if (!assignedDocument) {
      // Workflow assignees may review a request without being a permanent
      // document assignment. Reuse the approval-queue authorization in that case.
      await super.findApprovalDocument(documentIdValue, user);
    }

    const revision = await this.requestPrisma.documentRevision.findFirst({
      where: {
        revision_id: toBigIntId(revisionIdValue, "revision_id"),
        softcopy: {
          document_id: toBigIntId(documentIdValue, "document_id"),
        },
      },
      select: {
        revision_id: true,
        file_name: true,
        file_path: true,
        file_size: true,
        mime_type: true,
        approved_at: true,
        is_current: true,
        is_historical: true,
      },
    });
    if (
      !revision ||
      revision.approved_at ||
      revision.is_current ||
      revision.is_historical
    ) {
      return null;
    }

    const filePath = isAbsolute(revision.file_path)
      ? revision.file_path
      : join(revisionUploadsRoot, revision.file_path);
    const fileStat = await stat(filePath);
    return {
      filePath,
      filename: revision.file_name,
      mimeType: revision.mime_type || "application/octet-stream",
      fileSize: Number(revision.file_size ?? BigInt(fileStat.size)),
    };
  }

  private parseOptionalDate(value?: string | Date | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private withProposalUrl<T extends { file_path?: string | null }>(revision: T) {
    if (!revision.file_path) return revision;
    const normalized = revision.file_path.replace(/\\/g, "/");
    const marker = "/uploads/revisions/";
    const markerIndex = normalized.toLowerCase().lastIndexOf(marker);
    const storagePath = markerIndex >= 0
      ? normalized.slice(markerIndex + marker.length)
      : normalized;
    return {
      ...revision,
      file_url: buildRevisionPublicUrl(storagePath),
    };
  }
}
