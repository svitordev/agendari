import {
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class CancelPublicAppointmentDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}