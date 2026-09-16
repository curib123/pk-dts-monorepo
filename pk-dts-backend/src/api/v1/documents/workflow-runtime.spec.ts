import { DocumentsService } from './documents.service';

const graph = {
  schema_version: 2, start_node_key: 'review',
  nodes: [
    { key: 'review', type: 'APPROVAL', label: 'Technical review', stage: 'CUSTOM', assignment: { type: 'REQUESTER_LEADER' } },
    { key: 'extra', type: 'APPROVAL', label: 'Extra review', stage: 'CUSTOM', assignment: { type: 'USER', user_id: '8' } },
    { key: 'end', type: 'END', label: 'Approved' },
  ],
  edges: [
    { key: 'approved', from: 'review', to: 'end', outcome: 'APPROVE' },
    { key: 'fallback', from: 'review', to: 'extra', outcome: 'DEFAULT' },
  ],
};

describe('Workflow Builder execution', () => {
  let service: any;
  let prisma: any;
  const actor: any = { user_id: '7', firstname: 'Assigned', lastname: 'Reviewer', role: { role_name: 'Staff', permissions: [] } };
  beforeEach(() => {
    prisma = {
      document: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
      documentWorkflowStep: { update: jest.fn(), updateMany: jest.fn(), createMany: jest.fn() },
      documentStatusHistory: { create: jest.fn() },
      documentApproverConfiguration: { findUnique: jest.fn(), upsert: jest.fn() },
      workflowVersion: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ workflow_definition: { workflow_key: 'system-softcopy-standard' } }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ firstname: 'Assigned', lastname: 'Reviewer' }), findFirst: jest.fn(), findMany: jest.fn() },
      $transaction: (fn: any) => fn(prisma),
    };
    service = new DocumentsService(prisma);
  });

  it('ends at the explicit outcome instead of following the default branch', () => {
    const plan = service.workflowGraphToPlan(graph, { document_type: 'SOFTCOPY' });
    expect(plan).toHaveLength(1);
    expect(plan[0].on_approve_node_key).toBeUndefined();
  });

  it('uses the default when the explicit condition does not match', () => {
    const conditional = { ...graph, edges: graph.edges.map(edge => edge.outcome === 'APPROVE'
      ? { ...edge, conditions: [{ field: 'action_requested', operator: 'EQUALS', value: 'CANCELLATION' }] } : edge) };
    const plan = service.workflowGraphToPlan(conditional, { document_type: 'SOFTCOPY', action_requested: 'CREATE' });
    expect(plan[0].on_approve_node_key).toBe('extra');
    expect(plan).toHaveLength(2);
  });

  it('rejects unmatched conditions instead of silently approving', () => {
    const conditional = { ...graph, edges: [{ ...graph.edges[0], conditions: [{ field: 'document_type', operator: 'EQUALS', value: 'HARDCOPY' }] }] };
    expect(() => service.workflowGraphToPlan(conditional, { document_type: 'SOFTCOPY' })).toThrow('No approval path matches');
  });

  it('rejects ambiguous matching branches', () => {
    const ambiguous = { ...graph, edges: [...graph.edges, { key: 'duplicate', from: 'review', to: 'extra', outcome: 'APPROVE' }] };
    expect(() => service.workflowGraphToPlan(ambiguous, { document_type: 'SOFTCOPY' })).toThrow('multiple matching');
  });

  it.each(['approve', 'reject'])('follows the configured %s branch', async action => {
    const permission = action === 'reject' ? 'document-requests.reject' : 'custom.review';
    prisma.document.findUnique.mockResolvedValueOnce({
      document_id: 1n, document_type: 'HARDCOPY', created_by: 3n, status: 'PendingApproval', workflow_version_id: 2n,
      workflow_current_node_key: 'review', workflow_steps: [
        { workflow_step_id: 10n, node_key: 'review', stage: 'CUSTOM', assigned_user_id: 7n, status: 'PENDING', required_permission: 'custom.review',
          on_approve_node_key: 'extra', on_reject_node_key: 'extra', on_return_node_key: 'extra' },
        { workflow_step_id: 11n, node_key: 'extra', stage: 'CUSTOM', assigned_user_id: 8n, status: 'QUEUED' },
      ],
    }).mockResolvedValueOnce({ document_id: 1n, status: 'PendingApproval' });
    await service.transition('1', '7', action, '', { ...actor, role: { ...actor.role, permissions: [permission, 'custom.review'] } });
    expect(prisma.documentWorkflowStep.update).toHaveBeenCalledWith({ where: { workflow_step_id: 11n }, data: { status: 'PENDING' } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workflow_current_node_key: 'extra' }) }));
  });

  it('allows an assigned custom approver without legacy Hardcopy permissions', async () => {
    prisma.document.findUnique.mockResolvedValueOnce({
      document_id: 1n, document_type: 'HARDCOPY', created_by: 3n, status: 'PendingApproval', workflow_steps: [
        { workflow_step_id: 10n, node_key: 'review', stage: 'CUSTOM', assigned_user_id: 7n, status: 'PENDING' },
      ],
    }).mockResolvedValueOnce({ document_id: 1n, status: 'Approved' });
    await expect(service.transition('1', '7', 'approve', '', actor)).resolves.toMatchObject({ status: 'Approved' });
  });

  it('treats an explicitly selected Builder user as the approval authority', async () => {
    prisma.document.findUnique.mockResolvedValueOnce({
      document_id: 1n, document_type: 'HARDCOPY', created_by: 3n, status: 'PendingApproval', workflow_version_id: 2n, workflow_steps: [
        { workflow_step_id: 10n, node_key: 'manager-review', stage: 'PLANT_MANAGER', assignment_type: 'USER', assigned_user_id: 7n, status: 'PENDING' },
      ],
    }).mockResolvedValueOnce({ document_id: 1n, status: 'Approved' });

    await expect(service.transition('1', '7', 'approve', '', actor)).resolves.toMatchObject({ status: 'Approved' });
  });

  it.each(['Cancelled', 'Draft', 'Rejected'])('cannot approve a stale pending step on a %s request', async status => {
    prisma.document.findUnique.mockResolvedValue({ document_id: 1n, document_type: 'HARDCOPY', created_by: 3n, status, workflow_steps: [
      { workflow_step_id: 10n, node_key: 'review', stage: 'CUSTOM', assigned_user_id: 7n, status: 'PENDING' },
    ] });
    await expect(service.transition('1', '7', 'approve', '', actor)).rejects.toThrow(`Cannot approve a ${status} request.`);
    expect(prisma.documentWorkflowStep.update).not.toHaveBeenCalled();
  });

  it('denies a custom decision when its configured permission is missing', async () => {
    prisma.document.findUnique.mockResolvedValue({ document_id: 1n, document_type: 'HARDCOPY', created_by: 3n, status: 'PendingApproval', workflow_version_id: 2n, workflow_steps: [
      { workflow_step_id: 10n, node_key: 'review', stage: 'CUSTOM', assignment_type: 'PERMISSION', assigned_user_id: 7n, status: 'PENDING', required_permission: 'custom.review' },
    ] });
    await expect(service.transition('1', '7', 'reject', '', actor)).rejects.toThrow('permission to approve this workflow stage');
  });

  it('does not substitute a legacy approver for an unresolved Builder role', async () => {
    prisma.document.findUnique.mockResolvedValue({ action_requested: 'CREATE' });
    prisma.documentApproverConfiguration.findUnique.mockResolvedValue({ workflow_plan: [
      { node_key: 'review', stage: 'NOTED_BY', assignment_type: 'ROLE', assigned_role_id: '99' },
    ], noted_by_user_id: 8n });
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.initializeWorkflowSteps(prisma, 1n, 3n, 'SOFTCOPY')).rejects.toThrow('does not have an eligible approver');
    expect(prisma.documentWorkflowStep.createMany).not.toHaveBeenCalled();
  });

  const draft = { status: 'Draft', document_type: 'SOFTCOPY', action_requested: 'CREATE', workflow_version_id: null, workflow_snapshot: null, business_document_type: 'Forms', requested_by_name: null };

  it('persists a selected published version when a draft is saved', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue({ workflow_version_id: 12n, version_number: 3, graph, workflow_definition: { name: 'Technical review' } });
    const data = await service.updateDraftWorkflow(prisma, 1n, draft, { workflow_version_id: '12' }, actor);
    expect(data).toMatchObject({ workflow_version_id: 12n, workflow_snapshot: graph });
    expect(prisma.documentApproverConfiguration.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ workflow_name: 'Technical review', workflow_version: 3 }) }));
  });

  it('retains an archived version already snapshotted on a draft', async () => {
    prisma.documentApproverConfiguration.findUnique.mockResolvedValue({ workflow_name: 'Original route', workflow_version: 2 });
    const data = await service.updateDraftWorkflow(prisma, 1n, { ...draft, workflow_version_id: 11n, workflow_snapshot: graph }, { workflow_version_id: '11' }, actor);
    expect(data.workflow_snapshot).toEqual(graph);
    expect(prisma.workflowVersion.findFirst).not.toHaveBeenCalled();
  });

  it('locks submitted workflow definitions and rejects unauthorized custom plans', async () => {
    await expect(service.updateDraftWorkflow(prisma, 1n, { ...draft, status: 'ForRevision' }, { workflow_version_id: '12' }, actor)).rejects.toThrow('locked after submission');
    await expect(service.updateDraftWorkflow(prisma, 1n, draft, { workflow_plan: '[{"stage":"NOTED_BY"}]' }, actor)).rejects.toThrow('permission to customize');
  });

  it('resolves the published cancellation default from Builder', async () => {
    prisma.workflowVersion.findFirst.mockResolvedValue(null);
    await service.loadDefaultWorkflowVersion('SOFTCOPY', 'CANCELLATION', prisma);
    expect(prisma.workflowVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'PUBLISHED', workflow_definition: { workflow_key: 'system-softcopy-cancellation', is_active: true } } }));
  });
});
