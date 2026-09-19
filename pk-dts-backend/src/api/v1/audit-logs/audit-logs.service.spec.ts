import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('AuditLogsService', () => {
  it('returns one lightweight page without counting by default', async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      audit_log_id: BigInt(index + 1),
      user_name: 'User',
      user_username: 'user',
      role_name: 'Staff',
      action: 'VIEW',
      module: 'documents',
      description: 'Viewed document',
      method: 'GET',
      path: '/documents/1',
      entity_id: '1',
      ip_address: null,
      reason: null,
      created_at: new Date('2026-09-19T00:00:00.000Z'),
    }));

    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn(),
      },
      documentStatusHistory: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new AuditLogsService(prisma);
    const result = await service.list();

    expect((prisma as any).auditLog.count).not.toHaveBeenCalled();
    expect((prisma as any).auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        select: expect.objectContaining({
          audit_log_id: true,
          description: true,
          created_at: true,
        }),
      }),
    );

    const query = (prisma as any).auditLog.findMany.mock.calls[0][0];
    expect(query.select.before_state).toBeUndefined();
    expect(query.select.after_state).toBeUndefined();
    expect(query.select.workflow_context).toBeUndefined();
    expect(query.select.metadata).toBeUndefined();

    expect(result.items).toHaveLength(20);
    expect(result.meta.has_next).toBe(true);
    expect((result.meta as any).total).toBeUndefined();
  });
});
