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
import { rename, unlink } from "fs/promises";
import { join } from "path";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { isAdministrativeRole } from "../../../common/auth/administrative-role.util";
import { toBigIntId } from "../../../common/utils/prisma-id.util";
import { ensureRevisionCategoryUploadsRoot } from "../../../config/upload-paths";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { DocumentsService } from "./documents.service";
import { RequestReviewFileDto } from "./dto/request-review-file.dto";

@Injectable()
export class DocumentRequestReviewFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
  ) {}

  async attachReviewFile(
    documentIdValue: string,
    dto: RequestReviewFileDto,
    file: Express.Multer.File | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException(
        "Upload the Softcopy file that approvers will review.",
      );
    }

    const documentId = toBigIntId(documentIdValue, "document_id");
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    let storedFilePath = "";

    try {
      const document = await this.prisma.document.findUnique({
        where: { document_id: documentId },
        include: {
          assignments: { select: { user_id: true } },
          softcopy: { include: { category: true } },
        },
      });
      if (!document) throw new NotFoundException("Document request not found.");
      if (document.document_type !== DocumentType.SOFTCOPY || !document.softcopy) {
        throw new BadRequestException(
          "A request-review file can only be attached to a Softcopy Document Control Request.",
        );
      }
      if (!this.requiresReviewFile(document.action_requested)) {
        throw new ConflictException(
          "This Document Control Request action does not use a review Softcopy file.",
        );
      }

      const editableStatuses = new Set<DocumentStatus>([
        DocumentStatus.Draft,
        DocumentStatus.ForRevision,
        DocumentStatus.ReturnedForCorrection,
      ]);
      if (!editableStatuses.has(document.status)) {
        throw new ConflictException(
          "The review Softcopy can only be uploaded while the request is Draft or returned for revision.",
        );
      }

      const canEditAll =
        isAdministrativeRole(actor.role.role_name) ||
        actor.role.permissions.includes("documents.edit");
      const canManage =
        document.created_by === actorId ||
        document.assignments.some((assignment) => assignment.user_id === actorId);
      if (!canEditAll && !canManage) {
        throw new ForbiddenException(
          "You can only upload a review file to a Document Control Request you created or that is assigned to you.",
        );
      }

      const seriesNumber =
        dto.series_number?.trim() || document.softcopy.series_number?.trim();
      if (!document.softcopy.document_number?.trim()) {
        throw new BadRequestException(
          "Document Number is required before uploading the review Softcopy.",
        );
      }
      if (!seriesNumber) {
        throw new BadRequestException(
          "Series Number is required before uploading the review Softcopy.",
        );
      }

      const revisionNumber = await this.resolveRevisionNumber(
        document.softcopy.softcopy_id,
        dto.revision_number,
      );
      const categoryRoot = ensureRevisionCategoryUploadsRoot(
        document.softcopy.category.folder_name,
      );
      storedFilePath = join(categoryRoot, file.filename);
      await rename(file.path, storedFilePath);

      await this.prisma.$transaction(async (tx) => {
        await tx.documentRevision.updateMany({
          where: {
            softcopy_id: document.softcopy!.softcopy_id,
            approved_at: null,
            is_current: false,
          },
          data: { is_historical: true },
        });

        const effectiveDate = this.parseDate(
          dto.effective_date || dto.new_effective_date,
        );
        await tx.documentRevision.create({
          data: {
            revision_number: revisionNumber,
            reason_of_revision: dto.reason_of_revision?.trim() || null,
            effective_date: effectiveDate,
            page_number: dto.page_number?.trim() || null,
            series_number: seriesNumber,
            document_title: document.document_title,
            revision_level_from: dto.revision_level_from?.trim() || null,
            revision_level_to: dto.revision_level_to?.trim() || null,
            previous_effective_date: this.parseDate(dto.previous_effective_date),
            new_effective_date: this.parseDate(dto.new_effective_date),
            date_received:
              document.status === DocumentStatus.Draft
                ? null
                : document.date_received ?? new Date(),
            date_released: null,
            approval_date: null,
            file_name: file.originalname,
            file_path: storedFilePath,
            file_size: BigInt(file.size),
            mime_type: file.mimetype,
            softcopy_id: document.softcopy!.softcopy_id,
            uploaded_by: actorId,
            is_current: false,
            is_historical: false,
          },
        });

        if (document.softcopy!.series_number !== seriesNumber) {
          await tx.softcopyDocument.update({
            where: { softcopy_id: document.softcopy!.softcopy_id },
            data: { series_number: seriesNumber },
          });
        }
      });

      storedFilePath = "";
      return this.documentsService.findOne(documentIdValue);
    } catch (error) {
      const pathToRemove = storedFilePath || file.path;
      await unlink(pathToRemove).catch(() => undefined);
      throw error;
    }
  }

  async submitReview(
    documentIdValue: string,
    remarks: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const documentId = toBigIntId(documentIdValue, "document_id");
    const document = await this.prisma.document.findUnique({
      where: { document_id: documentId },
      select: { document_type: true, action_requested: true },
    });
    if (!document) throw new NotFoundException("Document request not found.");

    if (
      document.document_type === DocumentType.SOFTCOPY &&
      this.requiresReviewFile(document.action_requested)
    ) {
      await this.assertReviewFileReady(documentId);
    }

    return this.documentsService.transition(
      documentIdValue,
      actor.user_id,
      "submit",
      remarks,
      actor,
    );
  }

  async approveReview(
    documentIdValue: string,
    remarks: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const documentId = toBigIntId(documentIdValue, "document_id");
    const finalSoftcopyApproval = await this.isFinalSoftcopyApproval(
      documentId,
    );
    if (finalSoftcopyApproval) {
      await this.assertReviewFileReady(documentId);
    }

    const result = await this.documentsService.transition(
      documentIdValue,
      actor.user_id,
      "approve",
      remarks,
      actor,
    );

    if (
      finalSoftcopyApproval &&
      result?.status === DocumentStatus.Approved
    ) {
      await this.finalizeApprovedReviewFile(documentId, actor);
    }
    return result;
  }

  async completeReview(
    documentIdValue: string,
    remarks: string | undefined,
    actor: AuthenticatedUser,
  ) {
    const documentId = toBigIntId(documentIdValue, "document_id");
    const document = await this.prisma.document.findUnique({
      where: { document_id: documentId },
      include: {
        softcopy: { select: { current_revision_id: true } },
      },
    });
    if (!document) throw new NotFoundException("Document request not found.");

    if (
      document.status === DocumentStatus.Approved &&
      document.document_type === DocumentType.SOFTCOPY &&
      !document.softcopy?.current_revision_id
    ) {
      await this.assertReviewFileReady(documentId);
      await this.finalizeApprovedReviewFile(documentId, actor);
    }

    return this.documentsService.transition(
      documentIdValue,
      actor.user_id,
      "complete",
      remarks,
      actor,
    );
  }

  private async assertReviewFileReady(documentId: bigint) {
    const document = await this.prisma.document.findUnique({
      where: { document_id: documentId },
      include: {
        softcopy: {
          include: {
            revisions: {
              where: { approved_at: null, is_historical: false },
              orderBy: { created_at: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!document?.softcopy) {
      throw new ConflictException(
        "This Softcopy request does not have a storage record.",
      );
    }

    const revision = document.softcopy.revisions[0];
    if (!revision?.file_path) {
      throw new ConflictException(
        "Upload the new or revised Softcopy in the Document Request before submitting it for approval.",
      );
    }
    if (!document.softcopy.document_number?.trim()) {
      throw new ConflictException(
        "Document Number is required before this Softcopy can be submitted.",
      );
    }
    if (!revision.series_number?.trim()) {
      throw new ConflictException(
        "Series Number is required on the review Softcopy before submission.",
      );
    }
    return revision;
  }

  private async isFinalSoftcopyApproval(documentId: bigint) {
    const document = await this.prisma.document.findUnique({
      where: { document_id: documentId },
      include: { workflow_steps: { orderBy: { sequence: "asc" } } },
    });
    if (
      !document ||
      document.document_type !== DocumentType.SOFTCOPY ||
      !this.requiresReviewFile(document.action_requested)
    ) {
      return false;
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
    if (!pending) return false;

    if (document.workflow_version_id) {
      return !pending.on_approve_node_key;
    }
    return !document.workflow_steps.some(
      (step) =>
        step.sequence > pending.sequence &&
        (step.status === WorkflowStepStatus.QUEUED ||
          step.status === WorkflowStepStatus.PENDING),
    );
  }

  private async finalizeApprovedReviewFile(
    documentId: bigint,
    actor: AuthenticatedUser,
  ) {
    const actorId = toBigIntId(actor.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.findUnique({
        where: { document_id: documentId },
        include: {
          softcopy: {
            include: {
              current_revision: true,
              revisions: {
                where: { approved_at: null, is_historical: false },
                orderBy: { created_at: "desc" },
                take: 1,
              },
            },
          },
        },
      });
      if (!document?.softcopy) {
        throw new ConflictException("Softcopy storage record not found.");
      }

      const revision = document.softcopy.revisions[0];
      if (!revision) {
        if (document.softcopy.current_revision_id) return;
        throw new ConflictException(
          "The approved request does not have a review Softcopy to finalize.",
        );
      }
      if (
        !revision.file_path ||
        !revision.series_number?.trim() ||
        !document.softcopy.document_number?.trim()
      ) {
        throw new ConflictException(
          "Document Number, Revision Number, Series Number, Document Title, and the reviewed Softcopy file are required before final approval.",
        );
      }

      const now = new Date();
      if (
        document.softcopy.current_revision_id &&
        document.softcopy.current_revision_id !== revision.revision_id
      ) {
        await tx.documentRevision.update({
          where: { revision_id: document.softcopy.current_revision_id },
          data: { is_current: false, is_historical: true },
        });
      }
      await tx.documentRevision.updateMany({
        where: {
          softcopy_id: document.softcopy.softcopy_id,
          revision_id: { not: revision.revision_id },
          approved_at: null,
        },
        data: { is_current: false, is_historical: true },
      });
      await tx.documentRevision.update({
        where: { revision_id: revision.revision_id },
        data: {
          is_current: true,
          is_historical: false,
          approved_by_user_id: actorId,
          approved_at: now,
          approval_date: now,
          effective_date:
            revision.effective_date ??
            revision.new_effective_date ??
            document.new_effective_date ??
            now,
        },
      });
      await tx.softcopyDocument.update({
        where: { softcopy_id: document.softcopy.softcopy_id },
        data: { current_revision_id: revision.revision_id },
      });
    });
  }

  private async resolveRevisionNumber(
    softcopyId: bigint,
    requested?: string,
  ) {
    const preferred = requested?.trim();
    if (preferred) {
      const duplicate = await this.prisma.documentRevision.findFirst({
        where: { softcopy_id: softcopyId, revision_number: preferred },
        select: { revision_id: true },
      });
      if (!duplicate) return preferred;
    }

    const latest = await this.prisma.documentRevision.findFirst({
      where: { softcopy_id: softcopyId },
      orderBy: { revision_id: "desc" },
      select: { revision_number: true },
    });
    if (!latest) return preferred || "000";
    const numeric = Number(latest.revision_number);
    return (Number.isNaN(numeric) ? 0 : numeric + 1)
      .toString()
      .padStart(3, "0");
  }

  private requiresReviewFile(action: DocumentActionRequested) {
    return new Set<DocumentActionRequested>([
      DocumentActionRequested.CREATE,
      DocumentActionRequested.REVISE,
      DocumentActionRequested.CREATE_REVISE,
    ]).has(action);
  }

  private parseDate(value?: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("A supplied review-file date is invalid.");
    }
    return parsed;
  }
}
