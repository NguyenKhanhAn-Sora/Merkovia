import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
import { GoogleService } from './google.service';
import { MailService } from './mail.service';
import { OtpStore } from './otp.store';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { AddressesModule } from '../addresses/addresses.module';
import { ShopsModule } from '../shops/shops.module';
import { SmsModule } from '../sms/sms.module';
import { config } from '../config/config';

@Module({
  imports: [
    UsersModule,
    ProfilesModule,
    AddressesModule,
    ShopsModule,
    SmsModule,
    JwtModule.register({ secret: config.jwt.secret }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountService,
    GoogleService,
    MailService,
    OtpStore,
    JwtAuthGuard,
  ],
  // Module khác (products…) dùng JwtAuthGuard để bảo vệ route.
  exports: [AccountService, JwtAuthGuard],
})
export class AuthModule {}
