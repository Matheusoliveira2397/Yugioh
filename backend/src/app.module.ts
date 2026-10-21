import { Module } from '@nestjs/common';
import { LootBoxesModule } from './modules/loot-boxes/loot-boxes.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';

/**
 * Supabase Pooler: porta 5432 = Session mode (1 conexão Postgres por cliente do pool Node → estoura
 * "MaxClientsInSessionMode: max clients reached - pool_size"). Porta 6543 = Transaction mode (PgBouncer).
 * Por padrão convertemos pooler.supabase na 5432 para 6543. Opt-out: SUPABASE_TRANSACTION_POOLER=false
 */
function rewriteSupabasePoolerToTransactionMode(databaseUrl: string): string {
  let out = databaseUrl;
  if (out.includes(':5432/')) {
    out = out.replace(':5432/', ':6543/');
  } else if (out.includes(':5432?')) {
    out = out.replace(':5432?', ':6543?');
  } else {
    return databaseUrl;
  }
  const joiner = out.includes('?') ? '&' : '?';
  if (!/([?&])pgbouncer=true\b/.test(out)) {
    out += `${joiner}pgbouncer=true`;
  }
  return out;
}

function applySupabaseTransactionPooler(databaseUrl: string): string {
  if (!databaseUrl) return databaseUrl;
  if (!databaseUrl.includes('pooler.supabase')) return databaseUrl;

  const onSessionPort = databaseUrl.includes(':5432/') || databaseUrl.includes(':5432?');
  if (!onSessionPort) {
    return databaseUrl;
  }

  const explicitOff =
    process.env.SUPABASE_TRANSACTION_POOLER === '0' ||
    process.env.SUPABASE_TRANSACTION_POOLER === 'false' ||
    process.env.SUPABASE_TRANSACTION_POOLER === 'off';
  if (explicitOff) {
    return databaseUrl;
  }

  const out = rewriteSupabasePoolerToTransactionMode(databaseUrl);
  if (out !== databaseUrl) {
    console.warn(
      '✅ DATABASE_URL: pooler Supabase na porta 5432 (Session) → ajustada para 6543 (Transaction / PgBouncer). ' +
        'Evita "MaxClientsInSessionMode". Para forçar Session mode, defina SUPABASE_TRANSACTION_POOLER=false.',
    );
  }
  return out;
}
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
import { CreditPackagesModule } from './modules/credit-packages/credit-packages.module';
import { BotsModule } from './modules/bots/bots.module';
import { BattlePassModule } from './modules/battle-pass/battle-pass.module';
import { MissionsModule } from './modules/missions/missions.module';
import { PromoCodesModule } from './modules/promo-codes/promo-codes.module';
import { PatchNotesModule } from './modules/patch-notes/patch-notes.module';
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
        const rawUrl = configService.get<string>('DATABASE_URL') || '';
        const databaseUrl = applySupabaseTransactionPooler(rawUrl);
        const isSupabase = typeof databaseUrl === 'string' && (
          databaseUrl.includes('supabase.co') || databaseUrl.includes('pooler.supabase')
        );
        const isSupabaseTransactionPooler =
          isSupabase &&
          (databaseUrl.includes(':6543/') || databaseUrl.includes(':6543?'));
        if (
          isSupabase &&
          rawUrl.includes('pooler.supabase') &&
          (rawUrl.includes(':5432/') || rawUrl.includes(':5432?')) &&
          databaseUrl === rawUrl
        ) {
          console.warn(
            '⚠️ Supabase Session pooler (5432): limite rígido de clientes. ' +
              'Remova SUPABASE_TRANSACTION_POOLER=false ou defina DATABASE_POOL_MAX=3. ' +
              'Recomendado: use URL na porta 6543 ou deixe o padrão converter 5432→6543.',
          );
        }
        // Supabase: pool pequeno no app; com Transaction pooler (6543) o PgBouncer multiplexa.
        const poolMaxOverride = configService.get<string>('DATABASE_POOL_MAX');
        const parsedPoolMax =
          poolMaxOverride !== undefined && poolMaxOverride !== ''
            ? parseInt(poolMaxOverride, 10)
            : NaN;
        // Pool conservador: Postgres local ~100 max_connections; 500/50 estoura o banco sob carga.
        // Override via DATABASE_POOL_MAX quando houver PgBouncer dedicado.
        const defaultSupabasePool = isSupabaseTransactionPooler ? 8 : 4;
        const poolMax =
          Number.isFinite(parsedPoolMax) && parsedPoolMax >= 1
            ? parsedPoolMax
            : isSupabase
              ? defaultSupabasePool
              : process.env.NODE_ENV === 'production'
                ? 30
                : 15;
        const poolMin = isSupabase ? 0 : process.env.NODE_ENV === 'production' ? 2 : 1;
        return {
          type: 'postgres',
          url: databaseUrl,
          autoLoadEntities: true,
          synchronize: false,
          logging: false,
          extra: {
            max: poolMax,
            min: poolMin,
            idleTimeoutMillis: isSupabase ? 20000 : 30000,
            connectionTimeoutMillis: 10000,
            statement_timeout: 15000,
            maxUses: isSupabase ? 1000 : 7500,
            keepAlive: true,
            keepAliveInitialDelayMillis: 5000,
            // No Supabase, libera conexões ociosas do pool Node (menos pressão no limite do pooler).
            allowExitOnIdle: isSupabase,
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
    LootBoxesModule,
    BotsModule,
    CreditPackagesModule,
    BattlePassModule,
    MissionsModule,
    PromoCodesModule,
    PatchNotesModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ActivityInterceptor,
    },
  ],
})
export class AppModule {}
