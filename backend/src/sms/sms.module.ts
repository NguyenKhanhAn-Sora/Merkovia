import { Logger, Module, Provider } from '@nestjs/common';
import { config } from '../config/config';
import { MockSmsSender } from './mock-sms.sender';
import { SMS_SENDER, SmsSender } from './sms.sender';

/**
 * Chọn nhà cung cấp SMS theo biến môi trường SMS_PROVIDER.
 * Thêm provider mới = thêm 1 case ở đây + 1 class implements SmsSender.
 */
const smsSenderProvider: Provider = {
  provide: SMS_SENDER,
  useFactory: (): SmsSender => {
    switch (config.sms.provider) {
      // case 'twilio': return new TwilioSmsSender();
      // case 'zns':    return new ZnsSmsSender();
      case 'mock':
        return new MockSmsSender();
      default:
        new Logger('SmsModule').warn(
          `SMS_PROVIDER="${config.sms.provider}" chưa được hỗ trợ — dùng tạm MockSmsSender.`,
        );
        return new MockSmsSender();
    }
  },
};

@Module({
  providers: [smsSenderProvider],
  exports: [SMS_SENDER],
})
export class SmsModule {}
