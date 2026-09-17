import { ForbiddenException } from "@nestjs/common";
import {
  DocumentAccessRequestStatus,
  DocumentStatus,
} from "@prisma/client";
import { DocumentAccessRequestsService } from "./document-access-requests.service";

const actor = (permissions: string[]) => ({
  user_id: "9",
  username: "admin@example.com",
  firstname: "Admin",
  lastname: "User",
  require_password_change: false,
  role: { role_id: "1", role_name: "Admin", permissions },
});

describe("DocumentAccessRequestsService", () => {
  it("uses case-insensitive catalog matching on PostgreSQL", async () => {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://database";
    const prisma: any = {
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((operations) => Promise.all(operations)),
    };
    const service = new DocumentAccessRequestsService(prisma);

    await service.catalog(
      { query: "s", page: 1, limit: 12 },
      actor(["document-access-requests.catalog"]),
    );

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { document_title: { contains: "s", mode: "insensitive" } },
            { softcopy: { is: { document_number: { contains: "s", mode: "insensitive" } } } },
          ],
        }),
      }),
    );
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  it("filters the catalog by hardcopy location", async () => {
    const prisma: any = {
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((operations) => Promise.all(operations)),
    };
    const service = new DocumentAccessRequestsService(prisma);

    await service.catalog(
      { location_id: "31", page: 1, limit: 12 },
      actor(["document-access-requests.catalog"]),
    );

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hardcopy: { location_id: 31n },
        }),
      }),
    );
  });

  it("creates a pending request without assigning the document", async () => {
    const prisma: any = {
      document: { findFirst: jest.fn().mockResolvedValue({ document_id: 4n, approver_configuration: { access_approver_user_id: 12n, document_owner_user_id: null } }) },
      documentAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      documentAccessRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ access_request_id: 7n }),
      },
      documentAccessRequestHistory: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    const service = new DocumentAccessRequestsService(prisma);

    await service.create(
      { document_id: "4", request_reason: "Needed for review" },
      actor(["document-access-requests.create"]),
    );

    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { document_id: 4n, status: { in: [DocumentStatus.Approved, DocumentStatus.Completed] } },
      }),
    );
    expect(prisma.documentAccessRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          document_id: 4n,
          requested_by_user_id: 9n,
          request_reason: "Needed for review",
          status: DocumentAccessRequestStatus.ForAccessApproval,
          approver_user_id: 12n,
          approval_stage: "DOCUMENT_CONFIGURED_APPROVER",
        }),
      }),
    );
  });

  it("rejects an access request without a nonblank reason", async () => {
    const prisma: any = {};
    const service = new DocumentAccessRequestsService(prisma);

    await expect(
      service.create(
        { document_id: "4", request_reason: "   " },
        actor(["document-access-requests.create"]),
      ),
    ).rejects.toThrow("A reason is required to request document access.");
  });

  it("lets only the requester cancel a pending request without deleting it", async () => {
    const prisma: any = {
      documentAccessRequest: {
        findFirst: jest.fn().mockResolvedValue({
          access_request_id: 7n,
          status: DocumentAccessRequestStatus.PENDING,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          access_request_id: 7n,
          status: DocumentAccessRequestStatus.CANCELLED,
        }),
      },
      documentAccessRequestHistory: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    const service = new DocumentAccessRequestsService(prisma);

    const result = await service.cancel(
      "7",
      actor(["document-access-requests.cancel-own"]),
    );

    expect(prisma.documentAccessRequest.updateMany).toHaveBeenCalledWith({
      where: {
        access_request_id: 7n,
        requested_by_user_id: 9n,
        status: { in: [DocumentAccessRequestStatus.PENDING, DocumentAccessRequestStatus.ForAccessApproval] },
      },
      data: { status: DocumentAccessRequestStatus.CANCELLED },
    });
    expect(result).toEqual(
      expect.objectContaining({ status: DocumentAccessRequestStatus.CANCELLED }),
    );
  });

  it("reviews approval without granting access", async () => {
    const tx: any = {
      documentAccessRequest: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            access_request_id: 7n,
            document_id: 4n,
            requested_by_user_id: 12n,
            status: DocumentAccessRequestStatus.ForAccessApproval,
            approver_user_id: 9n,
          })
          .mockResolvedValueOnce({ access_request_id: 7n, status: DocumentAccessRequestStatus.APPROVED }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      documentAssignment: { upsert: jest.fn().mockResolvedValue({}) },
      documentAccessRequestHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new DocumentAccessRequestsService(prisma);

    await service.review(
      "7",
      { status: DocumentAccessRequestStatus.APPROVED },
      actor(["document-access-requests.approve"]),
    );

    expect(tx.documentAssignment.upsert).not.toHaveBeenCalled();
  });

  it("requires the configured approver for the submitted decision", async () => {
    const prisma: any = {
      $transaction: jest.fn((callback) => callback({
        documentAccessRequest: {
          findUnique: jest.fn().mockResolvedValue({
            access_request_id: 7n,
            status: DocumentAccessRequestStatus.ForAccessApproval,
            approver_user_id: 10n,
          }),
        },
      })),
    };
    const service = new DocumentAccessRequestsService(prisma);
    await expect(
      service.review(
        "7",
        { status: DocumentAccessRequestStatus.APPROVED },
        actor(["document-access-requests.reject"]),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
