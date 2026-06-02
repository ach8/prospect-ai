import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(helmet());
  
  // Parse cookies
  app.use(cookieParser());

  // Increase body limits for large CSV JSON payloads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS for the frontend
  app.enableCors({
    origin: true, // Allow all origins in dev, dynamically reflecting the origin
    credentials: true,
  });

  // Global prefix for all API routes
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 4000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 ProspectAI API running on port ${port}`);
}

bootstrap();
