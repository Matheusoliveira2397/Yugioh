import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DecksModule } from './modules/decks/decks.module';
import { CardsModule } from './modules/cards/cards.module';
import { DuelModule } from './modules/duel/duel.module';
import { MatchmakingModule } from './modules/matchmaking/matchmaking.module';
import { TournamentModule } from './modules/tournament/tournament.module';
import { ChatModule } from './modules/chat/chat.module';
import { RedisModule } from './modules/redis/redis.module';

@Module({
  imports: [
    // Configuração
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // PostgreSQL - Dados principais
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV === 'development',
      }),
      inject: [ConfigService],
    }),

    // MongoDB - Chat e Logs
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // Módulos da aplicação
    RedisModule,
    AuthModule,
    UsersModule,
    DecksModule,
    CardsModule,
    DuelModule,
    MatchmakingModule,
    TournamentModule,
    ChatModule,
  ],
})
export class AppModule {}
