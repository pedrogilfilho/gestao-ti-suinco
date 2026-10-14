import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';

@Global()
@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '12h' } }) })],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, { provide: APP_GUARD, useExisting: JwtGuard }],
  exports: [JwtGuard, JwtModule],
})
export class AuthModule {}
