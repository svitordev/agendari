import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ThemeColorsDto } from './theme-colors.dto';

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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  themeColors?: ThemeColorsDto | null;
}
