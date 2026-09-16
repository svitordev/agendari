import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class CreateAvailabilityDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}