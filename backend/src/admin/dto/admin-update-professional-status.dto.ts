import { IsEnum, IsNotEmpty } from 'class-validator';
import { ProfessionalStatus } from '@prisma/client';

/*
 * ============================================================
 * DTO de mudança de estado operacional (PATCH /admin/professionals/:id/status).
 *
 * Separado de propósito do DTO de edição de dados
 * (AdminUpdateProfessionalDto — 5 campos). Edição de dados e
 * mudança de estado são responsabilidades distintas e não se
 * misturam.
 *
 * Único campo: status (enum tipado — sem string solta).
 * forbidNonWhitelisted (ValidationPipe global) rejeita
 * qualquer campo adicional → 400.
 * ============================================================
 */
export class AdminUpdateProfessionalStatusDto {
  @IsEnum(ProfessionalStatus)
  @IsNotEmpty()
  status!: ProfessionalStatus;
}
