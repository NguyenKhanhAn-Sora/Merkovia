import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { ShopsModule } from '../shops/shops.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
    ]),
    ShopsModule, // Shop model: tra chủ shop khi gửi thông báo cho người bán
    AuthModule, // JwtAuthGuard + AccountService (xác thực socket)
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  // Các module nghiệp vụ (orders, reviews, payments) gọi service này để phát
  // thông báo tại đúng thời điểm.
  exports: [NotificationsService],
})
export class NotificationsModule {}
