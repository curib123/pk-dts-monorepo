import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';

const auditListSelect = {
  audit_log_id: true,
  user_name: true,
  user_username: true,
  role_name: true,
  action: true,
  module: true,
  description: true,
  method: true,
  path: true,
  entity_id: true,
  ip_address: true,
  reason: true,
  created_at: true,
} satisfies Prisma.AuditLogSelect;

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    search = '',
    module = '',
    action = '',
    user = '',
    document = '',
    from = '',
    to = '',
    pageValue = '1',
    limitValue = '20',
    includeTotal = false,
  ) {
    const page = Math.max(1, Number(pageValue) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitValue) || 20));
    const userId = this.userIdOrUndefined(user);
    const where: Prisma.AuditLogWhereInput = {
      ...(module ? { module } : {}),
      ...(action ? { action: action.toUpperCase() } : {}),
      ...(document ? { entity_id: document.trim() } : {}),
      ...(user
        ? {
            OR: [
              { user_name: { contains: user } },
              { user_username: { contains: user } },
              ...(userId ? [{ user_id: userId }] : []),
            ],
          }
        : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { user_name: { contains: search } },
                  { user_username: { contains: search } },
                  { description: { contains: search } },
                  { path: { contains: search } },
                  { entity_id: { contains: search } },
                  { reason: { contains: search } },
                ],
              },
            ],
          }
        : {}),
      ...(from || to
        ? {
            created_at: {
              ...(from ? { gte: this.date(from, false) } : {}),
              ...(to ? { lte: this.date(to, true) } : {}),
            },
          }
        : {}),
    };

    const query = this.prisma.auditLog.findMany({
      where,
      select: auditListSelect,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit + 1,
    });

    if (includeTotal) {
      const [rows, total] = await Promise.all([
        query,
        this.prisma.auditLog.count({ where }),
      ]);
      const hasNext = rows.length > limit;
      return {
        items: rows.slice(0, limit),
        meta: {
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          has_next: hasNext,
        },
      };
    }

    const rows = await query;
    const hasNext = rows.length > limit;
    return {
      items: rows.slice(0, limit),
      meta: {
        page,
        limit,
        has_next: hasNext,
      },
    };
  }

  async timeline(documentId: string) {
    if (!/^\d+$/.test(documentId)) {
      throw new BadRequestException('Document ID must be numeric.');
    }

    const [audit, history] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { entity_id: documentId },
        select: auditListSelect,
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.documentStatusHistory.findMany({
        where: { document_id: BigInt(documentId) },
        orderBy: { created_at: 'asc' },
        select: {
          action: true,
          new_status: true,
          created_at: true,
          remarks: true,
          actor: {
            select: {
              firstname: true,
              lastname: true,
              username: true,
            },
          },
        },
      }),
    ]);

    return { audit, workflow_history: history };
  }

  private userIdOrUndefined(value: string) {
    return /^\d+$/.test(value.trim()) ? BigInt(value.trim()) : undefined;
  }

  private date(value: string, end: boolean) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid audit date: ${value}`);
    }
    if (end && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  }
}
