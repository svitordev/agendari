import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty()
  professionalId!: string;

  @IsDateString()
  @IsNotEmpty()
  dateTime!: string;

  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @IsString()
  @IsNotEmpty()
  clientName!: string;

  @IsString()
  @IsNotEmpty()
  clientWhats!: string;
}
