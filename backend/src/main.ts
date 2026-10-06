import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { requireJwtSecret } from './auth/jwt-validation';

dotenv.config();
const frontendUrl = process.env.FRONTEND_URL;
// Validação obrigatória antes do bootstrap
requireJwtSecret();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      ...(frontendUrl ? [frontendUrl] : []),
    ],
    credentials: true,
  });
  // 💡 ATIVA A VALIDAÇÃO EM TODAS AS ROTAS DA API
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove propriedades do Body que não estão no DTO
      forbidNonWhitelisted: true, // Rejeita a requisição se houver propriedades não permitidas
      transform: true, // Transforma os tipos primitivos automaticamente (ex: string para number)
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
