import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DecksModule } from './modules/decks/decks.module';
import { CardsModule } from './modules/cards/cards.module';
import { ChatModule } from './modules/chat/chat.module';
import { RedisModule } from './modules/redis/redis.module';
import { SeasonsModule } from './modules/seasons/seasons.module';
import { GroupsModule } from './modules/groups/groups.module';
import { EconomyModule } from './modules/economy/economy.module';
import { AdminModule } from './modules/admin/admin.module';
import { DuelsModule } from './modules/duels/duels.module';
import { ShopModule } from './modules/shop/shop.module';
import { FriendsModule } from './modules/friends/friends.module';
import { TournamentsModule } from './modules/tournaments/tournaments.module';
import { NewsModule } from './modules/news/news.module';
import { ArenaModule } from './modules/arena/arena.module';
import { CosmeticsModule } from './modules/cosmetics/cosmetics.module';
import { InitialDecksModule } from './modules/initial-decks/initial-decks.module';
import { AnimeDecksModule } from './modules/anime-decks/anime-decks.module';
import { LevelsModule } from './modules/levels/levels.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityInterceptor } from './common/interceptors/activity.interceptor';

@Module({
  imports: [
    // Configuração
    ConfigModule.forRoot({
      isGlobal: true,
      // Garante que backend/.env seja carregado (mesmo rodando da raiz do projeto)
      envFilePath: [path.join(__dirname, '..', '.env'), '.env', '../.env'],
      expandVariables: true,
    }),

    // Cron Jobs
    ScheduleModule.forRoot(),

    // PostgreSQL - Dados principais
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.get<string>('DATABASE_URL') || '';
        const isSupabase = typeof databaseUrl === 'string' && (
          databaseUrl.includes('supabase.co') || databaseUrl.includes('pooler.supabase')
        );
        // Supabase (Session mode 5432) limita conexões por pool_size (~15–20) e pode estourar com pools grandes.
        // Para evitar erro "MaxClientsInSessionMode...", mantemos o pool bem pequeno no Supabase.
        // Se você estiver usando Transaction mode (6543), também funciona (só perde um pouco de performance).
        const poolMax = isSupabase ? 5 : (process.env.NODE_ENV === 'production' ? 500 : 100);
        const poolMin = isSupabase ? 1 : (process.env.NODE_ENV === 'production' ? 50 : 20);
        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: false,
          logging: false,
          extra: {
            max: poolMax,
            min: poolMin,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            statement_timeout: 15000,
            maxUses: isSupabase ? 1000 : 7500,
            keepAlive: true,
            keepAliveInitialDelayMillis: 5000,
            allowExitOnIdle: false,
          },
        };
      },
      inject: [ConfigService],
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGODB_URI'),
        connectionFactory: (connection) => {
          connection.on('error', () => {
            console.log('⚠️  MongoDB connection failed - Chat features disabled');
          });
          return connection;
        },
      }),
      inject: [ConfigService],
    }),

    RedisModule,
    AuthModule,
    UsersModule,
    CardsModule,
    DecksModule,
    DuelsModule,
    ChatModule,
    SeasonsModule,
    GroupsModule,
    EconomyModule,
    AdminModule,
    ShopModule,
    FriendsModule,
    TournamentsModule,
    NewsModule,
    ArenaModule,
    CosmeticsModule,
    InitialDecksModule,
    AnimeDecksModule,
    LevelsModule,
    FeedbackModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityInterceptor,
    },
  ],
})
export class AppModule {}
