import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { config } from './config/config';

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
      'x-cordigram-upload-context',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  await app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });
}

bootstrap();
