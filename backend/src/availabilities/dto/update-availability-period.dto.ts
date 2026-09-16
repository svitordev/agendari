import {
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateAvailabilityPeriodDto {
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime deve estar no formato HH:mm.',
  })
  startTime?: string;

  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime deve estar no formato HH:mm.',
  })
  endTime?: string;
}