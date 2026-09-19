import { Controller, Get, Patch, Param, Sse } from '@nestjs/common';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';

@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly streamService: NotificationStreamService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.notifications.list(user); }
  @Sse('stream') stream() { return this.streamService.stream(); }
  @Patch('read-all') readAll(@CurrentUser() user: AuthenticatedUser) { return this.notifications.readAll(user); }
  @Patch(':eventKey/read') read(@Param('eventKey') eventKey: string, @CurrentUser() user: AuthenticatedUser) { return this.notifications.read(user, decodeURIComponent(eventKey)); }
}
