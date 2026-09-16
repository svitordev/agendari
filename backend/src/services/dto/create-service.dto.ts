import { IsString, IsNotEmpty, IsInt, IsPositive, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome do serviço é obrigatório.' })
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsPositive()
  durationMinutes!: number; // Duração em minutos (ex: 60, 90, 120)

  @IsNumber()
  @IsPositive()
  price!: number; // Preço do serviço

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}