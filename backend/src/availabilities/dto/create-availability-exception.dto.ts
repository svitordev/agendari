import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateAvailabilityExceptionDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date deve estar no formato YYYY-MM-DD.',
  })
  date!: string;

  @IsBoolean()
  @IsOptional()
  allDay?: boolean;

  @ValidateIf((dto) => !dto.allDay)
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime deve estar no formato HH:mm.',
  })
  startTime?: string;

  @ValidateIf((dto) => !dto.allDay)
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime deve estar no formato HH:mm.',
  })
  endTime?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  reason?: string;
}