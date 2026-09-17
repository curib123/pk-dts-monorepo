import { ConflictException, ForbiddenException } from "@nestjs/common";
import { HardcopyTransferStatus, RecipientAcceptanceStatus } from "@prisma/client";
import { HardcopyTransfersService } from "./hardcopy-transfers.service";

const recipient = {
  user_id: "12",
  username: "recipient@example.com",
  firstname: "Receiving",
  lastname: "User",
  require_password_change: false,
  role: { role_id: "2", role_name: "User", permissions: ["hardcopy-transfers.accept"] },
};

describe("HardcopyTransfersService", () => {
  it("snapshots the published transfer workflow and queues Plant Manager first", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 6n,
          requested_by_user_id: 12n,
          status: HardcopyTransferStatus.Draft,
          workflow_steps: [],
        }),
        update: jest.fn().mockResolvedValue({ status: HardcopyTransferStatus.ForApproval }),
      },
      hardcopyTransferWorkflowStep: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
        findFirst: jest.fn().mockResolvedValue({ workflow_step_id: 100n, assigned_user_id: 30n }),
      },
      hardcopyTransferWorkflowStepHistory: { create: jest.fn().mockResolvedValue({}) },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
      workflowVersion: {
        findFirst: jest.fn().mockResolvedValue({
          workflow_version_id: 40n,
          version_number: 1,
          workflow_definition: { name: "Hardcopy Transfer Approval" },
          graph: {
            schema_version: 2,
            start_node_key: "plant-manager",
            nodes: [
              { key: "plant-manager", type: "APPROVAL", label: "Plant Manager", stage: "PLANT_MANAGER", assignment: { type: "ROLE", role_id: "20" } },
              { key: "documentation-officer", type: "APPROVAL", label: "Documentation Officer", stage: "DOCUMENT_CONTROLLER_ADMIN", assignment: { type: "ROLE", role_id: "21" } },
          { key: "final-approver", type: "APPROVAL", label: "Transfer Implemented", stage: "CUSTOM", assignment: { type: "REQUESTER" } },
              { key: "complete", type: "END", label: "Approved" },
            ],
            edges: [
              { key: "one", from: "plant-manager", to: "documentation-officer", outcome: "APPROVE" },
              { key: "two", from: "documentation-officer", to: "final-approver", outcome: "APPROVE" },
              { key: "three", from: "final-approver", to: "complete", outcome: "APPROVE" },
            ],
          },
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { user_id: 30n, role_id: 20n, firstname: "Plant", lastname: "Manager", position_title: "Plant Manager" },
          { user_id: 31n, role_id: 21n, firstname: "Documentation", lastname: "Officer", position_title: "Documentation Officer" },
        ]),
        findUnique: jest.fn(({ where }: any) => Promise.resolve(where.user_id === 12n
          ? { user_id: 12n, firstname: "Receiving", lastname: "User", position_title: "Requester" }
          : { user_id: 22n, firstname: "Final", lastname: "Approver", position_title: "Approver" })),
      },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new HardcopyTransfersService(prisma);
    const requester = { ...recipient, role: { ...recipient.role, permissions: ["hardcopy-transfers.create"] } };

    await service.submit("6", requester as any);

    expect(tx.workflowVersion.findFirst).toHaveBeenCalled();
    expect(tx.hardcopyTransferWorkflowStep.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ sequence: 1, status: "PENDING", assigned_user_id: 30n }),
        expect.objectContaining({ sequence: 2, status: "QUEUED", assigned_user_id: 31n }),
        expect.objectContaining({ sequence: 3, status: "QUEUED", assigned_user_id: 12n }),
      ]),
    }));
  });

  it("returns an awaiting-approval transfer for correction", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 6n,
          status: HardcopyTransferStatus.ForApproval,
          approver_user_id: 4n,
          comments: null,
        }),
        update: jest.fn().mockResolvedValue({ status: HardcopyTransferStatus.Returned }),
      },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new HardcopyTransfersService({ $transaction: jest.fn((callback) => callback(tx)) } as any);
    const approver = { ...recipient, user_id: "4", role: { ...recipient.role, permissions: ["hardcopy-transfers.approve"] } };

    await service.returnForCorrection("6", approver as any, "Correct the destination.");

    expect(tx.hardcopyTransferRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: HardcopyTransferStatus.Returned }),
    }));
  });

  it("allows the requester to cancel a returned transfer", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 6n,
          requested_by_user_id: 12n,
          status: HardcopyTransferStatus.Returned,
          comments: "Correct the destination.",
        }),
        update: jest.fn().mockResolvedValue({ status: HardcopyTransferStatus.Cancelled }),
      },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new HardcopyTransfersService({ $transaction: jest.fn((callback) => callback(tx)) } as any);
    const requester = { ...recipient, role: { ...recipient.role, permissions: ["hardcopy-transfers.create"] } };

    await service.cancel("6", requester as any, "No longer needed.");

    expect(tx.hardcopyTransferRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: HardcopyTransferStatus.Cancelled }),
    }));
  });

  it("allows only the assigned recipient to accept physical receipt", async () => {
    const prisma: any = {
      $transaction: jest.fn((callback) => callback({
        hardcopyTransferRequest: {
          findUnique: jest.fn().mockResolvedValue({
            transfer_request_id: 7n,
            status: HardcopyTransferStatus.PendingRecipientAcceptance,
            assigned_recipient_user_id: 12n,
            transfer_to: "Receiving Office",
          }),
        },
      })),
    };
    const service = new HardcopyTransfersService(prisma);

    await expect(service.accept("7", { ...recipient, user_id: "9" } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it("records recipient acceptance and changes the current holder only after confirmation", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 7n,
          status: HardcopyTransferStatus.PendingRecipientAcceptance,
          assigned_recipient_user_id: 12n,
          transfer_to: "Receiving Office",
        }),
        update: jest.fn().mockResolvedValue({
          transfer_request_id: 7n,
          status: HardcopyTransferStatus.Completed,
          recipient_acceptance: RecipientAcceptanceStatus.ACCEPTED,
        }),
      },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new HardcopyTransfersService(prisma);

    await service.accept("7", recipient as any, "Received in good condition");

    expect(tx.hardcopyTransferRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: HardcopyTransferStatus.Completed,
        recipient_acceptance: RecipientAcceptanceStatus.ACCEPTED,
        accepted_by_user_id: 12n,
        current_holder: "Receiving Office",
      }),
    }));
    expect(tx.hardcopyTransferHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        previous_status: HardcopyTransferStatus.PendingRecipientAcceptance,
        new_status: HardcopyTransferStatus.Completed,
        action: "accept",
      }),
    }));
  });

  it("moves the Hardcopy storage route only after recipient acceptance", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 8n,
          hardcopy_id: 21n,
          status: HardcopyTransferStatus.PendingRecipientAcceptance,
          assigned_recipient_user_id: 12n,
          transfer_to: "Receiving Office",
          destination_area_id: 2n,
          destination_specific_id: 3n,
          destination_asset_id: 4n,
          destination_location_id: 5n,
          destination_sequence_id: 6n,
        }),
        update: jest.fn().mockResolvedValue({ status: HardcopyTransferStatus.Completed }),
      },
      hardcopyDocument: { update: jest.fn().mockResolvedValue({}) },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new HardcopyTransfersService(prisma);

    await service.accept("8", recipient as any);

    expect(tx.hardcopyDocument.update).toHaveBeenCalledWith({
      where: { hardcopy_id: 21n },
      data: {
        area_id: 2n,
        specific_id: 3n,
        asset_id: 4n,
        location_id: 5n,
        sequence_id: 6n,
      },
    });
  });

  it("advances the current workflow step and assigns the next reviewer", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 9n,
          requested_by_user_id: 12n,
          status: HardcopyTransferStatus.ForApproval,
          workflow_steps: [
            { workflow_step_id: 10n, sequence: 1, assigned_user_id: 4n, status: "PENDING" },
            { workflow_step_id: 11n, sequence: 2, assigned_user_id: 5n, status: "QUEUED" },
          ],
          current_workflow_step_id: 10n,
        }),
        update: jest.fn().mockResolvedValue({ status: HardcopyTransferStatus.ForApproval }),
      },
      hardcopyTransferWorkflowStep: {
        update: jest.fn().mockResolvedValue({}),
      },
      hardcopyTransferWorkflowStepHistory: { create: jest.fn().mockResolvedValue({}) },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new HardcopyTransfersService({ $transaction: jest.fn((callback) => callback(tx)) } as any);
    const reviewer = { ...recipient, user_id: "4", role: { ...recipient.role, permissions: ["hardcopy-transfers.approve"] } };

    await service.approve("9", reviewer as any, "Approved by Plant Manager.");

    expect(tx.hardcopyTransferWorkflowStep.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { workflow_step_id: 11n },
      data: expect.objectContaining({ status: "PENDING" }),
    }));
    expect(tx.hardcopyTransferRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ current_workflow_step_id: 11n }),
    }));
  });

  it("returns a transfer to the requester with the reviewer remarks", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 10n,
          requested_by_user_id: 12n,
          status: HardcopyTransferStatus.ForApproval,
          workflow_steps: [{ workflow_step_id: 20n, assigned_user_id: 4n, status: "PENDING" }],
          current_workflow_step_id: 20n,
        }),
        update: jest.fn().mockResolvedValue({ status: HardcopyTransferStatus.Returned }),
      },
      hardcopyTransferWorkflowStep: { update: jest.fn().mockResolvedValue({}) },
      hardcopyTransferWorkflowStepHistory: { create: jest.fn().mockResolvedValue({}) },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new HardcopyTransfersService({ $transaction: jest.fn((callback) => callback(tx)) } as any);
    const reviewer = { ...recipient, user_id: "4", role: { ...recipient.role, permissions: ["hardcopy-transfers.approve"] } };

    await service.returnForCorrection("10", reviewer as any, "Destination needs correction.");

    expect(tx.hardcopyTransferRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: HardcopyTransferStatus.Returned, current_workflow_step_id: null, comments: "Destination needs correction." }),
    }));
  });

  it("lets only the requester complete the approved physical transfer", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 11n,
          requested_by_user_id: 12n,
          hardcopy_id: 21n,
          status: HardcopyTransferStatus.ForTransfer,
          destination_area_id: 2n,
          destination_specific_id: 3n,
          destination_asset_id: 4n,
          destination_location_id: 5n,
          destination_sequence_id: 6n,
          transfer_to: "Receiving Office",
        }),
        update: jest.fn().mockResolvedValue({ status: HardcopyTransferStatus.Completed }),
      },
      hardcopyDocument: { update: jest.fn().mockResolvedValue({}) },
      hardcopyTransferHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new HardcopyTransfersService({ $transaction: jest.fn((callback) => callback(tx)) } as any);
    const requester = { ...recipient, role: { ...recipient.role, permissions: ["hardcopy-transfers.create"] } };

    await service.complete("11", requester as any, "Physical hardcopy moved to Receiving Office.");

    expect(tx.hardcopyDocument.update).toHaveBeenCalled();
    expect(tx.hardcopyTransferRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: HardcopyTransferStatus.Completed, accepted_by_user_id: 12n }),
    }));
  });

  it("does not let legacy dispatch actions bypass a configured transfer workflow", async () => {
    const tx: any = {
      hardcopyTransferRequest: {
        findUnique: jest.fn().mockResolvedValue({
          transfer_request_id: 12n,
          requested_by_user_id: 12n,
          approver_user_id: 4n,
          workflow_version_id: 40n,
          status: HardcopyTransferStatus.ForTransfer,
        }),
      },
    };
    const service = new HardcopyTransfersService({ $transaction: jest.fn((callback) => callback(tx)) } as any);
    const finalApprover = { ...recipient, user_id: "4", role: { ...recipient.role, permissions: ["hardcopy-transfers.dispatch"] } };

    await expect(service.dispatch("12", finalApprover as any)).rejects.toBeInstanceOf(ConflictException);
  });
});
