import { RolePermissionsService } from './role-permissions.service';

function createPrismaMock() {
  return {
    role: {
      findUnique: jest.fn(),
    },
    permission: {
      findUnique: jest.fn(),
    },
    rolePermission: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('RolePermissionsService', () => {
  it('allows Internal Audit to receive any permission selected in the permission matrix', async () => {
    const prisma = createPrismaMock();
    prisma.role.findUnique.mockResolvedValue({
      role_id: BigInt(2),
      role_name: 'Internal Audit',
    });
    prisma.permission.findUnique.mockResolvedValue({
      permission_id: BigInt(10),
      permission_name: 'documents.edit',
    });
    prisma.rolePermission.create.mockResolvedValue({
      role_permission_id: BigInt(100),
      role_id: BigInt(2),
      permission_id: BigInt(10),
    });

    const service = new RolePermissionsService(prisma as never);

    await expect(
      service.create({ role_id: '2', permission_id: '10' }),
    ).resolves.toMatchObject({
      role_id: BigInt(2),
      permission_id: BigInt(10),
    });
    expect(prisma.rolePermission.create).toHaveBeenCalledWith({
      data: {
        role_id: BigInt(2),
        permission_id: BigInt(10),
      },
    });
  });

  it('allows Internal Audit permissions to be removed like any other fixed role', async () => {
    const prisma = createPrismaMock();
    prisma.rolePermission.findUnique.mockResolvedValue({
      role_permission_id: BigInt(100),
      role_id: BigInt(2),
      permission_id: BigInt(10),
      role: {
        role_id: BigInt(2),
        role_name: 'Internal Audit',
      },
      permission: {
        permission_id: BigInt(10),
        permission_name: 'documents.view',
      },
    });
    prisma.rolePermission.delete.mockResolvedValue({
      role_permission_id: BigInt(100),
      role_id: BigInt(2),
      permission_id: BigInt(10),
    });

    const service = new RolePermissionsService(prisma as never);

    await expect(service.remove('100')).resolves.toMatchObject({
      role_id: BigInt(2),
      permission_id: BigInt(10),
    });
    expect(prisma.rolePermission.delete).toHaveBeenCalledWith({
      where: { role_permission_id: BigInt(100) },
    });
  });
});
