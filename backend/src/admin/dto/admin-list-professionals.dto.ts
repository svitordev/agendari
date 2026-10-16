import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/*
 * ============================================================
 * DTO de listagem administrativa (read-only).
 * Mesma convenção de paginação do FindProfessionalsDto público
 * (limit 1–100 default 20, offset >= 0 default 0), via
 * class-validator + class-transformer (transform global no
 * ValidationPipe — sem conversão implícita manual).
 * ============================================================
 */
export class AdminListProfessionalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
