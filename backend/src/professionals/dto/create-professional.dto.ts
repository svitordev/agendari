// src/professionals/dto/create-professional.dto.ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

class SocialMediaDto {
  @IsOptional()
  @IsUrl({}, { message: 'O link do Instagram deve ser uma URL válida.' })
  instagram?: string;

  @IsOptional()
  @IsUrl({}, { message: 'O link do Facebook deve ser uma URL válida.' })
  facebook?: string;
}

export class CreateProfessionalDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da profissional é obrigatório.' })
  name: string;

  // 💡 O slug aceita apenas letras minúsculas, números e hifens (ex: mayara-silva)
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'O link personalizado deve conter apenas letras minúsculas, números e hifens. Sem espaços ou acentos.',
  })
  slug: string;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  @IsUrl({}, { message: 'A foto deve ser uma URL válida.' })
  avatarUrl?: string; // Link da foto hospedada (S3, Cloudinary, Firebase, etc.)

  @IsOptional()
  @ValidateNested() // Avisa ao Nest para validar o objeto interno
  @Type(() => SocialMediaDto) // Converte o objeto recebido para a classe do DTO
  socialMedia?: SocialMediaDto;
}
