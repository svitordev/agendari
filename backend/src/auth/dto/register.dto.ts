import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Digite um e-mail válido.' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;
}