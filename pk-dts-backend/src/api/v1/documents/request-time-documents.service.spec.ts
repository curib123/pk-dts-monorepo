import { BadRequestException } from "@nestjs/common";
import {
  DocumentActionRequested,
  DocumentStatus,
  DocumentType,
  WorkflowStepStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { DocumentsService } from "./documents.service";
import { RequestTimeDocumentsService } from "./request-time-documents.service";

const staffUser = {
  user_id: "7",
  username: "staff@example.com",
  firstname: "Staff",
  lastname: "User",
  require_password_change: false,
  role: {
    role_id: "2",
    role_name: "User",
    permissions: ["document-requests.submit", "document-requests.edit"],
  },
} satisfies AuthenticatedUser;

describe("RequestTimeDocumentsService", () => {
  let service: RequestTimeDocumentsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      document: { findUnique: jest.fn() },
      documentRevision: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      softcopyDocument: { update: jest.fn() },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };
    service = new RequestTimeDocumentsService(prisma, {} as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it("requires the proposed Softcopy file when a CREATE or REVISE request is submitted", async () => {
    await expect(
      service.createRequest(
        {
          document_title: "Quality Manual",
          document_type: DocumentType.SOFTCOPY,
          document_number: "DOC-001",
          series_number: "SERIES-001",
          page_number: "1-5",
          new_effective_date: "2026-09-15",
          action_requested: DocumentActionRequested.CREATE,
          action: "SUBMIT",
        } as any,
        "7",
        undefined,
        staffUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.createRequest(
        {
          document_title: "Quality Manual",
          document_type: DocumentType.SOFTCOPY,
          document_number: "DOC-001",
          series_number: "SERIES-001",
          action_requested: DocumentActionRequested.REVISE,
          action: "SUBMIT",
        } as any,
        "7",
        undefined,
        staffUser,
      ),
    ).rejects.toThrow(
      "A proposed Softcopy file is required before submitting a create or revision request.",
    );
  });

  it("stores the submitted request file as a non-current proposal before starting approvals", async () => {
    const parentCreate = jest
      .spyOn(DocumentsService.prototype, "createRequest")
      .mockResolvedValue({ document_id: 1n, status: DocumentStatus.Draft } as any);
    const parentTransition = jest
      .spyOn(DocumentsService.prototype, "transition")
      .mockResolvedValue({ document_id: 1n, status: DocumentStatus.ForNotedBy } as any);
    jest.spyOn(DocumentsService.prototype, "findOne").mockResolvedValue({
      document_id: 1n,
      status: DocumentStatus.ForNotedBy,
      softcopy: { revisions: [{ revision_id: 10n, is_current: false }] },
    } as any);

    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      document_title: "QUALITY MANUAL",
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.Draft,
      action_requested: DocumentActionRequested.CREATE,
      softcopy: {
        softcopy_id: 9n,
        document_number: "DOC-001",
        series_number: "SERIES-001",
        category: { folder_name: "policies" },
        revisions: [],
      },
    });
    prisma.documentRevision.create.mockResolvedValue({ revision_id: 10n });
    jest
      .spyOn(service as any, "moveProposalUpload")
      .mockResolvedValue("/uploads/revisions/policies/proposed.pdf");

    const file = {
      originalname: "proposed.pdf",
      mimetype: "application/pdf",
      size: 1234,
      path: "/tmp/proposed.pdf",
      filename: "stored-proposed.pdf",
    } as Express.Multer.File;

    await service.createRequest(
      {
        document_title: "Quality Manual",
        document_type: DocumentType.SOFTCOPY,
        document_number: "DOC-001",
        series_number: "SERIES-001",
        page_number: "1-5",
        new_effective_date: "2026-09-15",
        action_requested: DocumentActionRequested.CREATE,
        action: "SUBMIT",
      } as any,
      "7",
      file,
      staffUser,
    );

    expect(parentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DRAFT" }),
      "7",
      undefined,
      staffUser,
    );
    expect(prisma.documentRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        revision_number: "000",
        file_name: "proposed.pdf",
        is_current: false,
        is_historical: false,
        approved_by_user_id: null,
        approved_at: null,
      }),
    });
    expect(prisma.softcopyDocument.update).not.toHaveBeenCalled();
    expect(parentTransition).toHaveBeenCalledWith(
      "1",
      "7",
      "submit",
      undefined,
      staffUser,
    );
  });

  it("promotes the exact pending proposal after the final Softcopy approval", async () => {
    jest.spyOn(DocumentsService.prototype, "transition").mockResolvedValue({
      document_id: 1n,
      status: DocumentStatus.Approved,
    } as any);
    jest.spyOn(DocumentsService.prototype, "findOne").mockResolvedValue({
      document_id: 1n,
      status: DocumentStatus.Approved,
      softcopy: { current_revision: { revision_id: 10n } },
    } as any);

    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      document_type: DocumentType.SOFTCOPY,
      action_requested: DocumentActionRequested.REVISE,
      workflow_version_id: 4n,
      workflow_current_node_key: "document-controller",
      workflow_steps: [
        {
          sequence: 3,
          node_key: "document-controller",
          on_approve_node_key: null,
          status: WorkflowStepStatus.PENDING,
        },
      ],
      softcopy: {
        softcopy_id: 9n,
        document_number: "DOC-001",
        current_revision_id: 8n,
        revisions: [
          {
            revision_id: 10n,
            revision_number: "006",
            file_path: "/uploads/revisions/policies/proposed.docx",
            document_title: "QUALITY MANUAL",
            series_number: "SERIES-002",
            page_number: "1-5",
            effective_date: new Date("2026-09-15"),
            approved_at: null,
            is_current: false,
            is_historical: false,
          },
        ],
      },
    });
    prisma.documentRevision.update.mockResolvedValue({});
    prisma.softcopyDocument.update.mockResolvedValue({});

    await service.transition("1", "7", "approve", "Approved", staffUser);

    expect(prisma.documentRevision.update).toHaveBeenCalledWith({
      where: { revision_id: 8n },
      data: { is_current: false, is_historical: true },
    });
    expect(prisma.documentRevision.update).toHaveBeenCalledWith({
      where: { revision_id: 10n },
      data: expect.objectContaining({
        is_current: true,
        is_historical: false,
        approved_by_user_id: 7n,
        approved_at: expect.any(Date),
        approval_date: expect.any(Date),
      }),
    });
    expect(prisma.softcopyDocument.update).toHaveBeenCalledWith({
      where: { softcopy_id: 9n },
      data: { current_revision_id: 10n },
    });
  });
});
