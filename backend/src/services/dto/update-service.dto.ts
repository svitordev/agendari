import { IsString, IsInt, IsPositive, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class UpdateServiceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  durationMinutes?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  price?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}