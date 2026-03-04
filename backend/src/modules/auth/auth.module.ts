import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { LocalMasterStrategy } from './strategies/local-master.strategy';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { InitialDecksModule } from '../initial-decks/initial-decks.module';
import { NewAccountSettingsModule } from '../new-account-settings/new-account-settings.module';
import { DivisionsModule } from '../divisions/divisions.module';
import { CosmeticsModule } from '../cosmetics/cosmetics.module';

@Module({
  imports: [
    UsersModule,
    MailModule,
    SeasonsModule,
    InitialDecksModule,
    NewAccountSettingsModule,
    DivisionsModule,
    CosmeticsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, LocalMasterStrategy, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
