import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

/*
 * ============================================================
 * DTO de criação pelo ADMIN (POST /admin/professionals).
 *
 * Mínimo: Professional (name, slug) + User PROFESSIONAL
 * (email, firstName, lastName, password). Campos de perfil
 * (bio, avatarUrl, themeColors, redes) ficam para edição
 * futura pelo próprio profissional.
 *
 * role NÃO entra no DTO — o service força PROFESSIONAL
 * (o ADMIN não cria outro ADMIN por esta rota).
 * role/professionalId/userId/id/createdAt/updatedAt no body
 * → 400 via forbidNonWhitelisted do ValidationPipe global.
 *
 * Validações idênticas às já usadas no projeto:
 * - email/password: mesmo padrão do RegisterDto (sem
 *   normalização — o auth atual não normaliza);
 * - slug: mesma regex do CreateProfessionalDto.
 * ============================================================
 */
export class AdminCreateProfessionalDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da profissional é obrigatório.' })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'O link personalizado deve conter apenas letras minúsculas, números e hifens. Sem espaços ou acentos.',
  })
  slug!: string;

  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;
}
