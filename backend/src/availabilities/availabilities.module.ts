import { Module } from '@nestjs/common';
import { AvailabilitiesController } from './availabilities.controller';
import { AvailabilitiesService } from './availabilities.service';

@Module({
  controllers: [AvailabilitiesController],
  providers: [AvailabilitiesService],
  exports: [AvailabilitiesService],
})
export class AvailabilitiesModule {}