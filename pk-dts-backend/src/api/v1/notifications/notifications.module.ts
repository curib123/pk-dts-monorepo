import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';

@Module({ controllers: [NotificationsController], providers: [NotificationsService, NotificationStreamService], exports: [NotificationStreamService] })
export class NotificationsModule {}
