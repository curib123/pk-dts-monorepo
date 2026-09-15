import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBigIntId } from '../../../common/utils/prisma-id.util';
import {
  getPagination,
  paginatedResponse,
} from '../../../common/utils/pagination.util';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';

@Injectable()
export class RolePermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const { page, limit, skip, take } = getPagination(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rolePermission.findMany({
        skip,
        take,
        include: { role: true, permission: true },
        orderBy: { role_permission_id: 'asc' },
      }),
      this.prisma.rolePermission.count(),
    ]);

    return paginatedResponse(items, total, page, limit);
  }

  async create(dto: CreateRolePermissionDto) {
    const roleId = toBigIntId(dto.role_id, 'role_id');
    const permissionId = toBigIntId(dto.permission_id, 'permission_id');
    const [role, permission] = await Promise.all([
      this.prisma.role.findUnique({ where: { role_id: roleId } }),
      this.prisma.permission.findUnique({ where: { permission_id: permissionId } }),
    ]);
    if (!role || !permission) {
      throw new NotFoundException('Role or permission was not found.');
    }

    return this.prisma.rolePermission.create({
      data: {
        role_id: roleId,
        permission_id: permissionId,
      },
    });
  }

  async remove(id: string) {
    const rolePermissionId = toBigIntId(id, 'role_permission_id');
    const existing = await this.prisma.rolePermission.findUnique({
      where: { role_permission_id: rolePermissionId },
    });
    if (!existing) {
      throw new NotFoundException('Role permission was not found.');
    }

    return this.prisma.rolePermission.delete({
      where: { role_permission_id: rolePermissionId },
    });
  }
}
