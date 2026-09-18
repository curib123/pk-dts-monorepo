import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DocumentAccessRequestStatus,
  DocumentStatus,
  Prisma,
} from "@prisma/client";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { hasPermission } from "../../../common/auth/document-workflow-permissions";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { toBigIntId } from "../../../common/utils/prisma-id.util";
import {
  getPagination,
  paginatedResponse,
} from "../../../common/utils/pagination.util";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { AccessRequestCatalogQueryDto } from "./dto/access-request-catalog-query.dto";
import { CreateDocumentAccessRequestDto } from "./dto/create-document-access-request.dto";
import { ReviewDocumentAccessRequestDto } from "./dto/review-document-access-request.dto";

const CATALOG_SELECT = {
  document_id: true,
  document_title: true,
  document_type: true,
  status: true,
  hardcopy: {
    select: {
      area: { select: { area_name: true } },
      location: { select: { location_name: true } },
    },
  },
  softcopy: {
    select: {
      document_number: true,
      category: { select: { category_name: true, folder_name: true } },
    },
  },
} satisfies Prisma.DocumentSelect;

const REQUEST_INCLUDE = {
  document: { select: CATALOG_SELECT },
  requester: {
    select: {
      user_id: true,
      firstname: true,
      lastname: true,
      username: true,
      position_title: true,
    },
  },
  reviewer: {
    select: { user_id: true, firstname: true, lastname: true, username: true },
  },
  approver: {
    select: { user_id: true, firstname: true, lastname: true, username: true },
  },
  history: {
    orderBy: { created_at: "asc" },
    include: { actor: { select: { user_id: true, firstname: true, lastname: true, username: true } } },
  },
} satisfies Prisma.DocumentAccessRequestInclude;

@Injectable()
export class DocumentAccessRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(query: AccessRequestCatalogQueryDto, user: AuthenticatedUser) {
    const { page, limit, skip, take } = getPagination(query);
    const userId = toBigIntId(user.user_id, "current_user_id");
    const term = query.query?.trim();
    const textFilter = term ? this.containsText(term) : undefined;
    const locationId = query.location_id
      ? toBigIntId(query.location_id, "location_id")
      : undefined;
    const where: Prisma.DocumentWhereInput = {
      status: { in: [DocumentStatus.Approved, DocumentStatus.Completed] },
      document_type: query.type,
      assignments: { none: { user_id: userId } },
      hardcopy: locationId ? { location_id: locationId } : undefined,
      ...(term
        ? {
            OR: [
              { document_title: textFilter },
              { softcopy: { is: { document_number: textFilter } } },
            ],
          }
        : {}),
    };

    const [documents, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip,
        take,
        select: {
          ...CATALOG_SELECT,
          access_requests: {
            where: { requested_by_user_id: userId },
            orderBy: { created_at: "desc" },
            take: 1,
            select: {
              access_request_id: true,
              status: true,
              request_reason: true,
              reviewer_remarks: true,
              created_at: true,
              reviewed_at: true,
            },
          },
        },
        orderBy: [{ updated_at: "desc" }, { document_id: "desc" }],
      }),
      this.prisma.document.count({ where }),
    ]);

    return paginatedResponse(
      documents.map(({ access_requests, ...document }) => ({
        ...document,
        document_number:
          document.document_type === "SOFTCOPY"
            ? document.softcopy?.document_number ?? null
            : null,
        access_request: access_requests[0] ?? null,
      })),
      total,
      page,
      limit,
    );
  }

  async locations() {
    return this.prisma.location.findMany({
      where: {
        is_active: true,
        hardcopies: { some: { document: { status: { in: [DocumentStatus.Approved, DocumentStatus.Completed] } } } },
      },
      select: {
        location_id: true,
        location_name: true,
        location_code: true,
      },
      orderBy: { location_name: "asc" },
    });
  }

  async create(dto: CreateDocumentAccessRequestDto, user: AuthenticatedUser) {
    this.assertPermission(user, "document-access-requests.create");
    const requestReason = dto.request_reason?.trim();
    if (!requestReason) {
      throw new BadRequestException(
        "A reason is required to request document access.",
      );
    }
    const userId = toBigIntId(user.user_id, "current_user_id");
    const documentId = toBigIntId(dto.document_id, "document_id");
    const [document, assignment, pending] = await Promise.all([
      this.prisma.document.findFirst({
        where: { document_id: documentId, status: { in: [DocumentStatus.Approved, DocumentStatus.Completed] } },
        select: { document_id: true, approver_configuration: true },
      }),
      this.prisma.documentAssignment.findUnique({
        where: { document_id_user_id: { document_id: documentId, user_id: userId } },
        select: { document_assignment_id: true },
      }),
      this.prisma.documentAccessRequest.findFirst({
        where: {
          document_id: documentId,
          requested_by_user_id: userId,
          status: { in: [DocumentAccessRequestStatus.PENDING, DocumentAccessRequestStatus.ForAccessApproval] },
        },
        select: { access_request_id: true },
      }),
    ]);

    if (!document)
      throw new NotFoundException("The approved document was not found.");
    let approverId = document.approver_configuration?.access_approver_user_id
      ?? document.approver_configuration?.document_owner_user_id;
    let approvalStage = "DOCUMENT_CONFIGURED_APPROVER";
    if (!approverId) {
      const fallbackApprover = await this.prisma.user.findFirst({
        where: {
          user_id: { not: userId },
          role: {
            role_permissions: {
              some: {
                permission: { permission_name: "document-access-requests.approve" },
              },
            },
          },
        },
        select: { user_id: true },
        orderBy: { user_id: "asc" },
      });
      approverId = fallbackApprover?.user_id;
      approvalStage = "DOCUMENT_ACCESS_APPROVER";
    }
    if (!approverId) {
      throw new ConflictException("An authorized document access approver is not configured.");
    }
    if (assignment)
      throw new ConflictException("This document is already assigned to you.");
    if (pending)
      throw new ConflictException("You already have a pending access request for this document.");

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.documentAccessRequest.create({
        data: {
          document_id: documentId,
          requested_by_user_id: userId,
          request_reason: requestReason,
          status: DocumentAccessRequestStatus.ForAccessApproval,
          approver_user_id: approverId,
          approval_stage: approvalStage,
        },
        include: REQUEST_INCLUDE,
      });
      await this.recordHistory(tx, created.access_request_id, null, DocumentAccessRequestStatus.ForAccessApproval, "create", userId, requestReason);
      return created;
    });
  }

  async mine(query: PaginationQueryDto, user: AuthenticatedUser) {
    const { page, limit, skip, take } = getPagination(query);
    const where = {
      requested_by_user_id: toBigIntId(user.user_id, "current_user_id"),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentAccessRequest.findMany({
        where,
        skip,
        take,
        include: REQUEST_INCLUDE,
        orderBy: { created_at: "desc" },
      }),
      this.prisma.documentAccessRequest.count({ where }),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async cancel(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, "document-access-requests.cancel-own");
    const requestId = toBigIntId(id, "access_request_id");
    const userId = toBigIntId(user.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.documentAccessRequest.findFirst({
        where: { access_request_id: requestId, requested_by_user_id: userId },
        select: { access_request_id: true, status: true },
      });
      if (!request) throw new NotFoundException("Your document access request was not found.");
      const cancellableStatuses = new Set<DocumentAccessRequestStatus>([
        DocumentAccessRequestStatus.PENDING,
        DocumentAccessRequestStatus.ForAccessApproval,
      ]);
      if (!cancellableStatuses.has(request.status)) throw new ConflictException("Only pending access requests can be cancelled.");
      const cancelled = await tx.documentAccessRequest.updateMany({
        where: { access_request_id: requestId, requested_by_user_id: userId, status: { in: [DocumentAccessRequestStatus.PENDING, DocumentAccessRequestStatus.ForAccessApproval] } },
        data: { status: DocumentAccessRequestStatus.CANCELLED },
      });
      if (cancelled.count !== 1) throw new ConflictException("This access request is no longer pending.");
      await this.recordHistory(tx, requestId, request.status, DocumentAccessRequestStatus.CANCELLED, "cancel", userId);
      return tx.documentAccessRequest.findUnique({ where: { access_request_id: requestId }, include: REQUEST_INCLUDE });
    });
  }

  async pending(query: PaginationQueryDto, user: AuthenticatedUser) {
    const { page, limit, skip, take } = getPagination(query);
    const where = {
      status: { in: [DocumentAccessRequestStatus.PENDING, DocumentAccessRequestStatus.ForAccessApproval, DocumentAccessRequestStatus.APPROVED] },
      approver_user_id: toBigIntId(user.user_id, "current_user_id"),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentAccessRequest.findMany({
        where,
        skip,
        take,
        include: REQUEST_INCLUDE,
        orderBy: { created_at: "asc" },
      }),
      this.prisma.documentAccessRequest.count({ where }),
    ]);
    return paginatedResponse(items, total, page, limit);
  }

  async review(
    id: string,
    dto: ReviewDocumentAccessRequestDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(
      user,
      dto.status === DocumentAccessRequestStatus.APPROVED
        ? "document-access-requests.approve"
        : "document-access-requests.reject",
    );
    const requestId = toBigIntId(id, "access_request_id");
    const reviewerId = toBigIntId(user.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.documentAccessRequest.findUnique({
        where: { access_request_id: requestId },
        select: {
          access_request_id: true,
          document_id: true,
          requested_by_user_id: true,
          status: true,
          approver_user_id: true,
        },
      });
      if (!request) throw new NotFoundException("Access request was not found.");
      const reviewableStatuses = new Set<DocumentAccessRequestStatus>([
        DocumentAccessRequestStatus.PENDING,
        DocumentAccessRequestStatus.ForAccessApproval,
      ]);
      if (!reviewableStatuses.has(request.status))
        throw new ConflictException("This access request was already reviewed.");
      if (request.approver_user_id !== reviewerId)
        throw new ForbiddenException("You are not the configured approver for this document access request.");

      const updated = await tx.documentAccessRequest.updateMany({
        where: {
          access_request_id: requestId,
          status: { in: [DocumentAccessRequestStatus.PENDING, DocumentAccessRequestStatus.ForAccessApproval] },
        },
        data: {
          status: dto.status,
          reviewed_by_user_id: reviewerId,
          reviewer_remarks: dto.reviewer_remarks?.trim() || null,
          reviewed_at: new Date(),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException("This access request was already reviewed.");
      await this.recordHistory(tx, requestId, request.status, dto.status, "review", reviewerId, dto.reviewer_remarks);

      const reviewed = await tx.documentAccessRequest.findUnique({
        where: { access_request_id: requestId },
        include: REQUEST_INCLUDE,
      });
      if (!reviewed)
        throw new BadRequestException("The reviewed request could not be loaded.");
      return reviewed;
    });
  }

  async grant(id: string, user: AuthenticatedUser) {
    this.assertAnyPermission(user, ["document-access-requests.grant", "document-access-requests.approve"]);
    const requestId = toBigIntId(id, "access_request_id");
    const actorId = toBigIntId(user.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.documentAccessRequest.findUnique({ where: { access_request_id: requestId } });
      if (!request) throw new NotFoundException("Access request was not found.");
      if (request.status !== DocumentAccessRequestStatus.APPROVED) throw new ConflictException("Access can only be granted after approval.");
      if (request.approver_user_id !== actorId) throw new ForbiddenException("Only the configured approver can grant access.");
      const now = new Date();
      await tx.documentAssignment.upsert({
        where: { document_id_user_id: { document_id: request.document_id, user_id: request.requested_by_user_id } },
        update: { assigned_by: actorId, assigned_at: now },
        create: { document_id: request.document_id, user_id: request.requested_by_user_id, assigned_by: actorId },
      });
      await this.recordHistory(tx, requestId, request.status, DocumentAccessRequestStatus.AccessGranted, "grant", actorId);
      return tx.documentAccessRequest.update({ where: { access_request_id: requestId }, data: { status: DocumentAccessRequestStatus.AccessGranted, granted_at: now }, include: REQUEST_INCLUDE });
    });
  }

  async revoke(id: string, user: AuthenticatedUser) {
    this.assertAnyPermission(user, ["document-access-requests.revoke", "document-access-requests.approve"]);
    const requestId = toBigIntId(id, "access_request_id");
    const actorId = toBigIntId(user.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.documentAccessRequest.findUnique({ where: { access_request_id: requestId } });
      if (!request) throw new NotFoundException("Access request was not found.");
      if (request.status !== DocumentAccessRequestStatus.AccessGranted) throw new ConflictException("Only granted access can be revoked.");
      if (request.approver_user_id !== actorId) throw new ForbiddenException("Only the configured approver can revoke access.");
      await tx.documentAssignment.deleteMany({ where: { document_id: request.document_id, user_id: request.requested_by_user_id } });
      await this.recordHistory(tx, requestId, request.status, DocumentAccessRequestStatus.REVOKED, "revoke", actorId);
      return tx.documentAccessRequest.update({ where: { access_request_id: requestId }, data: { status: DocumentAccessRequestStatus.REVOKED, revoked_at: new Date() }, include: REQUEST_INCLUDE });
    });
  }

  async expire(id: string, user: AuthenticatedUser) {
    this.assertAnyPermission(user, ["document-access-requests.expire", "document-access-requests.approve"]);
    const requestId = toBigIntId(id, "access_request_id");
    const actorId = toBigIntId(user.user_id, "current_user_id");
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.documentAccessRequest.findUnique({ where: { access_request_id: requestId }, select: { approver_user_id: true, status: true } });
      if (!request) throw new NotFoundException("Access request was not found.");
      if (request.approver_user_id !== actorId) throw new ForbiddenException("Only the configured approver can expire access.");
      if (request.status !== DocumentAccessRequestStatus.APPROVED && request.status !== DocumentAccessRequestStatus.AccessGranted) throw new ConflictException("Only approved access can expire.");
      await this.recordHistory(tx, requestId, request.status, DocumentAccessRequestStatus.EXPIRED, "expire", actorId);
      return tx.documentAccessRequest.update({ where: { access_request_id: requestId }, data: { status: DocumentAccessRequestStatus.EXPIRED }, include: REQUEST_INCLUDE });
    });
  }

  private recordHistory(
    tx: Prisma.TransactionClient,
    accessRequestId: bigint,
    previousStatus: DocumentAccessRequestStatus | null,
    newStatus: DocumentAccessRequestStatus,
    action: string,
    actorId: bigint,
    comments?: string,
  ) {
    return tx.documentAccessRequestHistory.create({
      data: {
        access_request_id: accessRequestId,
        previous_status: previousStatus,
        new_status: newStatus,
        action,
        performed_by_user_id: actorId,
        comments: comments?.trim() || null,
      },
    });
  }

  private assertPermission(user: AuthenticatedUser, permission: string) {
    if (!hasPermission(user, permission)) {
      throw new ForbiddenException("You do not have permission to perform this document access action.");
    }
  }

  private assertAnyPermission(user: AuthenticatedUser, permissions: string[]) {
    if (!permissions.some((permission) => hasPermission(user, permission))) {
      throw new ForbiddenException("You do not have permission to perform this document access action.");
    }
  }

  private containsText(term: string) {
    const filter: { contains: string; mode?: "insensitive" } = {
      contains: term,
    };
    if (/^postgres(?:ql)?:/i.test(process.env.DATABASE_URL ?? "")) {
      filter.mode = "insensitive";
    }
    return filter as Prisma.StringFilter;
  }
}
