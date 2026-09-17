import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DisposalAction, DocumentStatus, DocumentType, DocumentWorkflowStage, SoftcopyAttachmentStatus } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { DocumentsService } from './documents.service';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';

const adminUser = {
  user_id: '1',
  username: 'admin@example.com',
  firstname: 'System',
  lastname: 'Admin',
  require_password_change: false,
  role: { role_id: '1', role_name: 'Admin', permissions: [] },
} satisfies AuthenticatedUser;

const regularUser = {
  ...adminUser,
  user_id: '7',
  username: 'staff@example.com',
  role: { role_id: '2', role_name: 'User', permissions: [] },
} satisfies AuthenticatedUser;

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: any;

  beforeEach(() => {
    process.env.UPLOAD_BASE_URL = 'http://localhost:3000';
    process.env.MISTRAL_ENABLED = 'false';

    prisma = {
      workflowVersion: { findFirst: jest.fn().mockResolvedValue({
        workflow_version_id: 100n, version_number: 1, workflow_definition: { name: 'System default', workflow_key: 'system-softcopy-standard' },
        graph: { schema_version: 2, start_node_key: 'review', nodes: [
          { key: 'review', label: 'Review', type: 'APPROVAL', stage: 'HARDCOPY_APPROVAL', assignment: { type: 'REQUESTER_LEADER' } },
          { key: 'end', label: 'Approved', type: 'END' }
        ], edges: [{ key: 'approve', from: 'review', to: 'end', outcome: 'APPROVE' }] }
      }) },
      area: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      location: {
        findMany: jest.fn(),
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve({ location_id: where.location_id, asset_id: null, asset: null }),
        ),
        create: jest.fn(),
      },
      specific: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      sequence: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      assetNumber: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      document: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      documentStatusHistory: {
        create: jest.fn(),
      },
      documentAssignment: {
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          user_id: 7n,
          firstname: 'Workflow',
          lastname: 'Approver',
          position_title: 'Approver',
        }),
      },
      hardcopyDocument: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      softcopyDocument: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      softcopyAttachment: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      documentWorkflowStep: {
        update: jest.fn(),
        updateMany: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
      },
      documentApproverConfiguration: {
        create: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      documentWorkflowAssignmentHistory: {
        create: jest.fn(),
      },
      softcopyCategory: {
        findUnique: jest.fn(),
      },
      documentRevision: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }

        return arg(prisma);
      }),
    };

    service = new DocumentsService(prisma as PrismaService);
  });

  it('enforces exactly one Hardcopy Approval workflow stage', () => {
    const parseWorkflowPlan = (service as any).parseWorkflowPlan.bind(service);

    expect(parseWorkflowPlan(
      JSON.stringify([{ stage: DocumentWorkflowStage.HARDCOPY_APPROVAL }]),
      DocumentType.HARDCOPY,
      'CREATE_REVISE',
    )).toEqual([{ stage: DocumentWorkflowStage.HARDCOPY_APPROVAL }]);
    expect(() => parseWorkflowPlan(
      JSON.stringify([
        { stage: DocumentWorkflowStage.NOTED_BY },
        { stage: DocumentWorkflowStage.HARDCOPY_APPROVAL },
      ]),
      DocumentType.HARDCOPY,
      'CREATE_REVISE',
    )).toThrow('exactly one Hardcopy Approval stage');
  });

  it('requires the stage-specific permission for a configured Softcopy approval', async () => {
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.ForNotedBy,
      action_requested: 'CREATE_REVISE',
      workflow_steps: [{
        workflow_step_id: 10n,
        stage: 'NOTED_BY',
        sequence: 1,
        assigned_user_id: 7n,
        status: 'PENDING',
      }],
    });

    await expect(
      service.transition('1', '7', 'approve', undefined, regularUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a configured stage approver with the matching permission', async () => {
    const notedBy = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.approve-noted-by'] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForNotedBy,
        action_requested: 'CREATE_REVISE',
        workflow_steps: [{
          workflow_step_id: 10n,
          stage: 'NOTED_BY',
          sequence: 1,
          assigned_user_id: 7n,
          status: 'PENDING',
        }],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.ForPlantManagerApproval });
    prisma.documentWorkflowStep = {
      update: jest.fn().mockResolvedValue({}),
    };
    prisma.document.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await expect(
      service.transition('1', '7', 'approve', 'Noted', notedBy),
    ).resolves.toMatchObject({ status: DocumentStatus.ForPlantManagerApproval });
    expect(prisma.documentWorkflowStep.update).toHaveBeenCalled();
  });

  it('allows the requester\'s assigned leader to approve their Noted By step without a global approval role', async () => {
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        created_by: 8n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForNotedBy,
        action_requested: 'CREATE_REVISE',
        workflow_steps: [{
          workflow_step_id: 10n,
          stage: 'NOTED_BY',
          sequence: 1,
          assigned_user_id: 7n,
          assignment_source: 'REQUESTER_LEADER',
          required_permission: 'document-requests.approve-noted-by',
          status: 'PENDING',
        }],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.ForPlantManagerApproval });
    prisma.documentWorkflowStep.update = jest.fn().mockResolvedValue({});
    prisma.document.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await expect(
      service.transition('1', '7', 'approve', 'Noted', regularUser),
    ).resolves.toMatchObject({ status: DocumentStatus.ForPlantManagerApproval });
  });

  it('allows an assigned legacy Noted By user to return a request without global return permission', async () => {
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        created_by: 8n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForNotedBy,
        action_requested: 'CREATE_REVISE',
        workflow_version_id: null,
        workflow_steps: [{
          workflow_step_id: 10n,
          stage: 'NOTED_BY',
          sequence: 1,
          assigned_user_id: 7n,
          status: 'PENDING',
        }],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.ForRevision });
    prisma.documentWorkflowStep.update.mockResolvedValue({});
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await expect(
      service.transition('1', '7', 'request-revision', 'Please correct the document number.', regularUser),
    ).resolves.toMatchObject({ status: DocumentStatus.ForRevision });
    expect(prisma.documentWorkflowStep.update).toHaveBeenCalledWith({
      where: { workflow_step_id: 10n },
      data: expect.objectContaining({
        status: 'RETURNED',
        acted_by_user_id: 7n,
        decision: 'request-revision',
        comments: 'Please correct the document number.',
      }),
    });
    expect(prisma.documentStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'request-revision',
        performed_by: 7n,
        remarks: 'Please correct the document number.',
      }),
    });
  });

  it('denies a non-assigned user without return permission', async () => {
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      created_by: 8n,
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.ForNotedBy,
      action_requested: 'CREATE_REVISE',
      workflow_steps: [{
        workflow_step_id: 10n,
        stage: 'NOTED_BY',
        sequence: 1,
        assigned_user_id: 9n,
        status: 'PENDING',
      }],
    });

    await expect(
      service.transition('1', '7', 'request-revision', 'Not assigned.', regularUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a reason when returning a request for revision', async () => {
    await expect(
      service.transition('1', '7', 'request-revision', '   ', regularUser),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.findUnique).not.toHaveBeenCalled();
  });

  it.each(['approve', 'request-revision', 'reject', 'complete'] as const)(
    'requires a decision remark for %s',
    async (action) => {
      await expect(
        service.transition('1', '7', action, '   ', regularUser),
      ).rejects.toThrow('A decision remark is required for this action.');
      expect(prisma.document.findUnique).not.toHaveBeenCalled();
    },
  );

  it('returns revision work to the previous workflow holder before the requester', async () => {
    const plantManager = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.approve-plant-manager'] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        created_by: 8n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForPlantManagerApproval,
        action_requested: 'CREATE_REVISE',
        workflow_version_id: 12n,
        workflow_steps: [{
          workflow_step_id: 9n,
          node_key: 'noted-by',
          stage: 'NOTED_BY',
          sequence: 1,
          assigned_user_id: 6n,
          status: 'APPROVED',
          acted_by_user_id: 6n,
          decision: 'approve',
          comments: 'Previously accepted',
        }, {
          workflow_step_id: 10n,
          node_key: 'plant-manager',
          stage: 'PLANT_MANAGER',
          sequence: 2,
          assigned_user_id: 7n,
          status: 'PENDING',
          on_return_node_key: 'later-review',
        }, {
          workflow_step_id: 11n,
          node_key: 'later-review',
          stage: 'DOCUMENT_CONTROLLER_ADMIN',
          sequence: 3,
          assigned_user_id: 5n,
          status: 'QUEUED',
        }],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.ForNotedBy });
    prisma.documentWorkflowStep.update.mockResolvedValue({});
    prisma.documentWorkflowStep.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await expect(
      service.transition('1', '7', 'request-revision', 'Fix the controlled reference.', plantManager),
    ).resolves.toMatchObject({ status: DocumentStatus.ForNotedBy });
    expect(prisma.documentWorkflowStep.update).toHaveBeenCalledWith({
      where: { workflow_step_id: 9n },
      data: expect.objectContaining({
        status: 'PENDING',
        acted_by_user_id: null,
        decision: null,
        comments: null,
      }),
    });
    expect(prisma.documentWorkflowStep.update).toHaveBeenCalledWith({
      where: { workflow_step_id: 10n },
      data: expect.objectContaining({ status: 'RETURNED', decision: 'request-revision' }),
    });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: DocumentStatus.ForNotedBy,
        workflow_current_node_key: 'noted-by',
      }),
    }));
  });

  it('returns revision work to the requester when the first workflow holder returns it', async () => {
    const notedBy = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.approve-noted-by'] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        created_by: 8n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForNotedBy,
        action_requested: 'CREATE_REVISE',
        workflow_version_id: 12n,
        workflow_steps: [{
          workflow_step_id: 10n,
          node_key: 'noted-by',
          stage: 'NOTED_BY',
          sequence: 1,
          assigned_user_id: 7n,
          status: 'PENDING',
          on_return_node_key: 'later-review',
        }, {
          workflow_step_id: 11n,
          node_key: 'later-review',
          stage: 'PLANT_MANAGER',
          sequence: 2,
          assigned_user_id: 6n,
          status: 'QUEUED',
        }],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.ForRevision });
    prisma.documentWorkflowStep.update.mockResolvedValue({});
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await expect(
      service.transition('1', '7', 'request-revision', 'Please revise.', notedBy),
    ).resolves.toMatchObject({ status: DocumentStatus.ForRevision });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: DocumentStatus.ForRevision,
        workflow_current_node_key: null,
      }),
    }));
  });

  it('prevents a request creator from approving their own assigned workflow step', async () => {
    const requesterApprover = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.approve-noted-by'] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      created_by: 7n,
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.ForNotedBy,
      action_requested: 'CREATE_REVISE',
      workflow_steps: [{
        workflow_step_id: 10n,
        stage: 'NOTED_BY',
        sequence: 1,
        assigned_user_id: 7n,
        status: 'PENDING',
      }],
    });

    await expect(service.transition('1', '7', 'approve', 'Self approval', requesterApprover))
      .rejects.toThrow('A request creator cannot approve their own request.');
  });

  it('allows the requester to approve an explicitly requester-assigned workflow step', async () => {
    const requesterApprover = {
      ...regularUser,
      role: { ...regularUser.role, permissions: [] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        created_by: 7n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForApproval,
        action_requested: 'CREATE_REVISE',
        workflow_version_id: 12n,
        workflow_steps: [{
          workflow_step_id: 10n,
          node_key: 'requester-review',
          stage: 'CUSTOM',
          sequence: 1,
          assigned_user_id: 7n,
          assignment_type: 'REQUESTER',
          assignment_source: 'REQUESTER',
          status: 'PENDING',
        }],
        assignments: [],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.Approved });
    prisma.documentWorkflowStep.update.mockResolvedValue({});
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await expect(
      service.transition('1', '7', 'approve', 'Requester approval', requesterApprover),
    ).resolves.toMatchObject({ status: DocumentStatus.Approved });
  });

  it('marks Softcopy attachments approved when Plant Manager approval is completed', async () => {
    const plantManager = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.approve-plant-manager'] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForPlantManagerApproval,
        action_requested: 'CREATE_REVISE',
        workflow_steps: [{
          workflow_step_id: 10n,
          stage: 'PLANT_MANAGER',
          sequence: 2,
          assigned_user_id: 7n,
          status: 'PENDING',
        }, {
          workflow_step_id: 11n,
          stage: 'DOCUMENT_CONTROLLER_ADMIN',
          sequence: 3,
          assigned_user_id: 8n,
          status: 'PENDING',
        }],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.ForDocumentControllerAdmin });
    prisma.softcopyDocument.findUnique.mockResolvedValue({ softcopy_id: 9n });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});
    prisma.documentWorkflowStep.update.mockResolvedValue({});
    prisma.softcopyAttachment.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.transition('1', '7', 'approve', 'Approved for processing', plantManager),
    ).resolves.toMatchObject({ status: DocumentStatus.ForDocumentControllerAdmin });
    expect(prisma.softcopyAttachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { softcopy_id: 9n, status: SoftcopyAttachmentStatus.PendingApproval },
      data: expect.objectContaining({
        status: SoftcopyAttachmentStatus.Approved,
        approved_by_user_id: 7n,
      }),
    }));
  });

  it('rejects new direct attachments on an already approved Softcopy', async () => {
    prisma.document.findFirst.mockResolvedValue({ document_id: 1n });
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.Completed,
      softcopy: { softcopy_id: 9n, category: { folder_name: 'policies' } },
    });

    await expect(
      service.addAttachments('1', adminUser, [{ originalname: 'scan.pdf' } as Express.Multer.File]),
    ).rejects.toThrow('Scanned attachments must be added through a Softcopy request before Plant Manager approval.');
  });

  it('marks Softcopy attachments rejected and removes their stored files', async () => {
    const plantManager = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.reject'] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.ForPlantManagerApproval,
        action_requested: 'CREATE_REVISE',
        workflow_steps: [{
          workflow_step_id: 10n,
          stage: 'PLANT_MANAGER',
          sequence: 2,
          assigned_user_id: 7n,
          status: 'PENDING',
        }],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.Rejected });
    prisma.softcopyDocument.findUnique.mockResolvedValue({ softcopy_id: 9n });
    prisma.softcopyAttachment.findMany.mockResolvedValue([
      { attachment_id: 11n, file_path: '/app/uploads/revisions/policies/reference.pdf' },
    ]);
    prisma.softcopyAttachment.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentWorkflowStep.update.mockResolvedValue({});
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});
    const removeStoredFile = jest.spyOn(service as any, 'removeStoredAttachmentFile').mockResolvedValue(undefined);

    await expect(
      service.transition('1', '7', 'reject', 'Attachment is not the required reference.', plantManager),
    ).resolves.toMatchObject({ status: DocumentStatus.Rejected });
    expect(prisma.softcopyAttachment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: SoftcopyAttachmentStatus.Rejected,
        rejected_by_user_id: 7n,
        rejection_reason: 'Attachment is not the required reference.',
      }),
    }));
    expect(removeStoredFile).toHaveBeenCalledWith('/app/uploads/revisions/policies/reference.pdf');
  });

  it('allows completion only to the configured final approver', async () => {
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      status: DocumentStatus.Approved,
      workflow_steps: [{
        workflow_step_id: 10n,
        sequence: 3,
        assigned_user_id: 8n,
        status: 'APPROVED',
      }],
    });

    await expect(
      service.transition('1', '7', 'complete', undefined, {
        ...regularUser,
        role: { ...regularUser.role, permissions: ['document-requests.complete'] },
      }),
    ).rejects.toThrow('Only the configured final approver can complete this request.');
  });

  it('records the release date when the final approver completes a Hardcopy request', async () => {
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        document_type: DocumentType.HARDCOPY,
        status: DocumentStatus.Approved,
        workflow_steps: [{
          workflow_step_id: 10n,
          stage: DocumentWorkflowStage.HARDCOPY_APPROVAL,
          sequence: 1,
          assigned_user_id: 7n,
          status: 'APPROVED',
        }],
        assignments: [],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.Completed });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await service.transition('1', '7', 'complete', 'Released', {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.complete'] },
    });

    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: DocumentStatus.Completed,
        date_released: expect.any(Date),
      }),
    }));
  });

  it('starts a new Softcopy revision request from the completed state', async () => {
    const revisionRequester = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.request-revision'] },
    } satisfies AuthenticatedUser;
    prisma.document.findUnique
      .mockResolvedValueOnce({
        document_id: 1n,
        created_by: 7n,
        document_type: DocumentType.SOFTCOPY,
        status: DocumentStatus.Completed,
        workflow_steps: [{
          workflow_step_id: 10n,
          stage: DocumentWorkflowStage.DOCUMENT_CONTROLLER_ADMIN,
          sequence: 3,
          assigned_user_id: 8n,
          status: 'APPROVED',
        }],
        assignments: [],
      })
      .mockResolvedValueOnce({ document_id: 1n, status: DocumentStatus.ForRevision });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.documentStatusHistory.create.mockResolvedValue({});

    await expect(
      service.transition('1', '7', 'request-revision', 'Annual controlled update', revisionRequester),
    ).resolves.toMatchObject({ status: DocumentStatus.ForRevision });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: DocumentStatus.ForRevision }),
    }));
  });

  it('allows a completed document to be disposed', async () => {
    prisma.document.findFirst.mockResolvedValue({ document_id: 1n });
    prisma.document.findUnique.mockResolvedValue({
      status: DocumentStatus.Completed,
      status_before_disposal: null,
    });
    prisma.user.findUnique.mockResolvedValue({ user_id: 1n });
    prisma.document.update.mockResolvedValue({ status: DocumentStatus.Disposed });

    await expect(service.dispose('1', {
      disposal_action: DisposalAction.Shred,
      disposal_remarks: 'Retention period ended.',
      disposed_by_user_id: '1',
    }, adminUser)).resolves.toMatchObject({ status: DocumentStatus.Disposed });
  });

  it('reads the document number and title from uploaded softcopy content', async () => {
    await expect(
      service.analyzeUpload({
        buffer: Buffer.from('Document No.: DMS-QMS-042\nDocument Title: Controlled Quality Manual'),
        originalname: 'quality-manual.txt',
        mimetype: 'text/plain',
      } as Express.Multer.File),
    ).resolves.toMatchObject({
      document_number: 'DMS-QMS-042',
      document_title: 'CONTROLLED QUALITY MANUAL',
      detected: true,
    });
  });

  it('lists documents with hardcopy and softcopy summaries', async () => {
    const documents = [{ document_id: 1n, document_type: DocumentType.SOFTCOPY, softcopy: { document_number: 'DOC-001' } }];
    prisma.document.findMany.mockResolvedValue(documents);
    prisma.document.count.mockResolvedValue(1);

    await expect(service.findAll({ page: 2, limit: 5 } as any)).resolves.toEqual({
      items: [{ ...documents[0], document_number: 'DOC-001' }],
      meta: {
        total: 1,
        page: 2,
        limit: 5,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: true,
      },
    });
  });

  it('searches only approved public documents with bounded pagination', async () => {
    const documents = [{ document_id: 1n, document_type: DocumentType.SOFTCOPY, softcopy: { document_number: 'DOC-001' } }];
    prisma.document.findMany.mockResolvedValue(documents);
    prisma.document.count.mockResolvedValue(1);

    await expect(
      service.findPublicDocuments({ query: 'quality', page: 1, limit: 12 }, adminUser),
    ).resolves.toMatchObject({
      items: documents,
      meta: { total: 1, page: 1, limit: 12 },
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: DocumentStatus.Approved }),
        skip: 0,
        take: 12,
      }),
    );
  });

  it('limits document search portal results to a regular user assignments', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.count.mockResolvedValue(0);

    await service.findPublicDocuments({ page: 1, limit: 12 }, regularUser);

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignments: { some: { user_id: 7n } },
        }),
      }),
    );
  });

  it('returns approved public document details without using the private detail query', async () => {
    const document = {
      document_id: 1n,
      document_type: DocumentType.SOFTCOPY,
      softcopy: { document_number: 'DOC-001' },
      status: DocumentStatus.Approved,
    };
    prisma.document.findFirst.mockResolvedValue(document);

    await expect(service.findPublicDocument('1', adminUser)).resolves.toMatchObject({ document_number: 'DOC-001' });
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { document_id: 1n, status: DocumentStatus.Approved },
        select: expect.not.objectContaining({ creator: true }),
      }),
    );
    expect(prisma.document.findUnique).not.toHaveBeenCalled();
  });

  it('runs public assistant search against approved public-safe document fields only', async () => {
    const document = {
      document_id: 1n,
      document_title: 'Quality Manual',
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.Approved,
      created_at: new Date(),
      hardcopy: null,
      softcopy: {
        document_number: 'QM-001',
        category: { category_name: 'Quality' },
        current_revision: { file_name: 'quality-manual.pdf' },
      },
    };
    prisma.document.findMany.mockResolvedValue([document]);

    await expect(
      service.publicAssistantSearch({ query: 'quality manual', limit: 12 }),
    ).resolves.toMatchObject({
      provider: 'local-search',
      usedFallback: true,
      matches: [document],
      suggestions: expect.arrayContaining(['Quality Manual', 'Quality']),
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: DocumentStatus.Approved },
        select: expect.not.objectContaining({
          requested_by_name: true,
          disposal_remarks: true,
          creator: expect.anything(),
        }),
      }),
    );
  });

  it('hides non-public or missing documents', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(service.findPublicDocument('999', adminUser)).rejects.toThrow(
      'Public document was not found.',
    );
  });

  it('creates a hardcopy document and linked hardcopy record', async () => {
    const createdDocument = { document_id: 1n };
    const detailedDocument = { document_id: 1n, hardcopy: {}, softcopy: null };
    prisma.document.create.mockResolvedValue(createdDocument);
    prisma.document.findUnique.mockResolvedValue(detailedDocument);
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 1n });

    await expect(
      service.createRequest({
        document_title: 'Quality Manual',
        document_type: DocumentType.HARDCOPY,
        department: 'Quality Assurance',
        business_document_type: 'Manual',
        action_requested: 'CANCELLATION',
        brief_description: 'This belongs to the Softcopy request form.',
        area_id: '1',
        location_id: '2',
        asset_id: '3',
        specific_id: '4',
        sequence_id: '5',
      } as any, '6'),
    ).resolves.toBe(detailedDocument);

    expect(prisma.hardcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 1n,
        area_id: 1n,
        location_id: 2n,
        asset_id: 3n,
        specific_id: 4n,
        sequence_id: 5n,
        retention_enabled: false,
        retention_start_date: null,
        retention_end_date: null,
      },
    });
  });

  it('uses the selected location hierarchy as the hardcopy storage route', async () => {
    prisma.document.create.mockResolvedValue({ document_id: 8n });
    prisma.document.findUnique.mockResolvedValue({ document_id: 8n, hardcopy: {}, softcopy: null });
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 8n });
    prisma.location.findUnique.mockResolvedValue({
      asset_id: 30n,
      asset: { specific_id: 20n, specific: { area_id: 10n } },
    });

    await service.createRequest({
      document_title: 'Location routed record',
      document_type: DocumentType.HARDCOPY,
      area_id: '1',
      specific_id: '2',
      asset_id: '3',
      location_id: '40',
      sequence_id: '50',
    } as any, '6');

    expect(prisma.hardcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 8n,
        area_id: 10n,
        specific_id: 20n,
        asset_id: 30n,
        location_id: 40n,
        sequence_id: 50n,
        retention_enabled: false,
        retention_start_date: null,
        retention_end_date: null,
      },
    });

    const createdData = prisma.document.create.mock.calls[0][0].data;
    expect(createdData).not.toHaveProperty('department');
    expect(createdData).not.toHaveProperty('business_document_type');
    expect(createdData).not.toHaveProperty('action_requested');
    expect(createdData).not.toHaveProperty('brief_description');
  });

  it('creates a softcopy document and linked softcopy record', async () => {
    const createdDocument = { document_id: 1n };
    const detailedDocument = { document_id: 1n, hardcopy: null, softcopy: {} };
    prisma.document.create.mockResolvedValue(createdDocument);
    prisma.document.findUnique.mockResolvedValue(detailedDocument);
    prisma.softcopyDocument.create.mockResolvedValue({ softcopy_id: 1n });
    prisma.softcopyCategory.findUnique.mockResolvedValue({
      softcopy_category_id: 7n,
      folder_name: 'uncategorized',
      is_active: true,
    });

    await expect(
      service.createRequest({
        document_number: 'DOC-001',
        series_number: 'SERIES-001',
        document_title: 'Quality Manual',
        document_type: DocumentType.SOFTCOPY,
      } as any, '6'),
    ).resolves.toBe(detailedDocument);

    expect(prisma.softcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 1n,
        document_number: 'DOC-001',
        series_number: 'SERIES-001',
        softcopy_category_id: 7n,
      },
    });
  });

  it('requires a file for revisions', async () => {
    await expect(
      service.createRevision('1', { uploaded_by: '2' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires a Document Number and Series Number for Softcopy documents', async () => {
    await expect(service.createRequest({
      document_title: 'Missing identifiers',
      document_type: DocumentType.SOFTCOPY,
      series_number: 'SERIES-001',
    } as any, '7', undefined, regularUser)).rejects.toThrow(
      'Document Number is required for every Softcopy document.',
    );

    await expect(service.createRequest({
      document_title: 'Missing series',
      document_type: DocumentType.SOFTCOPY,
      document_number: 'DOC-001',
    } as any, '7', undefined, regularUser)).rejects.toThrow(
      'Series Number is required for every Softcopy document.',
    );
  });

  it('allows a reused Document Number only when its Series Number differs', async () => {
    prisma.softcopyDocument.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ softcopy_id: 22n });
    prisma.documentRevision.findFirst.mockResolvedValue(null);

    await expect((service as any).assertDocumentSeriesAvailable('DOC-001', 'SERIES-002')).resolves.toBeUndefined();
    await expect((service as any).assertDocumentSeriesAvailable('doc-001', 'series-001')).rejects.toThrow(
      'Series Number series-001 is already used for Document Number doc-001.',
    );

    expect(prisma.softcopyDocument.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({
        document_number: { equals: 'DOC-001', mode: 'insensitive' },
        series_number: { equals: 'SERIES-002', mode: 'insensitive' },
      }),
    }));
  });

  it('rejects a controlled file on a normal DCR before approvals complete', async () => {
    const file = { originalname: 'premature.pdf' } as Express.Multer.File;

    await expect(service.createRequest({
      document_title: 'Quality Manual',
      document_type: DocumentType.SOFTCOPY,
      document_number: 'DOC-001',
      series_number: 'SERIES-001',
      action: 'SUBMIT',
    } as any, '7', file, regularUser)).rejects.toThrow(
      'Revision files can be uploaded only after the Document Control Request completes all required approvals.',
    );

    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('requires explicit direct-create authority for a Softcopy without a DCR', async () => {
    const file = { originalname: 'controlled.pdf' } as Express.Multer.File;

    await expect(service.createRequest({
      document_title: 'Direct Manual',
      document_type: DocumentType.SOFTCOPY,
      document_number: 'DOC-DIRECT',
      series_number: 'SERIES-DIRECT',
      direct_create: 'true',
      direct_creation_reason: 'Authorized initial issue',
      action: 'SUBMIT',
    } as any, '7', file, regularUser)).rejects.toThrow(ForbiddenException);

    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('validates controlled-copy metadata before storing a final revision', async () => {
    const file = { originalname: 'approved.pdf' } as Express.Multer.File;
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.Approved,
      softcopy: {
        softcopy_id: 9n,
        document_number: 'DOC-001',
        category: { folder_name: 'policies' },
      },
    });

    await expect(service.createRevision('1', {
      uploaded_by: '1',
      set_as_current: 'true',
    } as any, file, adminUser)).rejects.toThrow(
      'Document Number, Effectivity Date, Series Number, and Page Number are required before uploading and finalizing a controlled copy.',
    );

    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
  });

  it('allows staff to manage a document assigned to them', async () => {
    const staffUser: AuthenticatedUser = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['documents.manage-own'] },
    };
    prisma.document.findFirst.mockResolvedValue({ document_id: 1n });
    jest.spyOn(service, 'update').mockResolvedValue({ document_id: '1' } as any);

    await expect(
      service.updateOwned('1', { document_title: 'Assigned document' } as any, staffUser),
    ).resolves.toEqual({ document_id: '1' });

    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: {
        document_id: 1n,
        OR: [
          { created_by: 7n },
          { assignments: { some: { user_id: 7n } } },
        ],
      },
      select: { document_id: true },
    });
  });

  it('prevents a request editor from revising another users request', async () => {
    const file = { originalname: 'revision.pdf' } as Express.Multer.File;
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      created_by: 99n,
      status: DocumentStatus.ForRevision,
      document_type: DocumentType.SOFTCOPY,
      softcopy: null,
    });
    const requestEditor: AuthenticatedUser = {
      ...regularUser,
      role: { ...regularUser.role, permissions: ['document-requests.edit'] },
    };

    await expect(
      service.createRevision('1', { uploaded_by: '99' } as any, file, requestEditor),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not allow a revision upload to bypass final Softcopy approval', async () => {
    const file = {
      originalname: 'manual.pdf',
      filename: '123-manual.pdf',
      path: 'uploads/revisions/123-manual.pdf',
      size: 2048,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      document_type: DocumentType.SOFTCOPY,
      softcopy: {
        softcopy_id: 9n,
        category: { folder_name: 'policies' },
      },
    });
    jest
      .spyOn(service as any, 'moveRevisionUpload')
      .mockResolvedValue('uploads/revisions/policies/123-manual.pdf');
    prisma.documentRevision.findFirst.mockResolvedValue(null);
    prisma.documentRevision.create.mockResolvedValue({
      revision_id: 10n,
      revision_number: '000',
    });
    prisma.softcopyDocument.update.mockResolvedValue({ softcopy_id: 9n });

    await expect(service.createRevision('1', { uploaded_by: '2', set_as_current: 'true' } as any, file))
      .rejects.toThrow('A revision becomes current only after the complete Softcopy approval workflow.');
    expect(prisma.documentRevision.create).not.toHaveBeenCalled();
    expect(prisma.softcopyDocument.update).not.toHaveBeenCalled();
  });

  it('uses the supplied revision number when creating a revision', async () => {
    const file = {
      originalname: 'manual.pdf',
      size: 2048,
      mimetype: 'application/pdf',
    } as Express.Multer.File;
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      document_type: DocumentType.SOFTCOPY,
      status: DocumentStatus.Draft,
      softcopy: { softcopy_id: 9n, document_number: 'DOC-001', category: { folder_name: 'policies' } },
    });
    jest.spyOn(service as any, 'moveRevisionUpload').mockResolvedValue('uploads/revisions/policies/manual.pdf');
    prisma.documentRevision.findFirst.mockResolvedValue(null);
    prisma.documentRevision.create.mockResolvedValue({ revision_id: 10n, revision_number: '005' });

    await service.createRevision('1', { uploaded_by: '2', revision_number: '005', series_number: 'SERIES-005' } as any, file);

    expect(prisma.documentRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ revision_number: '005' }),
    }));
  });

  it('blocks staff revision uploads after approval or completion', async () => {
    const file = { originalname: 'revision.pdf' } as Express.Multer.File;
    prisma.document.findUnique.mockResolvedValue({
      document_id: 1n,
      created_by: 7n,
      status: DocumentStatus.Completed,
      document_type: DocumentType.SOFTCOPY,
      softcopy: { softcopy_id: 9n, category: { folder_name: 'policies' } },
    });
    prisma.document.findFirst.mockResolvedValue({ document_id: 1n });
    const staffUser: AuthenticatedUser = {
      ...regularUser,
      user_id: '7',
      role: { ...regularUser.role, permissions: ['documents.manage-own'] },
    };

    await expect(
      service.createRevision('1', { uploaded_by: '7' } as any, file, staffUser),
    ).rejects.toThrow(ConflictException);
  });

  it('returns revisions for the document softcopy record', async () => {
    prisma.softcopyDocument.findUnique.mockResolvedValue({
      revisions: [
        {
          revision_id: 1n,
          file_name: 'new.xlsx',
          file_path:
            '/app/uploads/revisions/1783913190729-c9cef7a2-eb1e-474e-bb0d-026f606352c3-new.xlsx',
        },
      ],
    });

    await expect(service.findRevisions('1')).resolves.toEqual([
      {
        revision_id: 1n,
        file_name: 'new.xlsx',
        file_path:
          '/app/uploads/revisions/1783913190729-c9cef7a2-eb1e-474e-bb0d-026f606352c3-new.xlsx',
        file_url:
          'http://localhost:3000/uploads/revisions/1783913190729-c9cef7a2-eb1e-474e-bb0d-026f606352c3-new.xlsx',
      },
    ]);
  });

  it('batch import saves missing hardcopy references before creating the document', async () => {
    jest
      .spyOn(service as any, 'parseBatchWorkbook')
      .mockResolvedValue([
        {
          sheet_name: 'Master',
          row_number: 3,
          sequence: 'SEQ-01',
          document_name: 'Controlled Memo',
          location_name: 'ADMIN OFFICE',
          asset_number: '',
          area_name: 'HQ',
          specific_name: 'CABINET A',
        },
      ]);
    jest
      .spyOn(service as any, 'deleteUploadedBatchFile')
      .mockResolvedValue(undefined);

    prisma.area.findMany.mockResolvedValue([]);
    prisma.location.findMany.mockResolvedValue([]);
    prisma.specific.findMany.mockResolvedValue([]);
    prisma.sequence.findMany.mockResolvedValue([]);
    prisma.assetNumber.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.area.create.mockResolvedValue({ area_id: 11n, area_name: 'HQ' });
    prisma.location.create.mockResolvedValue({
      location_id: 12n,
      location_name: 'ADMIN OFFICE',
    });
    prisma.specific.create.mockResolvedValue({
      specific_id: 13n,
      specific_name: 'CABINET A',
      area_id: 11n,
    });
    prisma.sequence.create.mockResolvedValue({
      sequence_id: 14n,
      sequence_code: 'SEQ-01',
    });
    prisma.assetNumber.create.mockResolvedValue({
      asset_id: 15n,
      asset_number: 'PK-PNK-0001',
    });
    prisma.document.create.mockResolvedValue({ document_id: 21n });
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 31n });

    await expect(
      service.batchHardcopyImport(
        { created_by: '6' } as any,
        { path: 'uploads/batch.xlsx' } as Express.Multer.File,
      ),
    ).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 1,
        skipped: 0,
        errors: 0,
      },
    });

    expect(prisma.area.create).toHaveBeenCalledWith({
      data: {
        area_name: 'HQ',
      },
      select: {
        area_id: true,
        area_name: true,
      },
    });
    expect(prisma.location.create).toHaveBeenCalledWith({
      data: {
        location_name: 'ADMIN OFFICE',
      },
      select: {
        location_id: true,
        location_name: true,
      },
    });
    expect(prisma.specific.create).toHaveBeenCalledWith({
      data: {
        specific_name: 'CABINET A',
        area_id: 11n,
      },
      select: {
        specific_id: true,
        specific_name: true,
        area_id: true,
      },
    });
    expect(prisma.sequence.create).toHaveBeenCalledWith({
      data: {
        sequence_code: 'SEQ-01',
      },
      select: {
        sequence_id: true,
        sequence_code: true,
      },
    });
    expect(prisma.hardcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 21n,
        area_id: 11n,
        location_id: 12n,
        specific_id: 13n,
        sequence_id: 14n,
      },
    });
  });

  it('batch import creates a missing asset number before creating the hardcopy document', async () => {
    jest
      .spyOn(service as any, 'parseBatchWorkbook')
      .mockResolvedValue([
        {
          sheet_name: 'Master',
          row_number: 4,
          sequence: 'SEQ-01',
          document_name: 'Controlled Memo',
          location_name: 'ADMIN OFFICE',
          asset_number: '012-0000424500002',
          area_name: 'HQ',
          specific_name: 'CABINET A',
        },
      ]);
    jest
      .spyOn(service as any, 'deleteUploadedBatchFile')
      .mockResolvedValue(undefined);

    prisma.area.findMany.mockResolvedValue([{ area_id: 11n, area_name: 'HQ' }]);
    prisma.location.findMany.mockResolvedValue([
      { location_id: 12n, location_name: 'ADMIN OFFICE' },
    ]);
    prisma.specific.findMany.mockResolvedValue([
      {
        specific_id: 13n,
        specific_name: 'CABINET A',
        area_id: 11n,
      },
    ]);
    prisma.sequence.findMany.mockResolvedValue([
      {
        sequence_id: 14n,
        sequence_code: 'SEQ-01',
      },
    ]);
    prisma.assetNumber.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.assetNumber.create.mockResolvedValue({
      asset_id: 19n,
      asset_number: '012-0000424500002',
      hardcopy: null,
    });
    prisma.document.create.mockResolvedValue({ document_id: 24n });
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 34n });

    await expect(
      service.batchHardcopyImport(
        { created_by: '6' } as any,
        { path: 'uploads/batch.xlsx' } as Express.Multer.File,
      ),
    ).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 1,
        skipped: 0,
        errors: 0,
      },
    });

    expect(prisma.assetNumber.create).toHaveBeenCalledWith({
      data: {
        asset_number: '012-0000424500002',
      },
      select: {
        asset_id: true,
        asset_number: true,
      },
    });
    expect(prisma.hardcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 24n,
        area_id: 11n,
        location_id: 12n,
        asset_id: 19n,
        specific_id: 13n,
        sequence_id: 14n,
      },
    });
  });

  it('batch import matches asset numbers even when workbook spacing differs around hyphens', async () => {
    jest
      .spyOn(service as any, 'parseBatchWorkbook')
      .mockResolvedValue([
        {
          sheet_name: 'Master',
          row_number: 5,
          sequence: 'SEQ-02',
          document_name: 'Filed Notice',
          location_name: 'ADMIN OFFICE',
          asset_number: 'PK - PNK - 00107744',
          area_name: 'HQ',
          specific_name: 'CABINET B',
        },
      ]);
    jest
      .spyOn(service as any, 'deleteUploadedBatchFile')
      .mockResolvedValue(undefined);

    prisma.area.findMany.mockResolvedValue([{ area_id: 11n, area_name: 'HQ' }]);
    prisma.location.findMany.mockResolvedValue([
      { location_id: 12n, location_name: 'ADMIN OFFICE' },
    ]);
    prisma.specific.findMany.mockResolvedValue([
      {
        specific_id: 13n,
        specific_name: 'CABINET B',
        area_id: 11n,
      },
    ]);
    prisma.sequence.findMany.mockResolvedValue([
      {
        sequence_id: 14n,
        sequence_code: 'SEQ-02',
      },
    ]);
    prisma.assetNumber.findMany.mockResolvedValue([
      {
        asset_id: 15n,
        asset_number: 'PK-PNK-00107744',
        hardcopy: null,
      },
    ]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.create.mockResolvedValue({ document_id: 22n });
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 32n });

    await expect(
      service.batchHardcopyImport(
        { created_by: '6' } as any,
        { path: 'uploads/batch.xlsx' } as Express.Multer.File,
      ),
    ).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 1,
        skipped: 0,
        errors: 0,
      },
    });

    expect(prisma.hardcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 22n,
        area_id: 11n,
        location_id: 12n,
        asset_id: 15n,
        specific_id: 13n,
        sequence_id: 14n,
      },
    });
  });

  it('batch import matches asset numbers across different separator formatting', async () => {
    jest
      .spyOn(service as any, 'parseBatchWorkbook')
      .mockResolvedValue([
        {
          sheet_name: 'Master',
          row_number: 6,
          sequence: 'SEQ-03',
          document_name: 'Retention Slip',
          location_name: 'ADMIN OFFICE',
          asset_number: '012-0000424500001',
          area_name: 'HQ',
          specific_name: 'CABINET C',
        },
      ]);
    jest
      .spyOn(service as any, 'deleteUploadedBatchFile')
      .mockResolvedValue(undefined);

    prisma.area.findMany.mockResolvedValue([{ area_id: 11n, area_name: 'HQ' }]);
    prisma.location.findMany.mockResolvedValue([
      { location_id: 12n, location_name: 'ADMIN OFFICE' },
    ]);
    prisma.specific.findMany.mockResolvedValue([
      {
        specific_id: 16n,
        specific_name: 'CABINET C',
        area_id: 11n,
      },
    ]);
    prisma.sequence.findMany.mockResolvedValue([
      {
        sequence_id: 17n,
        sequence_code: 'SEQ-03',
      },
    ]);
    prisma.assetNumber.findMany.mockResolvedValue([
      {
        asset_id: 18n,
        asset_number: '0120000424500001',
      },
    ]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.create.mockResolvedValue({ document_id: 23n });
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 33n });

    await expect(
      service.batchHardcopyImport(
        { created_by: '6' } as any,
        { path: 'uploads/batch.xlsx' } as Express.Multer.File,
      ),
    ).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 1,
        skipped: 0,
        errors: 0,
      },
    });

    expect(prisma.hardcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 23n,
        area_id: 11n,
        location_id: 12n,
        asset_id: 18n,
        specific_id: 16n,
        sequence_id: 17n,
      },
    });
  });

  it('batch import reuses an asset number that is already linked to another hardcopy document', async () => {
    jest
      .spyOn(service as any, 'parseBatchWorkbook')
      .mockResolvedValue([
        {
          sheet_name: 'Master',
          row_number: 7,
          sequence: 'SEQ-04',
          document_name: 'Filed Notice',
          location_name: 'ADMIN OFFICE',
          asset_number: '012-0000424500002',
          area_name: 'HQ',
          specific_name: 'CABINET D',
        },
      ]);
    jest
      .spyOn(service as any, 'deleteUploadedBatchFile')
      .mockResolvedValue(undefined);

    prisma.area.findMany.mockResolvedValue([{ area_id: 11n, area_name: 'HQ' }]);
    prisma.location.findMany.mockResolvedValue([
      { location_id: 12n, location_name: 'ADMIN OFFICE' },
    ]);
    prisma.specific.findMany.mockResolvedValue([]);
    prisma.sequence.findMany.mockResolvedValue([]);
    prisma.assetNumber.findMany.mockResolvedValue([
      {
        asset_id: 19n,
        asset_number: '0120000424500002',
      },
    ]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.create.mockResolvedValue({ document_id: 25n });
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 35n });

    await expect(
      service.batchHardcopyImport(
        { created_by: '6' } as any,
        { path: 'uploads/batch.xlsx' } as Express.Multer.File,
      ),
    ).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 1,
        skipped: 0,
        errors: 0,
      },
    });

    expect(prisma.document.create).toHaveBeenCalledWith({
      data: {
        document_title: 'FILED NOTICE',
        document_type: DocumentType.HARDCOPY,
        status: 'Approved',
        legacy_imported: true,
        legacy_import_note: 'Imported Hardcopy record; approval history was not recreated.',
        created_by: 6n,
        requested_by_user_id: 6n,
      },
    });
    expect(prisma.hardcopyDocument.create).toHaveBeenCalledWith({
      data: {
        document_id: 25n,
        area_id: 11n,
        location_id: 12n,
        asset_id: 19n,
      },
    });
  });

  it('batch import creates a placeholder title when the workbook document name is blank', async () => {
    jest
      .spyOn(service as any, 'parseBatchWorkbook')
      .mockResolvedValue([
        {
          sheet_name: 'Master',
          row_number: 205,
          sequence: '89',
          document_name: '',
          location_name: 'AC',
          asset_number: 'PK-PNK-00106945',
          area_name: 'ADMIN OFFICE',
          specific_name: '',
        },
      ]);
    jest
      .spyOn(service as any, 'deleteUploadedBatchFile')
      .mockResolvedValue(undefined);

    prisma.area.findMany.mockResolvedValue([
      { area_id: 11n, area_name: 'ADMIN OFFICE' },
    ]);
    prisma.location.findMany.mockResolvedValue([
      { location_id: 12n, location_name: 'AC' },
    ]);
    prisma.specific.findMany.mockResolvedValue([]);
    prisma.sequence.findMany.mockResolvedValue([]);
    prisma.assetNumber.findMany.mockResolvedValue([
      {
        asset_id: 19n,
        asset_number: 'PK-PNK-00106945',
      },
    ]);
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.create.mockResolvedValue({ document_id: 26n });
    prisma.hardcopyDocument.create.mockResolvedValue({ hardcopy_id: 36n });

    await expect(
      service.batchHardcopyImport(
        { created_by: '6' } as any,
        { path: 'uploads/batch.xlsx' } as Express.Multer.File,
      ),
    ).resolves.toMatchObject({
      summary: {
        total: 1,
        created: 1,
        skipped: 0,
        errors: 0,
      },
      results: [
        {
          status: 'created',
        document_name: 'UNTITLED IMPORTED HARDCOPY ROW 205',
        },
      ],
    });

    expect(prisma.document.create).toHaveBeenCalledWith({
      data: {
        document_title: 'UNTITLED IMPORTED HARDCOPY ROW 205',
        document_type: DocumentType.HARDCOPY,
        status: 'Approved',
        legacy_imported: true,
        legacy_import_note: 'Imported Hardcopy record; approval history was not recreated.',
        created_by: 6n,
        requested_by_user_id: 6n,
      },
    });
  });
  it('rejects arbitrary workflow versions on a request', async () => {
    await expect(service.createRequest({ document_type: DocumentType.SOFTCOPY, document_title: 'Test', document_number: 'T-1', series_number: '1', workflow_version_id: '999' } as any, '6')).rejects.toThrow('Only the current system-default');
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('fails closed when no system default is published', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(null);
    await expect(service.createRequest({ document_type: DocumentType.SOFTCOPY, document_title: 'Test', document_number: 'T-1', series_number: '1' } as any, '6')).rejects.toThrow('No active system-default');
  });

  it('does not disclose approval details to an unassigned reviewer', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    await expect(service.findApprovalDocument('12', regularUser)).rejects.toThrow('no longer assigned');
    expect(prisma.document.findFirst).toHaveBeenCalledTimes(1);
    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.AND[0].document_id).toBe(12n);
    expect(where.AND[1].OR[0].workflow_steps.some.assigned_user_id).toBe(7n);
  });

  it('loads approval details with the queue scope in one query', async () => {
    prisma.document.findFirst.mockResolvedValue({ document_id: 12n });

    await expect(service.findApprovalDocument('12', regularUser)).resolves.toMatchObject({ document_id: 12n });

    expect(prisma.document.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.document.findFirst.mock.calls[0][0].include).toEqual(expect.objectContaining({
      workflow_steps: expect.any(Object),
      softcopy: expect.any(Object),
    }));
  });

  it('invalidates a controlled artifact when its revision becomes historical', () => {
    const revision = { revision_id: 1n, file_path: 'source.docx', revision_number: '1', effective_date: null, new_effective_date: null, is_current: true, is_historical: false };
    const fingerprint = (value: any) => (service as any).revisionArtifactFingerprint(value, DocumentStatus.Completed, 'DOC-1', 'CONTROLLED', { size: 100, mtimeMs: 1 });
    expect(fingerprint(revision)).not.toBe(fingerprint({ ...revision, is_current: false, is_historical: true }));
  });

});
