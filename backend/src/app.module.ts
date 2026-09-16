import { Module } from '@nestjs/common';
import { ProfessionalsModule } from './professionals/professionals.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServicesModule } from './services/services.module';
import { AvailabilitiesModule } from './availabilities/availabilities.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProfessionalsModule,
    AppointmentsModule,
    ServicesModule,
    AvailabilitiesModule,
  ],
})
export class AppModule {}