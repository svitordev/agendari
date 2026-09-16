import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateProfessionalProfileDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  bio?: string | null;

  @IsString()
  @IsOptional()
  avatarUrl?: string | null;

  @IsString()
  @IsOptional()
  instagram?: string | null;

  @IsString()
  @IsOptional()
  facebook?: string | null;

  @IsString()
  @IsOptional()
  whatsapp?: string | null;

  @IsObject()
  @IsOptional()
  themeColors?: Record<string, string> | null;
}