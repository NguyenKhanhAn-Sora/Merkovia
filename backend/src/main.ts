import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { config } from './config/config';
import { vietnameseValidationError } from './common/validation-messages';

async function bootstrap() {
  // `rawBody` giữ lại thân request nguyên byte — bắt buộc để xác thực chữ ký
  // webhook thanh toán. Parse rồi stringify lại có thể đổi thứ tự khoá và làm
  // chữ ký sai oan, khiến sự kiện thanh toán thật bị từ chối.
  const app = await NestFactory.create(AppModule, { rawBody: true });

    app.enableCors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-device-info',
      'x-device-id',
      'x-login-method',
      'x-admin-preview-token',
      // App tự khai là buyer hay seller để nhận đúng bộ cookie phiên.
      'x-merkovia-app',
      'x-cordigram-upload-context',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Dịch lỗi sang tiếng Việt: mặc định class-validator trả câu tiếng Anh
      // ("recipientName must be longer than…") và câu đó hiện thẳng lên màn
      // hình người dùng. Thông báo tự viết trong DTO vẫn được giữ nguyên.
      exceptionFactory: vietnameseValidationError,
    }),
  )

  await app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });
}

bootstrap();
