import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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

@Module({
  imports: [
    // Configuração
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Cron Jobs
    ScheduleModule.forRoot(),

    // PostgreSQL - Dados principais
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        logging: false,
        extra: {
          max: 100,
          min: 20,
          idleTimeoutMillis: 20000,
          connectionTimeoutMillis: 10000,
          statement_timeout: 5000,
          maxUses: 7500,
          keepAlive: true,
          keepAliveInitialDelayMillis: 5000,
          allowExitOnIdle: false,
        },
      }),
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
  ],
})
export class AppModule {}
