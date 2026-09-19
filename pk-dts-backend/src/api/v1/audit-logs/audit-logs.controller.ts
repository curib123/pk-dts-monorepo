import { Controller, Get, Param, Query } from '@nestjs/common';
import { RequirePermissions } from '../../../common/auth/require-permissions.decorator';
import { AuditLogsService } from './audit-logs.service';

@Controller({ path: 'audit-logs', version: '1' })
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get('documents/:documentId/timeline')
  @RequirePermissions('activity-logs.view_logs')
  timeline(@Param('documentId') documentId: string) {
    return this.service.timeline(documentId);
  }

  @Get()
  @RequirePermissions('activity-logs.view_logs')
  list(
    @Query('search') search = '',
    @Query('module') module = '',
    @Query('action') action = '',
    @Query('user') user = '',
    @Query('document') document = '',
    @Query('from') from = '',
    @Query('to') to = '',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('include_total') includeTotal = 'false',
  ) {
    return this.service.list(
      search,
      module,
      action,
      user,
      document,
      from,
      to,
      page,
      limit,
      includeTotal === 'true',
    );
  }
}
