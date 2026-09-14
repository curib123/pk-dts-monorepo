import { ConflictException } from "@nestjs/common";
import {
  DocumentActionRequested,
  DocumentStatus,
  DocumentType,
  WorkflowStepStatus,
} from "@prisma/client";
import { AuthenticatedUser } from "../../../common/auth/authenticated-user.interface";
import { PrismaService } from "../../../core/prisma/prisma.service";
import { DocumentRequestReviewFileService } from "./document-request-review-file.service";
import { DocumentsService } from "./documents.service";

const requester = {
  user_id: "7",
  username: "requester@example.com",
  firstname: "Request",
  lastname: "Owner",
  require_password_change: false,
  role: {
    role_id: "2",
    role_name: "User",
    permissions: ["document-requests.create", "document-requests.submit"],
  },
} satisfies AuthenticatedUser;

const approver = {
  ...requester,
  user_id: "9",
  username: "controller@example.com",
  role: {
    role_id: "3",
    role_name: "Document Controller",
    permissions: ["document-requests.approve-document-controller"],
  },
} satisfies AuthenticatedUser;

describe("DocumentRequestReviewFileService", () => {
  let prisma: any;
  let documentsService: any;
  let service: DocumentRequestReviewFileService;

  beforeEach(() => {
    prisma = {
      document: { findUnique: jest.fn() },
      documentRevision: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      softcopyDocument: { update: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    };
    documentsService = {
      transition: jest.fn(),
      findOne: jest.fn(),
    };
    service = new DocumentRequestReviewFileService(
      prisma as PrismaService,
      documentsService as DocumentsService,
    );
  });

  it("blocks Softcopy CREATE submission until a review file is attached", async () => {
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_type: DocumentType.SOFTCOPY,
        action_requested: DocumentActionRequested.CREATE,
      })
      .mockResolvedValueOnce({
        softcopy: {
          document_number: "PK-FRM-001",
          revisions: [],
        },
      });

    await expect(
      service.submitReview("1", undefined, requester),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(documentsService.transition).not.toHaveBeenCalled();
  });

  it("submits a Softcopy CREATE request when the pending review file is ready", async () => {
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_type: DocumentType.SOFTCOPY,
        action_requested: DocumentActionRequested.CREATE,
      })
      .mockResolvedValueOnce({
        softcopy: {
          document_number: "PK-FRM-001",
          revisions: [
            {
              revision_id: 11n,
              file_path: "/uploads/forms/review.docx",
              series_number: "2026",
            },
          ],
        },
      });
    documentsService.transition.mockResolvedValue({ status: DocumentStatus.ForNotedBy });

    await service.submitReview("1", "ready", requester);

    expect(documentsService.transition).toHaveBeenCalledWith(
      "1",
      requester.user_id,
      "submit",
      "ready",
      requester,
    );
  });

  it("promotes the same pending review file when the final approver approves", async () => {
    const pendingRevision = {
      revision_id: 11n,
      file_path: "/uploads/forms/review.docx",
      series_number: "2026",
      effective_date: null,
      new_effective_date: null,
    };

    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_type: DocumentType.SOFTCOPY,
        action_requested: DocumentActionRequested.REVISE,
        workflow_version_id: 100n,
        workflow_current_node_key: "controller",
        workflow_steps: [
          {
            workflow_step_id: 21n,
            node_key: "controller",
            sequence: 3,
            status: WorkflowStepStatus.PENDING,
            on_approve_node_key: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        softcopy: {
          document_number: "PK-FRM-001",
          revisions: [pendingRevision],
        },
      })
      .mockResolvedValueOnce({
        new_effective_date: null,
        softcopy: {
          softcopy_id: 5n,
          document_number: "PK-FRM-001",
          current_revision_id: 10n,
          current_revision: { revision_id: 10n },
          revisions: [pendingRevision],
        },
      });
    documentsService.transition.mockResolvedValue({ status: DocumentStatus.Approved });

    await service.approveReview("1", "approved", approver);

    expect(documentsService.transition).toHaveBeenCalledWith(
      "1",
      approver.user_id,
      "approve",
      "approved",
      approver,
    );
    expect(prisma.documentRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { revision_id: 11n },
        data: expect.objectContaining({
          is_current: true,
          is_historical: false,
          approved_by_user_id: 9n,
        }),
      }),
    );
    expect(prisma.softcopyDocument.update).toHaveBeenCalledWith({
      where: { softcopy_id: 5n },
      data: { current_revision_id: 11n },
    });
  });
});
