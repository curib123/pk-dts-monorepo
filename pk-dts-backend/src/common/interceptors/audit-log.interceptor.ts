import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { tap } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationStreamService } from '../../api/v1/notifications/notification-stream.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService, private readonly notificationStream: NotificationStreamService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const method = String(request.method || '').toUpperCase();
    const path = String(request.originalUrl || request.url || '').split('?')[0];
    const shouldLog = user && (method !== 'GET' || /^\/api\/v1\/documents\/\d+/.test(path));
    return next.handle().pipe(tap({ next: (response) => {
      if (shouldLog) void this.write(request, user, method, path, response);
      if (user && method !== 'GET') this.notificationStream.invalidate();
    } }));
  }
  private async write(request: any, user: any, method: string, path: string, response: any) {
    try {
      const parts = path.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
      const module = parts[0] || 'system';
      const entityId = parts.find((part: string) => /^\d+$/.test(part)) || null;
      const action = this.classifyAction(method, path);
      const detail = parts.filter((part: string) => !/^\d+$/.test(part)).slice(1).join(' ') || module;
      const metadata = this.safeMetadata(request);
      const reason = this.reason(request);
      await this.prisma.auditLog.create({ data: {
        user_id: BigInt(user.user_id), user_name: `${user.firstname} ${user.lastname}`.trim(), user_username: user.username,
        role_name: user.role.role_name, action, module,
        description: this.humanDescription(action, detail, entityId), method, path, entity_id: entityId,
        metadata, before_state: method === 'GET' ? undefined : metadata.body as Prisma.InputJsonValue,
        after_state: method === 'GET' ? undefined : this.safeState(response), reason,
        workflow_context: this.workflowContext(request), ip_address: this.clientIp(request),
        user_agent: String(request.headers?.['user-agent'] || '').slice(0, 500) || null,
      } });
    } catch { /* audit logging must not break the user action */ }
  }
  private classifyAction(method: string, path: string) {
    const normalized = path.toLowerCase();
    if (normalized.endsWith('/login')) return 'LOGIN';
    if (normalized.includes('/revisions/') && normalized.endsWith('/finalize')) return 'FINALIZE_FILE';
    if (normalized.includes('/revisions/') && normalized.endsWith('/correct')) return 'CORRECT_FILE';
    if (normalized.includes('/revisions')) return 'UPLOAD_FILE';
    if (normalized.includes('/approve')) return 'APPROVE';
    if (normalized.includes('/reject')) return 'REJECT';
    if (normalized.includes('/request-revision') || normalized.includes('/return')) return 'RETURN';
    if (normalized.includes('/download') || normalized.includes('/stamped') || normalized.includes('/uncontrolled')) return 'DOWNLOAD';
    return method === 'GET' ? 'VIEW' : method === 'POST' ? 'CREATE' : method === 'DELETE' ? 'DELETE' : 'UPDATE';
  }
  private humanDescription(action: string, detail: string, entityId: string | null) {
    const labels: Record<string, string> = { LOGIN: 'signed in', UPLOAD_FILE: 'uploaded a revision file', CORRECT_FILE: 'uploaded a controlled file correction', FINALIZE_FILE: 'finalized a controlled copy', APPROVE: 'approved a workflow item', REJECT: 'rejected a workflow item', RETURN: 'returned a workflow item for revision', DOWNLOAD: 'downloaded a document file', CREATE: 'created', UPDATE: 'updated', DELETE: 'deleted', VIEW: 'viewed' };
    return `${labels[action] || action.toLowerCase()} ${detail.replace(/-/g, ' ')}${entityId ? ` (#${entityId})` : ''}`.slice(0, 500);
  }
  private reason(request: any) {
    const body = request.body || {};
    return String(body.reason || body.remarks || body.correction_reason || body.direct_creation_reason || '').trim().slice(0, 2000) || null;
  }
  private workflowContext(request: any) {
    const body = request.body || {};
    const context = body.workflow_version_id || body.workflow_plan || body.superseded_by_revision_id || body.revision_id;
    return context ? this.safeState({ workflow_version_id: body.workflow_version_id, workflow_plan: body.workflow_plan, superseded_by_revision_id: body.superseded_by_revision_id, revision_id: body.revision_id }) : undefined;
  }
  private clientIp(request: any) {
    const forwarded = request.headers?.['x-real-ip'];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const address = String(value || request.ip || request.socket?.remoteAddress || '').trim().replace(/^::ffff:/, '');
    return address.slice(0, 100) || null;
  }
  private safeMetadata(request: any) {
    const blocked = new Set(['password','password_hash','token','authorization','file','files']);
    const clean = (value: any): any => { if (!value || typeof value !== 'object') return value; if (Array.isArray(value)) return value.slice(0, 30).map(clean); return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key.toLowerCase())).map(([key,val]) => [key, typeof val === 'string' ? val.slice(0, 300) : clean(val)])); };
    return { params: clean(request.params), query: clean(request.query), body: clean(request.body) };
  }
  private safeState(value: any): Prisma.InputJsonValue | undefined {
    if (!value || typeof value === 'function' || Buffer.isBuffer(value)) return undefined;
    try {
      const serialized = JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
      if (!serialized || serialized.length > 12000) return { summary: 'Response omitted from audit snapshot', size: serialized?.length || 0 };
      return JSON.parse(serialized) as Prisma.InputJsonValue;
    } catch { return undefined; }
  }
}
