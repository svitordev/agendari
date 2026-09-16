import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  AppointmentStatus,
} from '@prisma/client';

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}