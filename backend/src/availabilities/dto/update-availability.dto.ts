import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAvailabilityDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
