import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/*
 * AdminModule — fundação da área ADMIN (v1.1).
 * PassportModule/JwtModule já são globais via AuthModule (@Global).
 */
@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
