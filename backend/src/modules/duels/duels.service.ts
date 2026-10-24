import { Injectable, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duel, DuelStatus, DuelResult, TurnPhase, DuelOrigin } from './entities/duel.entity';
import { DuelLog, DuelActionType } from './entities/duel-log.entity';
import { DuelHistory, DuelHistoryResult, DuelHistoryOrigin } from './entities/duel-history.entity';
import { User } from '../users/entities/user.entity';
import { normalizeProfileImageForClient } from '../users/profile-image.util';
import { DecksService } from '../decks/decks.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { CardsService } from '../cards/cards.service';
import { SeasonsService } from '../seasons/seasons.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { RandomDuelLevelRangesService } from '../admin/random-duel-level-ranges.service';
import { AdminService } from '../admin/admin.service';
import { EconomyService } from '../economy/economy.service';
import { CurrencyType, TransactionType } from '../economy/entities/transaction.entity';
import { ShopService } from '../shop/shop.service';
import { AnimeDecksService } from '../anime-decks/anime-decks.service';
import { BattlePassService } from '../battle-pass/battle-pass.service';
import { MissionsService } from '../missions/missions.service';
import { logger } from '../../common/utils/logger.util';
import { decideForcedWinner } from './duel-schedule-tiebreak';
import { withDuelPlayerLocks } from './duel-creation-lock';
import { CardEffectsService } from './services/card-effects.service';
import { DuelUtilsService } from './services/duel-utils.service';
import { CardEffectHandlersService } from './services/card-effect-handlers.service';
import * as Pts from './services/card-effects/effects/spells/player-target-spell.helpers';
import * as Dmoc from './services/card-effects/effects/Monsters/dark-magician-of-chaos';
import * as MagiciansRod from './services/card-effects/effects/Monsters/magicians-rod';
import * as Berfomet from './services/card-effects/effects/Monsters/berfomet';
import * as KingsKnight from './services/card-effects/effects/Monsters/kings-knight';
import * as MagiciansSalvation from './services/card-effects/effects/spells/magicians-salvation';
import * as EternalSoul from './services/card-effects/effects/traps/eternal-soul';
import * as ArchfiendOfGilfer from './services/card-effects/effects/Monsters/archfiend-of-gilfer';
import * as BigShieldGardna from './services/card-effects/effects/Monsters/big-shield-gardna';
import * as SkilledDm from './services/card-effects/effects/Monsters/skilled-dark-magician';
import * as DmgAtk from './services/card-effects/effects/Monsters/dark-magician-girl';
import * as BusterBlader from './services/card-effects/effects/Monsters/buster-blader';
import * as DarkPaladin from './services/card-effects/effects/Monsters/dark-paladin';
import * as ElementalHeroHeat from './services/card-effects/effects/Monsters/elemental-hero-heat';

@Injectable()
export class DuelsService implements OnModuleInit {
  private activeDuels: Map<string, Duel> = new Map()
  private creatingDuels: Map<string, Promise<Duel | null>> = new Map();
  /** Reserva de jogadores durante a criação, impedindo dois pares concorrentes no mesmo processo. */
  private creatingDuelPlayers = new Set<number>();
  private cardImageLogCache: Set<string> | null = null;
  /** Debounce de JSONB pesado (campo/mão/GY) — memória é fonte da verdade durante o duelo. */
  private pendingDuelPersists = new Map<
    string,
    { updates: Partial<Duel>; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly DUEL_FIELD_PERSIST_DEBOUNCE_MS = 2500;

  constructor(
    @InjectRepository(Duel)
    private duelsRepository: Repository<Duel>,
    @InjectRepository(DuelLog)
    private duelLogsRepository: Repository<DuelLog>,
    @InjectRepository(DuelHistory)
    private duelHistoryRepository: Repository<DuelHistory>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private decksService: DecksService,
    @Inject(forwardRef(() => TournamentsService))
    private tournamentsService: TournamentsService,
    @Inject(forwardRef(() => CardsService))
    private cardsService: CardsService,
    @Inject(forwardRef(() => SeasonsService))
    private seasonsService: SeasonsService,
    @Inject(forwardRef(() => GroupsService))
    private groupsService: GroupsService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    @Inject(forwardRef(() => RandomDuelLevelRangesService))
    private randomDuelLevelRangesService: RandomDuelLevelRangesService,
    @Inject(forwardRef(() => EconomyService))
    private economyService: EconomyService,
    @Inject(forwardRef(() => CardEffectsService))
    private cardEffectsService: CardEffectsService,
    private duelUtils: DuelUtilsService,
    @Inject(forwardRef(() => CardEffectHandlersService))
    private cardEffectHandlersService: CardEffectHandlersService,
    private shopService: ShopService,
    @Inject(forwardRef(() => AdminService))
    private adminService: AdminService,
    private animeDecksService: AnimeDecksService,
    private battlePassService: BattlePassService,
    private missionsService: MissionsService,
  ) {}

  /**
   * Executado automaticamente quando o módulo é inicializado
   * Verifica e adiciona a coluna pending_choice se necessário
   */
  async onModuleInit() {
    try {
      logger.info('🔧 [DuelsService] Verificando coluna pending_choice...');
      const pendingChoiceExists = await this.duelsRepository.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'duels' AND column_name = 'pending_choice'
      `);

      if (pendingChoiceExists.length === 0) {
        logger.info('🔧 [DuelsService] Adicionando coluna pending_choice...');
        await this.duelsRepository.query(`
          ALTER TABLE duels
          ADD COLUMN pending_choice JSONB NULL
        `);
        await this.duelsRepository.query(`
          COMMENT ON COLUMN duels.pending_choice IS 'Stores pending choice state for card effects that require player input (Confiscation, GracefulCharity, ForcefulSentry). Format: {type, userId, turnWhenStarted, phaseWhenStarted, data}'
        `);
        logger.info('✅ [DuelsService] Coluna pending_choice adicionada com sucesso');
      } else {
        logger.info('✅ [DuelsService] Coluna pending_choice já existe');
      }

      // Verificar se a tabela duel_history existe e criar se necessário
      logger.info('🔧 [DuelsService] Verificando tabela duel_history...');
      const historyTableExists = await this.duelsRepository.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'duel_history'
      `);

      if (historyTableExists.length === 0) {
        logger.info('🔧 [DuelsService] Tabela duel_history não existe. Criando automaticamente...');

        // Criar enums se não existirem
        await this.duelsRepository.query(`
          DO $$
          BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelhistoryresult') THEN
                  CREATE TYPE "duelhistoryresult" AS ENUM ('WIN', 'LOSS', 'DRAW', 'CANCELLED');
              END IF;

              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'duelhistoryorigin') THEN
                  CREATE TYPE "duelhistoryorigin" AS ENUM ('RANDOM', 'ARENA', 'TOURNAMENT', 'CHAT', 'OTHER');
              END IF;
          END $$;
        `);

        // Criar tabela com nomes que correspondem à entidade TypeORM (camelCase)
        // O TypeORM usa camelCase nas entidades, então precisamos criar a tabela com os mesmos nomes
        // Tentar usar gen_random_uuid() primeiro (PostgreSQL 13+), se falhar, usar uuid_generate_v4()
        let uuidFunction = 'gen_random_uuid()';
        try {
          // Testar se gen_random_uuid() está disponível
          await this.duelsRepository.query(`SELECT gen_random_uuid();`);
        } catch (testError: any) {
          // Se não estiver disponível, tentar criar extensão uuid-ossp
          try {
            await this.duelsRepository.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
            uuidFunction = 'uuid_generate_v4()';
            logger.info('ℹ️ [DuelsService] Usando uuid_generate_v4() para UUIDs');
          } catch (extError: any) {
            logger.warn('⚠️ [DuelsService] Nenhuma função UUID disponível, usando gen_random_uuid() como padrão');
          }
        }

        await this.duelsRepository.query(`
          CREATE TABLE IF NOT EXISTS "duel_history" (
              "id" UUID PRIMARY KEY DEFAULT ${uuidFunction},
              "playerId" INTEGER NOT NULL,
              "opponentId" INTEGER NOT NULL,
              "opponentNickname" VARCHAR(255),
              "opponentUsername" VARCHAR(255),
              "opponentClanTag" VARCHAR(50),
              "result" "duelhistoryresult" NOT NULL,
              "origin" "duelhistoryorigin" NOT NULL,
              "playerLifePoints" INTEGER DEFAULT 0,
              "opponentLifePoints" INTEGER DEFAULT 0,
              "scoreEarned" NUMERIC(10, 1) DEFAULT 0,
              "turns" INTEGER DEFAULT 0,
              "duration" INTEGER DEFAULT 0,
              "originalDuelId" VARCHAR(255),
              "finishedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

              CONSTRAINT "FK_duel_history_player" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE,
              CONSTRAINT "FK_duel_history_opponent" FOREIGN KEY ("opponentId") REFERENCES "users"("id") ON DELETE CASCADE
          );
        `);

        // Criar índices (usando os mesmos nomes que a entidade TypeORM espera)
        await this.duelsRepository.query(`
          CREATE INDEX IF NOT EXISTS "IDX_duel_history_playerId" ON "duel_history"("playerId");
          CREATE INDEX IF NOT EXISTS "IDX_duel_history_opponentId" ON "duel_history"("opponentId");
          CREATE INDEX IF NOT EXISTS "IDX_duel_history_finishedAt" ON "duel_history"("finishedAt");
          CREATE INDEX IF NOT EXISTS "IDX_duel_history_playerId_finishedAt" ON "duel_history"("playerId", "finishedAt");
          CREATE INDEX IF NOT EXISTS "IDX_duel_history_opponentId_finishedAt" ON "duel_history"("opponentId", "finishedAt");
        `);

        logger.info('✅ [DuelsService] Tabela duel_history criada com sucesso');
      } else {
        logger.info('✅ [DuelsService] Tabela duel_history existe');
      }

      // Verificar se a coluna total_score existe na tabela users
      logger.info('🔧 [DuelsService] Verificando coluna total_score...');
      const totalScoreExists = await this.duelsRepository.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'total_score'
      `);

      if (totalScoreExists.length === 0) {
        logger.info('🔧 [DuelsService] Coluna total_score não existe, criando...');
        try {
          await this.duelsRepository.query(`
            ALTER TABLE users
            ADD COLUMN total_score NUMERIC(10, 1) DEFAULT 0
          `);
          await this.duelsRepository.query(`
            COMMENT ON COLUMN users.total_score IS 'Score geral acumulado de todas as seasons (1.7 por vitória no random, 2.0 na arena, etc)'
          `);
          logger.info('✅ [DuelsService] Coluna total_score criada com sucesso');
        } catch (error: any) {
          logger.error('⚠️ [DuelsService] Erro ao criar coluna total_score:', error.message);
        }
      } else {
        // Verificar se o tipo está correto
        const columnType = await this.duelsRepository.query(`
          SELECT data_type, numeric_precision, numeric_scale
          FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'total_score'
        `);

        if (columnType.length > 0 && columnType[0].data_type !== 'numeric') {
          logger.info('🔧 [DuelsService] Coluna total_score existe mas não é NUMERIC, alterando tipo...');
          try {
            await this.duelsRepository.query(`
              ALTER TABLE users
              ALTER COLUMN total_score TYPE NUMERIC(10, 1) USING COALESCE(total_score::numeric, 0)
            `);
            logger.info('✅ [DuelsService] Tipo da coluna total_score alterado para NUMERIC(10, 1)');
          } catch (error: any) {
            logger.error('⚠️ [DuelsService] Erro ao alterar tipo da coluna total_score:', error.message);
          }
        } else {
          logger.debug('✅ [DuelsService] Coluna total_score já existe e está correta');
        }
      }

      // Aplicar índices de performance automaticamente
      await this.applyPerformanceIndexes();
    } catch (error: any) {
      logger.error('⚠️ [DuelsService] Erro ao verificar/adicionar colunas:', error.message);
      // Não lançar erro para não impedir a inicialização do módulo
    }
  }

  /**
   * Aplica índices de performance automaticamente no banco de dados
   */
  private async applyPerformanceIndexes(): Promise<void> {
    try {
      logger.info('🔧 [DuelsService] Aplicando índices de performance...');

      // Índices para tabela duels
      const duelIndexes = [
        { name: 'IDX_duels_player1_id', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_player1_id" ON "duels"("player1_id")' },
        { name: 'IDX_duels_player2_id', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_player2_id" ON "duels"("player2_id")' },
        { name: 'IDX_duels_status', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_status" ON "duels"("status")' },
        { name: 'IDX_duels_created_at', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_created_at" ON "duels"("created_at" DESC)' },
        { name: 'IDX_duels_winner_id', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_winner_id" ON "duels"("winner_id") WHERE "winner_id" IS NOT NULL' },
        { name: 'IDX_duels_status_created', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_status_created" ON "duels"("status", "created_at" DESC)' },
        { name: 'IDX_duels_player1_status', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_player1_status" ON "duels"("player1_id", "status")' },
        { name: 'IDX_duels_player2_status', sql: 'CREATE INDEX IF NOT EXISTS "IDX_duels_player2_status" ON "duels"("player2_id", "status")' },
      ];

      for (const index of duelIndexes) {
        try {
          await this.duelsRepository.query(index.sql);
        } catch (err: any) {
          // Ignorar erro se índice já existe
          if (!err.message?.includes('already exists')) {
            logger.warn(`⚠️ [DuelsService] Erro ao criar índice ${index.name}:`, err.message);
          }
        }
      }

      // Índices para outras tabelas (usando query direta)
      const otherIndexes = [
        // deck_cards
        'CREATE INDEX IF NOT EXISTS "IDX_deck_cards_deck_id" ON "deck_cards"("deckId")',
        'CREATE INDEX IF NOT EXISTS "IDX_deck_cards_card_id" ON "deck_cards"("cardId")',
        'CREATE INDEX IF NOT EXISTS "IDX_deck_cards_deck_extra" ON "deck_cards"("deckId", "isExtraDeck")',
        // decks
        'CREATE INDEX IF NOT EXISTS "IDX_decks_user_id" ON "decks"("userId")',
        'CREATE INDEX IF NOT EXISTS "IDX_decks_user_name" ON "decks"("userId", "name")',
        // user_cards
        'CREATE INDEX IF NOT EXISTS "IDX_user_cards_user_id" ON "user_cards"("userId")',
        'CREATE INDEX IF NOT EXISTS "IDX_user_cards_card_id" ON "user_cards"("cardId")',
        'CREATE INDEX IF NOT EXISTS "IDX_user_cards_user_card" ON "user_cards"("userId", "cardId")',
        // users
        'CREATE INDEX IF NOT EXISTS "IDX_users_role" ON "users"("role")',
        'CREATE INDEX IF NOT EXISTS "IDX_users_is_online" ON "users"("isOnline") WHERE "isOnline" = true',
        'CREATE INDEX IF NOT EXISTS "IDX_users_level" ON "users"("level" DESC)',
        // duel_logs
        'CREATE INDEX IF NOT EXISTS "IDX_duel_logs_duel_id" ON "duel_logs"("duelId")',
        'CREATE INDEX IF NOT EXISTS "IDX_duel_logs_user_id" ON "duel_logs"("userId")',
        'CREATE INDEX IF NOT EXISTS "IDX_duel_logs_created_at" ON "duel_logs"("createdAt" DESC)',
      ];

      for (const indexSql of otherIndexes) {
        try {
          await this.duelsRepository.query(indexSql);
        } catch (err: any) {
          // Ignorar erro se índice já existe
          if (!err.message?.includes('already exists')) {
            logger.debug(`⚠️ [DuelsService] Erro ao criar índice:`, err.message);
          }
        }
      }

      // Analisar tabelas para otimizar query planner
      const tablesToAnalyze = ['duels', 'decks', 'deck_cards', 'user_cards', 'users'];
      for (const table of tablesToAnalyze) {
        try {
          await this.duelsRepository.query(`ANALYZE "${table}"`);
        } catch (err: any) {
          logger.debug(`⚠️ [DuelsService] Erro ao analisar tabela ${table}:`, err.message);
        }
      }

      logger.info('✅ [DuelsService] Índices de performance aplicados com sucesso');
    } catch (error: any) {
      logger.warn('⚠️ [DuelsService] Erro ao aplicar índices de performance:', error.message);
      // Não lançar erro para não impedir a inicialização
    }
  }

  async getActiveDuelForUserById(duelId: string | number, userId: number): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return null;

    if (duel.player1Id === userId || duel.player2Id === userId) {
        return duel;
    }

    return null;
  }

  /**
   * Verifica se um usuário tem deck equipado
   */
  async hasEquippedDeck(userId: number): Promise<boolean> {
    try {
      const user = await this.usersRepository.findOne({
        where: { id: userId },
        select: ['id', 'equippedDeckId', 'equippedDeckName'],
      });

      if (!user) {
        return false;
      }

      const equippedDeckId = (user as any).equippedDeckId;
      const equippedDeckName = (user as any).equippedDeckName;
      return !!((equippedDeckId && String(equippedDeckId).trim() !== '') || (equippedDeckName && equippedDeckName.trim() !== ''));
    } catch (error) {
      logger.error(`❌ [hasEquippedDeck] Erro ao verificar deck equipado para usuário ${userId}:`, error);
      return false;
    }
  }

  findDuelByIdLight(duelId: string | number): Duel | null {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr) || null;
    if (duel) {
      logger.debug(`🔍 [findDuelByIdLight] Duelo em memória - player1Field: ${!!(duel as any).player1Field}, player2Field: ${!!(duel as any).player2Field}`);

      // CRÍTICO: Se algum campo estiver faltando, buscar do banco imediatamente
      if (!(duel as any).player1Field || !(duel as any).player2Field) {
        logger.debug(`❌ [findDuelByIdLight] Campos faltando em memória, forçando busca no banco`);
        // Retornar null para forçar busca do banco
        return null;
      }

      // Verificar se os campos são strings (JSON não parseado) e fazer parse se necessário
      if ((duel as any).player1Field && typeof (duel as any).player1Field === 'string') {
        logger.debug(`🔄 [findDuelByIdLight] player1Field é string, fazendo parse`);
        try {
          (duel as any).player1Field = JSON.parse((duel as any).player1Field);
        } catch (e) {
          logger.error(`❌ [findDuelByIdLight] Erro ao fazer parse do player1Field:`, e);
        }
      }
      if ((duel as any).player2Field && typeof (duel as any).player2Field === 'string') {
        logger.debug(`🔄 [findDuelByIdLight] player2Field é string, fazendo parse`);
        try {
          (duel as any).player2Field = JSON.parse((duel as any).player2Field);
        } catch (e) {
          logger.error(`❌ [findDuelByIdLight] Erro ao fazer parse do player2Field:`, e);
        }
      }

      // Deck vazio (0 cartas) é válido no meio do duelo; só invalidar se deck não existir ou não for array
      const p1 = (duel as any).player1Field;
      const p2 = (duel as any).player2Field;
      if (!Array.isArray(p1?.deck) || !Array.isArray(p2?.deck)) {
        logger.debug(`❌ [findDuelByIdLight] deck ausente ou não-array em memória, forçando busca no banco`);
        return null;
      }
    }
    return duel;
  }

  async findDuelByIdFromDatabase(duelId: string | number, forceFromDatabase: boolean = false): Promise<Duel | null> {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      const startTime = Date.now();

    logger.debug(`🔍 [findDuelByIdFromDatabase] Buscando duelo: ${duelIdStr}, forceFromDatabase: ${forceFromDatabase}`);

    // Verificar em memória primeiro (a menos que forceFromDatabase seja true)
    if (!forceFromDatabase) {
      const inMemory = this.findDuelByIdLight(duelIdStr);
      if (inMemory) {
        logger.debug(`✅ [findDuelByIdFromDatabase] Duelo encontrado em memória!`);
        return inMemory;
      }
    }

      // Se não encontrou em memória, buscar no banco
      try {
        // Otimizar: usar SQL direto com select específico (mais rápido que QueryBuilder)
        // Buscar apenas campos necessários primeiro
        let duel = await this.duelsRepository
          .createQueryBuilder('duel')
          .select([
            'duel.id',
            'duel.player1Id',
            'duel.player2Id',
            'duel.player1Nickname',
            'duel.player2Nickname',
            'duel.status',
            'duel.player1LifePoints',
            'duel.player2LifePoints',
            'duel.currentTurn',
            'duel.currentPhase',
            'duel.duelTime',
            'duel.turnTime',
            'duel.turnStartedAt',
            'duel.origin',
            'duel.result',
            'duel.winnerId',
            'duel.createdAt',
            'duel.updatedAt',
            'duel.finishedAt',
            'duel.player1Field',
            'duel.player2Field',
            'duel.turnCounter',
            'duel.pendingChoice',
            'duel.actionLogs',
          ])
          .leftJoinAndSelect('duel.player1', 'player1', undefined, [
            'player1.id',
            'player1.nickname',
            'player1.equippedPlaymatId',
            'player1.equippedPlaymatImage',
            'player1.equippedSkinId',
            'player1.equippedSkinImage',
            'player1.equippedDeckId',
            'player1.equippedDeckName',
          ])
          .leftJoinAndSelect('duel.player2', 'player2', undefined, [
            'player2.id',
            'player2.nickname',
            'player2.equippedPlaymatId',
            'player2.equippedPlaymatImage',
            'player2.equippedSkinId',
            'player2.equippedSkinImage',
            'player2.equippedDeckId',
            'player2.equippedDeckName',
          ])
          .where('duel.id = :id', { id: duelIdStr })
          .getOne();

        // Se não encontrou ou se os campos JSONB não foram carregados corretamente, buscar usando SQL raw
        if (!duel || !duel.player1Field || !duel.player2Field) {
          logger.debug(`🔍 [findDuelByIdFromDatabase] Campos JSONB não carregados, buscando via SQL raw...`);
          const rawResult = await this.duelsRepository.query(
            `SELECT
              d.*,
              jsonb_build_object(
                'id', p1.id,
                'nickname', p1.nickname,
                'equippedPlaymatId', p1."equippedPlaymatId",
                'equippedPlaymatImage', p1."equippedPlaymatImage",
                'equippedSkinId', p1."equippedSkinId",
                'equippedSkinImage', p1."equippedSkinImage",
                'equippedDeckId', p1."equipped_deck_id",
                'equippedDeckName', p1."equippedDeckName"
              ) as player1,
              jsonb_build_object(
                'id', p2.id,
                'nickname', p2.nickname,
                'equippedPlaymatId', p2."equippedPlaymatId",
                'equippedPlaymatImage', p2."equippedPlaymatImage",
                'equippedSkinId', p2."equippedSkinId",
                'equippedSkinImage', p2."equippedSkinImage",
                'equippedDeckId', p2."equipped_deck_id",
                'equippedDeckName', p2."equippedDeckName"
              ) as player2
            FROM duels d
            LEFT JOIN users p1 ON d.player1_id = p1.id
            LEFT JOIN users p2 ON d.player2_id = p2.id
            WHERE d.id = $1`,
            [duelIdStr]
          );

          if (rawResult && rawResult[0]) {
            const raw = rawResult[0];
            // Criar objeto Duel a partir do resultado raw
            duel = {
              id: raw.id,
              player1Id: raw.player1_id,
              player2Id: raw.player2_id,
              player1Nickname: raw.player1_nickname,
              player2Nickname: raw.player2_nickname,
              status: raw.status,
              player1LifePoints: raw.player1_life_points,
              player2LifePoints: raw.player2_life_points,
              currentTurn: raw.current_turn,
              currentPhase: raw.current_phase,
              duelTime: raw.duel_time || 0,
              turnTime: raw.turn_time || 90,
              turnStartedAt: raw.turn_started_at,
              origin: raw.origin,
              result: raw.result,
              winnerId: raw.winner_id,
              createdAt: raw.created_at,
              updatedAt: raw.updated_at,
              finishedAt: raw.finished_at,
              player1Field: raw.player1_field,
              player2Field: raw.player2_field,
              turnCounter: raw.turn_counter,
              pendingChoice: raw.pending_choice,
              actionLogs: raw.action_logs,
              player1: raw.player1,
              player2: raw.player2,
            } as any;
            logger.debug(`✅ [findDuelByIdFromDatabase] Duelo carregado via SQL raw`);
          }
        }

      if (duel) {
        logger.debug(`✅ [findDuelByIdFromDatabase] Duelo encontrado no banco! ID: ${duel.id}`);

        // Garantir que turnCounter existe (pode não existir em duelos antigos)
        if (!duel.turnCounter || duel.turnCounter === null || duel.turnCounter === undefined) {
          logger.debug(`⚠️ [findDuelByIdFromDatabase] turnCounter não existe, inicializando com 1`);
          duel.turnCounter = 1;
        }

        // Garantir que turnCounter existe no JSON dos campos (migração para novo formato)
        // Usar o maior valor entre os dois campos ou o do banco
        const p1Counter = (duel as any).player1Field?.turnCounter || 0;
        const p2Counter = (duel as any).player2Field?.turnCounter || 0;
        const dbCounter = duel.turnCounter || 0;
        const maxCounter = Math.max(p1Counter, p2Counter, dbCounter, 1);

        if ((duel as any).player1Field && typeof (duel as any).player1Field === 'object') {
          if (!(duel as any).player1Field.turnCounter || (duel as any).player1Field.turnCounter < maxCounter) {
            (duel as any).player1Field.turnCounter = maxCounter;
          }
        }
        if ((duel as any).player2Field && typeof (duel as any).player2Field === 'object') {
          if (!(duel as any).player2Field.turnCounter || (duel as any).player2Field.turnCounter < maxCounter) {
            (duel as any).player2Field.turnCounter = maxCounter;
          }
        }

        // Sincronizar também no banco
        if (duel.turnCounter !== maxCounter) {
          duel.turnCounter = maxCounter;
        }

        // CRÍTICO: Verificar e parsear os campos JSONB - o TypeORM pode não deserializar corretamente
        // Verificar se os campos são strings (JSON não parseado) e fazer parse se necessário
        if (!duel.player1Field || typeof duel.player1Field === 'string') {
          if (typeof duel.player1Field === 'string') {
            logger.debug(`🔄 [findDuelByIdFromDatabase] player1Field é string, fazendo parse...`);
            try {
              (duel as any).player1Field = JSON.parse(duel.player1Field);
            } catch (e) {
              logger.error(`❌ [findDuelByIdFromDatabase] Erro ao fazer parse do player1Field:`, e);
            }
          } else if (!duel.player1Field) {
            // Se está null/undefined, buscar do banco
            logger.debug(`🔄 [findDuelByIdFromDatabase] player1Field está null/undefined, buscando do banco...`);
            try {
              const rawResult = await this.duelsRepository.query(
                `SELECT player1_field FROM duels WHERE id = $1`,
                [duelIdStr]
              );
              if (rawResult && rawResult[0] && rawResult[0].player1_field) {
                const rawField = rawResult[0].player1_field;
                (duel as any).player1Field = typeof rawField === 'string' ? JSON.parse(rawField) : rawField;
                logger.debug(`✅ [findDuelByIdFromDatabase] player1Field recuperado: ${(duel as any).player1Field?.deck?.length || 0} cartas`);
              }
            } catch (e) {
              logger.error(`❌ [findDuelByIdFromDatabase] Erro ao buscar player1Field:`, e);
            }
          }
        }

        if (!duel.player2Field || typeof duel.player2Field === 'string') {
          if (typeof duel.player2Field === 'string') {
            logger.debug(`🔄 [findDuelByIdFromDatabase] player2Field é string, fazendo parse...`);
            try {
              (duel as any).player2Field = JSON.parse(duel.player2Field);
            } catch (e) {
              logger.error(`❌ [findDuelByIdFromDatabase] Erro ao fazer parse do player2Field:`, e);
            }
          } else if (!duel.player2Field) {
            // Se está null/undefined, buscar do banco
            logger.debug(`🔄 [findDuelByIdFromDatabase] player2Field está null/undefined, buscando do banco...`);
            try {
              const rawResult = await this.duelsRepository.query(
                `SELECT player2_field FROM duels WHERE id = $1`,
                [duelIdStr]
              );
              if (rawResult && rawResult[0] && rawResult[0].player2_field) {
                const rawField = rawResult[0].player2_field;
                (duel as any).player2Field = typeof rawField === 'string' ? JSON.parse(rawField) : rawField;
                logger.debug(`✅ [findDuelByIdFromDatabase] player2Field recuperado: ${(duel as any).player2Field?.deck?.length || 0} cartas`);
              }
            } catch (e) {
              logger.error(`❌ [findDuelByIdFromDatabase] Erro ao buscar player2Field:`, e);
            }
          }
        }

        // Sempre garantir player1/player2 com cosméticos (skin/playmat) para o frontend exibir do oponente
        if (duel.player1Id && duel.player2Id) {
          try {
            const [u1, u2] = await Promise.all([
              this.usersRepository.findOne({
                where: { id: Number(duel.player1Id) },
                select: ['id', 'nickname', 'clanTag', 'profileImage', 'equippedPlaymatId', 'equippedPlaymatImage', 'equippedSkinId', 'equippedSkinImage', 'equippedDeckId', 'equippedDeckName'],
              }),
              this.usersRepository.findOne({
                where: { id: Number(duel.player2Id) },
                select: ['id', 'nickname', 'clanTag', 'profileImage', 'equippedPlaymatId', 'equippedPlaymatImage', 'equippedSkinId', 'equippedSkinImage', 'equippedDeckId', 'equippedDeckName'],
              }),
            ]);
            if (u1) {
              (duel as any).player1 = {
                id: u1.id,
                nickname: (u1 as any).nickname,
                clanTag: (u1 as any).clanTag,
                profileImage: normalizeProfileImageForClient((u1 as any).profileImage),
                equippedPlaymatId: (u1 as any).equippedPlaymatId,
                equippedPlaymatImage: (u1 as any).equippedPlaymatImage,
                equippedSkinId: (u1 as any).equippedSkinId,
                equippedSkinImage: (u1 as any).equippedSkinImage,
                equippedDeckName: (u1 as any).equippedDeckName,
              };
            }
            if (u2) {
              (duel as any).player2 = {
                id: u2.id,
                nickname: (u2 as any).nickname,
                clanTag: (u2 as any).clanTag,
                profileImage: normalizeProfileImageForClient((u2 as any).profileImage),
                equippedPlaymatId: (u2 as any).equippedPlaymatId,
                equippedPlaymatImage: (u2 as any).equippedPlaymatImage,
                equippedSkinId: (u2 as any).equippedSkinId,
                equippedSkinImage: (u2 as any).equippedSkinImage,
                equippedDeckName: (u2 as any).equippedDeckName,
              };
            }
          } catch (e) {
            logger.warn(`⚠️ [findDuelByIdFromDatabase] Erro ao carregar cosméticos dos jogadores:`, e);
          }
        }

        // Log detalhado dos campos (apenas em debug)
        logger.debug(`📦 [findDuelByIdFromDatabase] player1Field do banco:`, {
          exists: !!duel.player1Field,
          type: typeof duel.player1Field,
          isObject: typeof duel.player1Field === 'object',
          keys: duel.player1Field && typeof duel.player1Field === 'object' ? Object.keys(duel.player1Field) : null,
          deckLength: duel.player1Field?.deck?.length || 0,
          handLength: duel.player1Field?.hand?.length || 0,
          monstersLength: duel.player1Field?.monsters?.length || 0,
        });
        logger.debug(`📦 [findDuelByIdFromDatabase] player2Field do banco:`, {
          exists: !!duel.player2Field,
          type: typeof duel.player2Field,
          isObject: typeof duel.player2Field === 'object',
          keys: duel.player2Field && typeof duel.player2Field === 'object' ? Object.keys(duel.player2Field) : null,
          deckLength: duel.player2Field?.deck?.length || 0,
          handLength: duel.player2Field?.hand?.length || 0,
          monstersLength: duel.player2Field?.monsters?.length || 0,
        });

        // Se player1Field ou deck não for array, tentar recuperar via SQL (deck com 0 cartas é válido)
        if (!duel.player1Field || !Array.isArray(duel.player1Field.deck)) {
          logger.warn(`⚠️ [findDuelByIdFromDatabase] player1Field/deck inválido! Tentando buscar diretamente do banco...`);
          try {
            const rawResult = await this.duelsRepository.query(
              `SELECT player1_field FROM duels WHERE id = $1`,
              [duelIdStr]
            );
            if (rawResult && rawResult[0] && rawResult[0].player1_field) {
              const rawField = rawResult[0].player1_field;
              if (typeof rawField === 'string') {
                (duel as any).player1Field = JSON.parse(rawField);
              } else {
                (duel as any).player1Field = rawField;
              }
              logger.debug(`✅ [findDuelByIdFromDatabase] player1Field recuperado via SQL: ${(duel as any).player1Field?.deck?.length || 0} cartas`);
            }
          } catch (e) {
            logger.error(`❌ [findDuelByIdFromDatabase] Erro ao buscar player1Field via SQL:`, e);
          }
        }

        if (!duel.player2Field || !Array.isArray(duel.player2Field.deck)) {
          logger.warn(`⚠️ [findDuelByIdFromDatabase] player2Field/deck inválido! Tentando buscar diretamente do banco...`);
          try {
            const rawResult = await this.duelsRepository.query(
              `SELECT player2_field FROM duels WHERE id = $1`,
              [duelIdStr]
            );
            if (rawResult && rawResult[0] && rawResult[0].player2_field) {
              const rawField = rawResult[0].player2_field;
              if (typeof rawField === 'string') {
                (duel as any).player2Field = JSON.parse(rawField);
              } else {
                (duel as any).player2Field = rawField;
              }
              logger.debug(`✅ [findDuelByIdFromDatabase] player2Field recuperado via SQL: ${(duel as any).player2Field?.deck?.length || 0} cartas`);
            }
          } catch (e) {
            logger.error(`❌ [findDuelByIdFromDatabase] Erro ao buscar player2Field via SQL:`, e);
          }
        }

        // Adicionar ao cache se ambos têm deck como array (pode ser [] após compras)
        if (!duel.player1Field || !Array.isArray(duel.player1Field.deck)) {
          logger.error(`❌ [findDuelByIdFromDatabase] player1Field/deck inválido antes de adicionar ao cache! Duelo ID: ${duelIdStr}`);
          return null;
        }
        if (!duel.player2Field || !Array.isArray(duel.player2Field.deck)) {
          logger.error(`❌ [findDuelByIdFromDatabase] player2Field/deck inválido antes de adicionar ao cache! Duelo ID: ${duelIdStr}`);
          return null;
        }

        // Garantir que os campos sejam objetos válidos (não strings)
        if (typeof duel.player1Field === 'string') {
          (duel as any).player1Field = JSON.parse(duel.player1Field);
        }
        if (typeof duel.player2Field === 'string') {
          (duel as any).player2Field = JSON.parse(duel.player2Field);
        }

        // CRÍTICO: Garantir que pendingChoice seja parseado se vier como string do banco
        if (duel.pendingChoice && typeof (duel as any).pendingChoice === 'string') {
          try {
            (duel as any).pendingChoice = JSON.parse((duel as any).pendingChoice);
            logger.debug(`✅ [findDuelByIdFromDatabase] pendingChoice parseado do banco:`, {
              type: (duel as any).pendingChoice?.type,
              userId: (duel as any).pendingChoice?.userId,
            });
          } catch (e) {
            logger.error(`❌ [findDuelByIdFromDatabase] Erro ao fazer parse do pendingChoice:`, e);
            (duel as any).pendingChoice = null;
          }
        }

        // Se não há turn_started_at mas o duelo está em progresso, inicializar
        if (!(duel as any).turnStartedAt && duel.status === DuelStatus.IN_PROGRESS) {
          (duel as any).turnStartedAt = new Date();
          // Salvar no banco também (async, não bloqueia)
          setImmediate(async () => {
            await this.updateDuelInDatabase(duelIdStr, { turnStartedAt: new Date() } as any);
          });
        }

        // CRÍTICO: Garantir que os campos sejam preservados ao adicionar ao cache
        // Criar uma cópia profunda para garantir que os campos não sejam perdidos
        const duelToCache = {
          ...duel,
          player1Field: JSON.parse(JSON.stringify((duel as any).player1Field)),
          player2Field: JSON.parse(JSON.stringify((duel as any).player2Field)),
          pendingChoice: (duel as any).pendingChoice ? JSON.parse(JSON.stringify((duel as any).pendingChoice)) : null,
        };

        logger.debug(`💾 [findDuelByIdFromDatabase] Adicionando ao cache - player1Field.deck.length: ${(duelToCache as any).player1Field?.deck?.length || 0}`);
        logger.debug(`💾 [findDuelByIdFromDatabase] pendingChoice no cache:`, {
          exists: !!(duelToCache as any).pendingChoice,
          type: (duelToCache as any).pendingChoice?.type,
          userId: (duelToCache as any).pendingChoice?.userId,
          hasData: !!(duelToCache as any).pendingChoice?.data,
        });

        // CRÍTICO: Verificar se há dados mais recentes no cache antes de sobrescrever
        // Isso previne perda de efeitos e mudanças que ainda não foram salvas no banco
        const cachedDuel = this.activeDuels.get(duelIdStr);
        if (cachedDuel) {
          const hasPendingFields = this.pendingDuelPersists.has(duelIdStr);
          // Comparar timestamps para ver qual é mais recente
          const cachedUpdatedAt = (cachedDuel as any).updatedAt ? new Date((cachedDuel as any).updatedAt).getTime() : 0;
          const dbUpdatedAt = (duelToCache as any).updatedAt ? new Date((duelToCache as any).updatedAt).getTime() : 0;

          // Pendência de campo OU cache com updatedAt >= DB → memória é fonte da verdade
          // (>= evita empate após debounce, quando updatedAt ainda não foi flushado)
          if (hasPendingFields || cachedUpdatedAt >= dbUpdatedAt) {
            if (hasPendingFields || cachedUpdatedAt > dbUpdatedAt) {
              logger.warn(`⚠️ [findDuelByIdFromDatabase] Preservando cache (pending=${hasPendingFields}, cacheAt=${cachedUpdatedAt}, dbAt=${dbUpdatedAt})`);
            }
            // NÃO sobrescrever o cache - retornar o cache em vez disso
            // Mas garantir que o cache seja salvo no banco para sincronizar
            if (hasPendingFields || cachedUpdatedAt > dbUpdatedAt) {
              setImmediate(async () => {
                try {
                  await this.flushPendingDuelPersist(duelIdStr);
                  await this.syncDuelState(duelIdStr, this.activeDuels.get(duelIdStr) || cachedDuel);
                } catch (error) {
                  logger.error(`❌ [findDuelByIdFromDatabase] Erro ao sincronizar cache com banco:`, error);
                }
              });
            }
            return cachedDuel;
          }
        }

        this.activeDuels.set(duelIdStr, duelToCache as any);
        this.activeDuelsCountCache = this.activeDuels.size;
        this.lastCountUpdate = Date.now();

        logger.debug(`✅ [findDuelByIdFromDatabase] Duelo adicionado ao cache em memória`);
      } else {
        logger.warn(`⚠️ [findDuelByIdFromDatabase] Duelo ${duelIdStr} NÃO encontrado no banco!`);
      }

      const duration = Date.now() - startTime;
      logger.perf(`findDuelByIdFromDatabase (${duelIdStr})`, duration);

      return duel;
    } catch (error: any) {
      logger.error(`❌ [findDuelByIdFromDatabase] ERRO ao buscar duelo ${duelIdStr}:`, error);
      return null;
    }
  }

  private deepCleanField(field: any): any {
    if (!field) {
      logger.warn(`⚠️ [deepCleanField] Campo vazio recebido`);
      return {
        deck: [],
        hand: [],
        extraDeck: [],
        monsters: [],
        spellTrap: [],
        graveyard: [],
      };
    }

    try {
    const clean = { ...field };

    if (clean.deck && Array.isArray(clean.deck)) {
        const originalDeckLength = clean.deck.length;
        logger.debug(`🧹 [deepCleanField] Limpando deck com ${originalDeckLength} cartas...`);
        clean.deck = clean.deck.map((card: any, index: number) => {
          // Se a carta é null/undefined, retornar null (será filtrado)
          if (!card) {
            return null;
          }

          // Debug: Verificar cardImage antes de compactar
          if (index < 3 && card?.name) {
            logger.debug(`🔍 [deepCleanField] Carta ${index} do deck ANTES de compactCard:`, {
              name: card.name,
              hasCardImage: !!card.cardImage,
              cardImage: card.cardImage,
              hasCardCard: !!card.card,
              cardCardImage: card.card?.cardImage,
            });
          }

          const compacted = this.compactCard(card);
          if (!compacted && index < 3) {
            logger.warn(`⚠️ [deepCleanField] Carta ${index} do deck retornou null após compactCard:`, {
              originalCard: card?.name || card?.idCarta || 'Desconhecida',
              cardKeys: card ? Object.keys(card) : [],
            });
          } else if (compacted && index < 3 && compacted.name) {
            // Debug: Verificar cardImage depois de compactar
            logger.debug(`🔍 [deepCleanField] Carta ${index} do deck DEPOIS de compactCard:`, {
              name: compacted.name,
              hasCardImage: !!compacted.cardImage,
              cardImage: compacted.cardImage,
            });
          }
          return compacted;
        }).filter((c: any) => c !== null);

        const finalDeckLength = clean.deck.length;
        if (finalDeckLength < originalDeckLength) {
          logger.warn(`⚠️ [deepCleanField] ATENÇÃO: Deck perdeu ${originalDeckLength - finalDeckLength} cartas durante limpeza! (${originalDeckLength} -> ${finalDeckLength})`);
        }
        logger.debug(`🧹 [deepCleanField] Deck limpo: ${finalDeckLength} cartas restantes (de ${originalDeckLength} originais)`);
      } else {
        // CRÍTICO: Se deck não existe ou não é array, inicializar como array vazio
        if (!clean.deck || !Array.isArray(clean.deck)) {
          logger.warn(`⚠️ [deepCleanField] Deck não é um array válido, inicializando como array vazio`);
          clean.deck = [];
        }
    }

    if (clean.hand && Array.isArray(clean.hand)) {
        logger.debug(`🧹 [deepCleanField] Limpando hand com ${clean.hand.length} cartas...`);
        clean.hand = clean.hand.map((card: any, index: number) => {
          // Debug: Verificar cardImage antes de compactar
          if (index < 3 && card?.name) {
            logger.debug(`🔍 [deepCleanField] Carta ${index} da mão ANTES de compactCard:`, {
              name: card.name,
              hasCardImage: !!card.cardImage,
              cardImage: card.cardImage,
              hasCardCard: !!card.card,
              cardCardImage: card.card?.cardImage,
            });
          }
          const compacted = this.compactCard(card);
          if (!compacted && index < 3) {
            logger.warn(`⚠️ [deepCleanField] Carta ${index} da mão retornou null após compactCard:`, card);
          } else if (compacted && index < 3 && compacted.name) {
            // Debug: Verificar cardImage depois de compactar
            logger.debug(`🔍 [deepCleanField] Carta ${index} da mão DEPOIS de compactCard:`, {
              name: compacted.name,
              hasCardImage: !!compacted.cardImage,
              cardImage: compacted.cardImage,
            });
          }
          return compacted;
        }).filter((c: any) => c !== null);
        logger.debug(`🧹 [deepCleanField] Hand limpa: ${clean.hand.length} cartas restantes`);
      } else {
        clean.hand = clean.hand || [];
    }

    if (clean.monsters && Array.isArray(clean.monsters)) {
      logger.debug(`🧹 [deepCleanField] Limpando ${clean.monsters.length} monstros...`);
      clean.monsters = clean.monsters.map((monster: any, index: number) => {
        if (!monster) return null;
        const compacted = this.compactCard(monster);
        // Garantir que propriedades críticas sejam preservadas SEMPRE
        if (compacted && monster) {
          // Preservar position
          if (monster.position !== undefined && monster.position !== null) {
            compacted.position = monster.position;
            logger.debug(`🔍 [deepCleanField] Preservando position para monstro ${compacted.name}: ${monster.position}`);
          }
          // Preservar summonedTurnNumber (CRÍTICO para impedir mudança de posição no mesmo turno)
          if (monster.summonedTurnNumber !== undefined && monster.summonedTurnNumber !== null) {
            compacted.summonedTurnNumber = monster.summonedTurnNumber;
            logger.debug(`🔍 [deepCleanField] Preservando summonedTurnNumber para monstro ${compacted.name}: ${monster.summonedTurnNumber}`);
          }
          // Preservar summonedByPlayer
          if (monster.summonedByPlayer !== undefined && monster.summonedByPlayer !== null) {
            compacted.summonedByPlayer = monster.summonedByPlayer;
          }
          // Preservar positionChangedThisTurn
          if (monster.positionChangedThisTurn !== undefined && monster.positionChangedThisTurn !== null) {
            compacted.positionChangedThisTurn = monster.positionChangedThisTurn;
          }
          // Preservar attackedThisTurn
          if (monster.attackedThisTurn !== undefined && monster.attackedThisTurn !== null) {
            compacted.attackedThisTurn = monster.attackedThisTurn;
          }
          // Preservar attacksThisTurn (contador de ataques para monstros que podem atacar múltiplas vezes)
          if (monster.attacksThisTurn !== undefined && monster.attacksThisTurn !== null) {
            compacted.attacksThisTurn = monster.attacksThisTurn;
          }
          // Preservar effectUsedThisTurn (para efeitos que só podem ser usados uma vez por turno, ex: ChaosSorcerer)
          if (monster.effectUsedThisTurn !== undefined && monster.effectUsedThisTurn !== null) {
            compacted.effectUsedThisTurn = monster.effectUsedThisTurn;
          }
          // Preservar cannotAttackThisTurn (para monstros que não podem atacar neste turno, ex: ChaosSorcerer após usar efeito)
          if (monster.cannotAttackThisTurn !== undefined && monster.cannotAttackThisTurn !== null) {
            compacted.cannotAttackThisTurn = monster.cannotAttackThisTurn;
          }
          // Preservar canAttackAgainThisTurn e canAttackAgainIfDestroys (BLS - Envoy of the Beginning efeito 2)
          if (monster.canAttackAgainThisTurn !== undefined && monster.canAttackAgainThisTurn !== null) {
            compacted.canAttackAgainThisTurn = monster.canAttackAgainThisTurn;
          }
          if (monster.canAttackAgainIfDestroys !== undefined && monster.canAttackAgainIfDestroys !== null) {
            compacted.canAttackAgainIfDestroys = monster.canAttackAgainIfDestroys;
          }
          // Preservar propriedades de equipamento APENAS se o monstro ainda tem equipamentos (evita salvar bônus fantasma)
          const hasEquips = monster.equippedCards && Array.isArray(monster.equippedCards) && monster.equippedCards.length > 0;
          if (hasEquips) {
            if (monster.equippedBy !== undefined && monster.equippedBy !== null) {
              compacted.equippedBy = monster.equippedBy;
            }
            if (monster.equippedCardId !== undefined && monster.equippedCardId !== null) {
              compacted.equippedCardId = monster.equippedCardId;
            }
            if (monster.equippedSpellTrapZoneIndex !== undefined && monster.equippedSpellTrapZoneIndex !== null) {
              compacted.equippedSpellTrapZoneIndex = monster.equippedSpellTrapZoneIndex;
            }
            if (monster.equippedZoneIndex !== undefined && monster.equippedZoneIndex !== null) {
              compacted.equippedZoneIndex = monster.equippedZoneIndex;
            }
            if (monster.equipmentBonusAtk !== undefined && monster.equipmentBonusAtk !== null) {
              compacted.equipmentBonusAtk = monster.equipmentBonusAtk;
            }
            if (monster.equipmentBonusDef !== undefined && monster.equipmentBonusDef !== null) {
              compacted.equipmentBonusDef = monster.equipmentBonusDef;
            }
            compacted.equippedCards = [...monster.equippedCards];
            logger.debug(`🔍 [deepCleanField] Preservando equippedCards array para monstro ${compacted.name}: ${monster.equippedCards.length} equipamento(s) - ${monster.equippedCards.join(', ')}`);
          } else {
            // Monstro sem equips: não persistir bônus/equip (evita ATK salvo após equip ou monstro destruído)
            if (compacted.equipmentBonusAtk !== undefined) delete compacted.equipmentBonusAtk;
            if (compacted.equipmentBonusDef !== undefined) delete compacted.equipmentBonusDef;
            if (compacted.equippedCards !== undefined) delete compacted.equippedCards;
            if (compacted.equippedCardId !== undefined) delete compacted.equippedCardId;
            if (compacted.equippedSpellTrapZoneIndex !== undefined) delete compacted.equippedSpellTrapZoneIndex;
            if (compacted.equippedBy !== undefined) delete compacted.equippedBy;
          }
          // CRÍTICO: Preservar campos de controle do ChangeOfHeart
          if (monster.controlledBy !== undefined && monster.controlledBy !== null) {
            compacted.controlledBy = monster.controlledBy;
            logger.debug(`🔍 [deepCleanField] Preservando controlledBy para monstro ${compacted.name}: ${monster.controlledBy}`);
          }
          if (monster.originalOwner !== undefined && monster.originalOwner !== null) {
            compacted.originalOwner = monster.originalOwner;
            logger.debug(`🔍 [deepCleanField] Preservando originalOwner para monstro ${compacted.name}: ${monster.originalOwner}`);
          }
          if (monster.originalZoneIndex !== undefined && monster.originalZoneIndex !== null) {
            compacted.originalZoneIndex = monster.originalZoneIndex;
            logger.debug(`🔍 [deepCleanField] Preservando originalZoneIndex para monstro ${compacted.name}: ${monster.originalZoneIndex}`);
          }
          if (monster.controlledUntilTurn !== undefined && monster.controlledUntilTurn !== null) {
            compacted.controlledUntilTurn = monster.controlledUntilTurn;
            logger.debug(`🔍 [deepCleanField] Preservando controlledUntilTurn para monstro ${compacted.name}: ${monster.controlledUntilTurn}`);
          }
          // Breaker the Magical Warrior: preservar bônus de +300 ATK até usar o efeito ou monstro ser destruído
          if (monster.spellCounters !== undefined && monster.spellCounters !== null) {
            compacted.spellCounters = monster.spellCounters;
          }
          if (monster.spellCounterBonusAtk !== undefined && monster.spellCounterBonusAtk !== null) {
            compacted.spellCounterBonusAtk = monster.spellCounterBonusAtk;
          }
          // Slifer the Sky Dragon: monstro invocado em ataque pelo oponente perde 2000 ATK
          if (monster.sliferAtkDebuff !== undefined && monster.sliferAtkDebuff !== null) {
            compacted.sliferAtkDebuff = monster.sliferAtkDebuff;
          }
        }
        if (index < 2) {
          logger.debug(`🧹 [deepCleanField] Monstro ${index}:`, {
            name: compacted?.name,
            position: compacted?.position,
            summonedTurnNumber: compacted?.summonedTurnNumber,
            summonedByPlayer: compacted?.summonedByPlayer,
            controlledBy: compacted?.controlledBy,
            originalOwner: compacted?.originalOwner,
            originalZoneIndex: compacted?.originalZoneIndex,
            originalPosition: monster?.position,
          });
        }
        return compacted;
      });
      logger.debug(`🧹 [deepCleanField] Monstros limpos:`, clean.monsters.map((m: any, i: number) => ({
        index: i,
        name: m?.name || 'null',
        position: m?.position || 'null',
        summonedTurnNumber: m?.summonedTurnNumber !== undefined ? m.summonedTurnNumber : 'undefined',
      })));
      } else {
        clean.monsters = clean.monsters || [];
    }

    if (clean.spellTrap && Array.isArray(clean.spellTrap)) {
      // CRÍTICO: Preservar nulls e garantir que seja sempre um array de 5 elementos
      clean.spellTrap = clean.spellTrap.map((card: any) => {
        if (!card) return null; // Preservar null (zona vazia)
        return this.compactCard(card);
      });
      // Garantir que sempre tenha exatamente 5 elementos
      while (clean.spellTrap.length < 5) {
        clean.spellTrap.push(null);
      }
      clean.spellTrap = clean.spellTrap.slice(0, 5);
      } else {
        // Se não é array, criar array de 5 nulls
        clean.spellTrap = [null, null, null, null, null];
    }

    if (clean.graveyard && Array.isArray(clean.graveyard)) {
        clean.graveyard = clean.graveyard.map((card: any) => this.compactCard(card)).filter((c: any) => c !== null);
      } else {
        clean.graveyard = clean.graveyard || [];
    }

    // Limpar extra deck (separado do deck principal)
    if (clean.extraDeck && Array.isArray(clean.extraDeck)) {
        logger.debug(`🧹 [deepCleanField] Limpando extra deck com ${clean.extraDeck.length} cartas...`);
        clean.extraDeck = clean.extraDeck.map((card: any) => this.compactCard(card)).filter((c: any) => c !== null);
        logger.debug(`🧹 [deepCleanField] Extra deck limpo: ${clean.extraDeck.length} cartas restantes`);
      } else {
        clean.extraDeck = clean.extraDeck || [];
    }

    // CRÍTICO: Preservar turnCounter no JSON do campo
    if (field.turnCounter !== undefined && field.turnCounter !== null) {
      clean.turnCounter = field.turnCounter;
      logger.debug(`🔍 [deepCleanField] Preservando turnCounter: ${field.turnCounter}`);
    }
    if (field.firstTurnPlayer === 1 || field.firstTurnPlayer === 2) {
      clean.firstTurnPlayer = field.firstTurnPlayer;
    }
    if (field.stolenTurnOccurred === true) {
      clean.stolenTurnOccurred = true;
    }
    if (field.obeliskEffectUsedTurn !== undefined && field.obeliskEffectUsedTurn !== null) {
      clean.obeliskEffectUsedTurn = field.obeliskEffectUsedTurn;
    }
    if (field.magiciansRodSearchUsedTurn !== undefined && field.magiciansRodSearchUsedTurn !== null) {
      clean.magiciansRodSearchUsedTurn = field.magiciansRodSearchUsedTurn;
    }
    if (field.magiciansRodGyUsedTurn !== undefined && field.magiciansRodGyUsedTurn !== null) {
      clean.magiciansRodGyUsedTurn = field.magiciansRodGyUsedTurn;
    }
    if (field.magiciansRodGyCheckPending === true) {
      clean.magiciansRodGyCheckPending = true;
    }
    if (field.magiciansSalvationActivatedTurn !== undefined && field.magiciansSalvationActivatedTurn !== null) {
      clean.magiciansSalvationActivatedTurn = field.magiciansSalvationActivatedTurn;
    }
    if (field.magiciansSalvationPairUsedTurn !== undefined && field.magiciansSalvationPairUsedTurn !== null) {
      clean.magiciansSalvationPairUsedTurn = field.magiciansSalvationPairUsedTurn;
    }
    if (field.eternalSoulEffectUsedTurn !== undefined && field.eternalSoulEffectUsedTurn !== null) {
      clean.eternalSoulEffectUsedTurn = field.eternalSoulEffectUsedTurn;
    }
    if (field.electromagneticTurtleUsedThisDuel === true) {
      clean.electromagneticTurtleUsedThisDuel = true;
    }

    // Preservar outras propriedades do campo
    if (field.normalSummonUsed !== undefined) {
      clean.normalSummonUsed = field.normalSummonUsed;
    }
    if (field.positionChangedThisTurn !== undefined) {
      clean.positionChangedThisTurn = field.positionChangedThisTurn;
    }

    // CRÍTICO: Preservar array banished (cartas banidas)
    if (field.banished && Array.isArray(field.banished)) {
      clean.banished = field.banished.map((card: any) => this.compactCard(card)).filter((c: any) => c !== null);
      logger.debug(`🔍 [deepCleanField] Preservando banished: ${clean.banished.length} carta(s) banida(s)`);
    } else {
      clean.banished = field.banished || [];
    }

    return clean;
    } catch (error) {
      logger.error(`❌ [deepCleanField] Erro ao limpar campo:`, error);
      return {
        deck: [],
        hand: [],
        extraDeck: [],
        monsters: [],
        spellTrap: [],
        graveyard: [],
      };
    }
  }

  /**
   * CRÍTICO: Método centralizado para sincronizar estado do duelo entre cache e banco
   * Memória = fonte da verdade; JSONB de campo é persistido com debounce (menos WAL/CPU).
   */
  async syncDuelState(duelId: string | number, duel: Duel, updates?: Partial<Duel>): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    try {
      // Atualizar cache primeiro (fonte da verdade)
      const duelToCache = {
        ...duel,
        player1Field: JSON.parse(JSON.stringify((duel as any).player1Field)),
        player2Field: JSON.parse(JSON.stringify((duel as any).player2Field)),
        pendingChoice: (duel as any).pendingChoice ? JSON.parse(JSON.stringify((duel as any).pendingChoice)) : null,
      };

      this.activeDuels.set(duelIdStr, duelToCache as any);

      const updatesToSave: Partial<Duel> = updates || {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
        pendingChoice: (duel as any).pendingChoice,
      };

      await this.updateDuelInDatabase(duelIdStr, updatesToSave);

      logger.debug(`✅ [syncDuelState] Estado do duelo ${duelIdStr} sincronizado (cache + banco)`);
    } catch (error) {
      logger.error(`❌ [syncDuelState] Erro ao sincronizar estado do duelo ${duelIdStr}:`, error);
      // Não lançar erro - apenas logar para não quebrar o fluxo
    }
  }

  /** Campos que exigem flush imediato (fim de duelo, LP crítico, etc.). */
  private shouldPersistDuelImmediately(updates: Partial<Duel>): boolean {
    const u = updates as any;
    return (
      u.status != null ||
      u.result != null ||
      u.winnerId !== undefined ||
      u.finishedAt != null ||
      u.player1LifePoints !== undefined ||
      u.player2LifePoints !== undefined ||
      u.currentTurn !== undefined ||
      u.currentPhase !== undefined
    );
  }

  private scheduleDuelPersist(duelIdStr: string, updates: Partial<Duel>): void {
    const existing = this.pendingDuelPersists.get(duelIdStr);
    const merged: Partial<Duel> = existing
      ? { ...existing.updates, ...updates }
      : { ...updates };
    if (existing?.timer) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      this.pendingDuelPersists.delete(duelIdStr);
      this.flushDuelPersist(duelIdStr, merged).catch((err) => {
        logger.error(`❌ [scheduleDuelPersist] Falha ao persistir duelo ${duelIdStr}:`, err);
      });
    }, this.DUEL_FIELD_PERSIST_DEBOUNCE_MS);
    this.pendingDuelPersists.set(duelIdStr, { updates: merged, timer });
  }

  /** Força flush de escrita pendente (ex.: fim do duelo / disconnect). */
  async flushPendingDuelPersist(duelId: string | number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const pending = this.pendingDuelPersists.get(duelIdStr);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingDuelPersists.delete(duelIdStr);
    await this.flushDuelPersist(duelIdStr, pending.updates);
  }

  private async flushDuelPersist(duelIdStr: string, updates: Partial<Duel>): Promise<void> {
    await this.updateDuelInDatabase(duelIdStr, updates, { immediate: true, _fromFlush: true });
  }

  /** Aplica updates no Map em memória sem tocar no Postgres (usado no debounce). */
  private applyDuelUpdatesToMemory(duelIdStr: string, updates: Partial<Duel>): void {
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;
    for (const key of Object.keys(updates)) {
      if (key === 'player1' || key === 'player2') continue;
      (duel as any)[key] = (updates as any)[key];
    }
    // CRÍTICO: bump updatedAt para que findDuelByIdFromDatabase não sobrescreva
    // o campo em memória com JSONB antigo do Postgres (debounce ~2.5s).
    (duel as any).updatedAt = new Date();
  }

  /**
   * Garante que escritas de campo ainda no debounce estejam no banco E na memória
   * antes de qualquer reload forceFromDatabase / mudança de turno.
   */
  private async ensureFieldStateBeforeReload(duelIdStr: string): Promise<void> {
    if (this.pendingDuelPersists.has(duelIdStr)) {
      await this.flushPendingDuelPersist(duelIdStr);
    }
  }

  async updateDuelInDatabase(
    duelId: string | number,
    updates: Partial<Duel>,
    options?: { immediate?: boolean; _fromFlush?: boolean },
  ): Promise<void> {
    try {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      const includePlayer1Field = Object.prototype.hasOwnProperty.call(updates as object, 'player1Field');
      const includePlayer2Field = Object.prototype.hasOwnProperty.call(updates as object, 'player2Field');
      const hasHeavyFields = includePlayer1Field || includePlayer2Field;
      const immediate =
        options?.immediate === true ||
        options?._fromFlush === true ||
        this.shouldPersistDuelImmediately(updates);

      // Debounce: memória já é fonte da verdade; JSONB grande só vai ao Postgres a cada ~2.5s
      // (exceto status/LP/turno/fim — ou flush explícito).
      if (hasHeavyFields && !immediate && !options?._fromFlush) {
        this.applyDuelUpdatesToMemory(duelIdStr, updates);
        this.scheduleDuelPersist(duelIdStr, updates);
        return;
      }

      // Flush pendente antes de escrita imediata (evita sobrescrever com estado antigo)
      if (immediate && !options?._fromFlush) {
        const pending = this.pendingDuelPersists.get(duelIdStr);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingDuelPersists.delete(duelIdStr);
          // Memória / pending de campo ganham de updates que possam trazer JSONB stale
          const mem = this.activeDuels.get(duelIdStr) as any;
          const mergedPending: Partial<Duel> = { ...pending.updates, ...updates };
          if (pending.updates.player1Field || mem?.player1Field) {
            (mergedPending as any).player1Field =
              mem?.player1Field ?? pending.updates.player1Field ?? (updates as any).player1Field;
          }
          if (pending.updates.player2Field || mem?.player2Field) {
            (mergedPending as any).player2Field =
              mem?.player2Field ?? pending.updates.player2Field ?? (updates as any).player2Field;
          }
          updates = mergedPending;
        }
      }

      // OTIMIZAÇÃO: Usar cache em memória primeiro para evitar SELECT desnecessário
      let existingDuel: Duel | null | undefined = this.activeDuels.get(duelIdStr);

      // Se não está em memória, buscar do banco
      if (!existingDuel) {
        existingDuel = await this.duelsRepository.findOne({ where: { id: duelIdStr } });
        if (!existingDuel) {
          logger.error(`❌ [updateDuelInDatabase] Duelo ${duelIdStr} não encontrado no banco`);
          return;
        }
      }

      // CRÍTICO: Se os campos foram passados, usar diretamente (não fazer merge com dados antigos)
      // Isso garante que mudanças como spellTrap[zoneIndex] = null sejam preservadas
      const mergedUpdates: any = { ...updates };

      // Se player1Field foi passado, usar diretamente (já está atualizado em memória)
      if (mergedUpdates.player1Field !== undefined && mergedUpdates.player1Field !== null) {
        // Garantir que o campo tenha a estrutura correta
        if (!mergedUpdates.player1Field.turnCounter) {
          mergedUpdates.player1Field.turnCounter = (existingDuel as any).player1Field?.turnCounter || 1;
        }
        if (mergedUpdates.player1Field.firstTurnPlayer == null && (existingDuel as any).player1Field?.firstTurnPlayer != null) {
          mergedUpdates.player1Field.firstTurnPlayer = (existingDuel as any).player1Field.firstTurnPlayer;
        }
        if (mergedUpdates.player1Field.stolenTurnOccurred !== true && (existingDuel as any).player1Field?.stolenTurnOccurred === true) {
          mergedUpdates.player1Field.stolenTurnOccurred = true;
        }
        // Garantir que spellTrap seja um array de 5 elementos (preservando nulls)
        if (!Array.isArray(mergedUpdates.player1Field.spellTrap)) {
          mergedUpdates.player1Field.spellTrap = [null, null, null, null, null];
        }
        while (mergedUpdates.player1Field.spellTrap.length < 5) {
          mergedUpdates.player1Field.spellTrap.push(null);
        }
        mergedUpdates.player1Field.spellTrap = mergedUpdates.player1Field.spellTrap.slice(0, 5);
      } else {
        // Se não foi passado, usar o existente
        mergedUpdates.player1Field = (existingDuel as any).player1Field || {};
      }

      // Se player2Field foi passado, usar diretamente (já está atualizado em memória)
      if (mergedUpdates.player2Field !== undefined && mergedUpdates.player2Field !== null) {
        // Garantir que o campo tenha a estrutura correta
        if (!mergedUpdates.player2Field.turnCounter) {
          mergedUpdates.player2Field.turnCounter = (existingDuel as any).player2Field?.turnCounter || 1;
        }
        if (mergedUpdates.player2Field.firstTurnPlayer == null && (existingDuel as any).player2Field?.firstTurnPlayer != null) {
          mergedUpdates.player2Field.firstTurnPlayer = (existingDuel as any).player2Field.firstTurnPlayer;
        }
        if (mergedUpdates.player2Field.stolenTurnOccurred !== true && (existingDuel as any).player2Field?.stolenTurnOccurred === true) {
          mergedUpdates.player2Field.stolenTurnOccurred = true;
        }
        // Garantir que spellTrap seja um array de 5 elementos (preservando nulls)
        if (!Array.isArray(mergedUpdates.player2Field.spellTrap)) {
          mergedUpdates.player2Field.spellTrap = [null, null, null, null, null];
        }
        while (mergedUpdates.player2Field.spellTrap.length < 5) {
          mergedUpdates.player2Field.spellTrap.push(null);
        }
        mergedUpdates.player2Field.spellTrap = mergedUpdates.player2Field.spellTrap.slice(0, 5);
      } else {
        // Se não foi passado, usar o existente
        mergedUpdates.player2Field = (existingDuel as any).player2Field || {};
      }

      // CRÍTICO: Atualizar em memória com os dados atualizados
      // Isso garante que o cache tenha os dados mais recentes
      const duel = this.activeDuels.get(duelIdStr);
      if (duel) {
        // Atualizar campos não-JSONB
        Object.keys(mergedUpdates).forEach(key => {
          if (key !== 'player1Field' && key !== 'player2Field' && key !== 'player1' && key !== 'player2') {
            (duel as any)[key] = mergedUpdates[key];
          }
        });
        // Atualizar campos JSONB diretamente (já estão corretos)
        if (mergedUpdates.player1Field !== undefined) {
          (duel as any).player1Field = mergedUpdates.player1Field;
        }
        if (mergedUpdates.player2Field !== undefined) {
          (duel as any).player2Field = mergedUpdates.player2Field;
        }
      }

      const cleanUpdates: any = { ...mergedUpdates };

      // Só persiste JSONB de campo quando o caller envia explicitamente — evita regravar ~2× deck+GY a cada UPDATE pequeno (egress / WAL)
      if (includePlayer1Field && cleanUpdates.player1Field) {
        cleanUpdates.player1Field = this.deepCleanField(cleanUpdates.player1Field);
      } else {
        delete cleanUpdates.player1Field;
      }
      if (includePlayer2Field && cleanUpdates.player2Field) {
        cleanUpdates.player2Field = this.deepCleanField(cleanUpdates.player2Field);
      } else {
        delete cleanUpdates.player2Field;
      }

      // Remover relações se estiverem presentes
      delete cleanUpdates.player1;
      delete cleanUpdates.player2;

      // Sempre atualizar updatedAt
      cleanUpdates.updatedAt = new Date();

      // Preservar origin se não foi fornecido nos updates
      if (cleanUpdates.origin === undefined || cleanUpdates.origin === null) {
        cleanUpdates.origin = existingDuel.origin || DuelOrigin.OTHER;
      } else if (!Object.values(DuelOrigin).includes(cleanUpdates.origin)) {
        cleanUpdates.origin = existingDuel.origin || DuelOrigin.OTHER;
      }

      // OTIMIZAÇÃO: Um único UPDATE em vez de SELECT + SAVE (reduz latência e carga no DB)
      const result = await this.duelsRepository.update({ id: duelIdStr }, cleanUpdates);
      if (result.affected === 0) {
        logger.error(`❌ [updateDuelInDatabase] Duelo ${duelIdStr} não encontrado para atualizar`);
      } else {
        const mem = this.activeDuels.get(duelIdStr);
        if (mem && cleanUpdates.updatedAt) {
          (mem as any).updatedAt = cleanUpdates.updatedAt;
        }
      }
    } catch (error) {
      logger.error(`❌ [updateDuelInDatabase] Erro ao atualizar duelo ${duelId}:`, error);
      throw error;
    }
  }


  async drawCard(
    duelId: string | number,
    userId: number,
    options?: { mandatory?: boolean },
  ): Promise<void> {
    const mandatory = options?.mandatory !== false;
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    // Se não encontrou em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) return;
      duel = duelFromDb;
    }

    if (duel.status === DuelStatus.FINISHED) {
      return;
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const opponentId = isPlayer1 ? player2IdNum : player1IdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    const loseByDeckOut = async () => {
      const duelResult = isPlayer1 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN;
      await this.saveDuelLog(
        duelIdStr,
        userIdNum,
        DuelActionType.DUEL_END,
        'Derrota: não havia cartas no deck para comprar',
      );
      await this.finishDuel(duelIdStr, duelResult, opponentId);
      const fresh = await this.findDuelByIdFromDatabase(duelIdStr, true);
      if (fresh) {
        this.activeDuels.set(duelIdStr, fresh);
      }
    };

    if (!playerField || !playerField.deck || playerField.deck.length === 0) {
      if (mandatory) {
        await loseByDeckOut();
      }
      return;
    }

    const drawnCard = playerField.deck.shift();
    if (!drawnCard) {
      if (mandatory) {
        await loseByDeckOut();
      }
      return;
    }

    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    const jinzoOnField = this.isJinzoOnField(duel);

    // Verificar se o oponente tem "Drop Off" ativada (face-up)
    let dropOffActivated = false;
    let dropOffZoneIndex = -1;

    // Se Jinzo está no campo, Drop Off não pode ser ativada
    if (!jinzoOnField && opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
      for (let i = 0; i < opponentField.spellTrap.length; i++) {
        const trap = opponentField.spellTrap[i];
        if (trap && trap !== null) {
          const trapName = (trap.name || '').toLowerCase().trim();
          const trapPosition = trap.position || 'set';

          // Verificar se é "Drop Off" pelo nome (não pelo idCarta, que pode variar)
          // Aceitar variações: "Drop Off", "DropOff", "drop off", etc.
          const isDropOff = trapName === 'drop off' || trapName === 'dropoff' || trapName.includes('drop off');

          // Verificar se está face-up (ativada)
          if (isDropOff && (trapPosition === 'face-up' || trapPosition === 'activated')) {
            dropOffActivated = true;
            dropOffZoneIndex = i;
            logger.info(`✨ [drawCard] Drop Off detectada na zona ${i} do oponente - interceptando compra de carta`);
            break;
          }
        }
      }
    } else if (jinzoOnField) {
      logger.info(`🤖 [drawCard] Jinzo está no campo - Drop Off não pode ser ativada`);
    }

    if (dropOffActivated) {
      // Drop Off ativada: enviar carta para o cemitério em vez da mão
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      playerField.graveyard.push(drawnCard);

      logger.info(`✅ [drawCard] Carta "${drawnCard.name || drawnCard.cardName || 'Desconhecida'}" enviada para o cemitério devido ao efeito de Drop Off`);

      // Mover Drop Off para o cemitério do oponente (quem ativou)
      if (opponentField && opponentField.spellTrap && dropOffZoneIndex >= 0) {
        const dropOffTrap = opponentField.spellTrap[dropOffZoneIndex];
        if (dropOffTrap) {
          if (!opponentField.graveyard) {
            opponentField.graveyard = [];
          }
          opponentField.graveyard.push(dropOffTrap);
          opponentField.spellTrap[dropOffZoneIndex] = null;
          logger.info(`✅ [drawCard] Drop Off movida para o cemitério do oponente após ativação`);
          // Mage Power: recalculando ATK do jogador que tinha a Drop Off (uma spell/trap foi removida do campo dele)
          const trapOwnerIsPlayer1 = (duel as any).player1Id === opponentId;
          await this.recalculateMagePowerAtk(duelId, duel, trapOwnerIsPlayer1);
        }
      }

      // Salvar log de compra de carta interceptada
      const cardName = drawnCard.name || drawnCard.cardName || 'Carta';
      await this.saveDuelLog(duelId, opponentId, DuelActionType.SET_SPELL_TRAP, `Drop Off interceptou a compra de ${cardName} e enviou para o cemitério`);
    } else {
      // Comportamento normal: adicionar à mão
      // Garantir que a carta tenha instanceId único (importante para distinguir múltiplas cópias)
      this.ensureCardInstanceId(drawnCard);
      playerField.hand = playerField.hand || [];
      playerField.hand.push(drawnCard);
      logger.info(`✅ [drawCard] Carta comprada normalmente. Hand do player ${userId}: ${playerField.hand?.length || 0} cartas`);

      // Salvar log de compra de carta
      const cardName = drawnCard.name || drawnCard.cardName || 'Carta';
      await this.saveDuelLog(duelId, userId, DuelActionType.DRAW_CARD, `Comprou ${cardName}`);
    }

    // Garantir que o duelo atualizado está no cache
    this.activeDuels.set(duelIdStr, duel);

    // Atualizar no banco de dados - sempre atualizar ambos os campos para manter sincronização
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
  }

  /**
   * Função especial para MASTER: busca uma carta pelo nome na lista completa de cartas do jogo e adiciona à mão
   */
  async masterAddCardToHand(duelId: string | number, userId: number, cardName: string): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    // Se não encontrou em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) {
        return { success: false, message: 'Duelo não encontrado' };
      }
      duel = duelFromDb;
    }

    // Converter IDs para número para comparação correta
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;

    logger.info(`🔍 [masterAddCardToHand] Identificando jogador - userId: ${userId} (${typeof userId}) -> ${userIdNum}, player1Id: ${duel.player1Id} (${typeof duel.player1Id}) -> ${player1IdNum}, player2Id: ${duel.player2Id} (${typeof duel.player2Id}) -> ${player2IdNum}, isPlayer1: ${isPlayer1}`);

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField) {
      logger.error(`❌ [masterAddCardToHand] Campo do jogador não encontrado - isPlayer1: ${isPlayer1}`);
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Inicializar mão se não existir
    if (!playerField.hand) {
      playerField.hand = [];
    }

    const trimmedQuery = cardName.trim();
    logger.info(`🔍 [masterAddCardToHand] Buscando carta "${trimmedQuery}" na lista completa de cartas do jogo para ${isPlayer1 ? 'Player 1' : 'Player 2'}`);

    const normalizeName = (s: string) =>
      (s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    const scoreNameMatch = (cardDisplayName: string, queryNorm: string): number => {
      const n = normalizeName(cardDisplayName);
      if (!n || !queryNorm) return 0;
      if (n === queryNorm) return 10_000;
      if (n.startsWith(queryNorm)) return 5_000 + Math.max(0, 500 - n.length);
      if (n.includes(queryNorm)) return 2_000 + Math.max(0, 500 - n.length);
      return 0;
    };

    let card: any = null;

    try {
      card = await this.cardsService.findByNameExact(trimmedQuery);
      if (card) {
        logger.info(`✅ [masterAddCardToHand] Carta encontrada por nome exato: "${card.name}"`);
      }
    } catch (error) {
      logger.info(`ℹ️ [masterAddCardToHand] Erro ao buscar por nome exato:`, error);
    }

    if (!card) {
      try {
        card = await this.cardsService.findByNameExactIgnoreCase(trimmedQuery);
        if (card) {
          logger.info(`✅ [masterAddCardToHand] Carta encontrada por nome exato (ignora maiúsculas): "${card.name}"`);
        }
      } catch (error) {
        logger.info(`ℹ️ [masterAddCardToHand] Busca exata case-insensitive falhou:`, error);
      }
    }

    if (!card) {
      try {
        logger.info(`🔍 [masterAddCardToHand] Buscando por nome parcial (case-insensitive): "${trimmedQuery}"`);
        const cards = await this.cardsService.findAll(trimmedQuery);
        logger.info(`🔍 [masterAddCardToHand] Encontradas ${cards.length} cartas com busca parcial`);

        if (cards.length > 0) {
          const qNorm = normalizeName(trimmedQuery);
          let best: { c: (typeof cards)[0]; score: number } | null = null;
          for (const c of cards) {
            const sc = scoreNameMatch(c.name || '', qNorm);
            if (!best || sc > best.score || (sc === best.score && (c.name || '').length < (best.c.name || '').length)) {
              best = { c, score: sc };
            }
          }
          if (best && best.score > 0) {
            card = best.c;
            logger.info(`✅ [masterAddCardToHand] Melhor correspondência: "${card.name}" (score ${best.score})`);
          } else if (cards.length > 0) {
            card = cards.sort((a, b) => (a.name || '').length - (b.name || '').length)[0];
            logger.info(`⚠️ [masterAddCardToHand] Usando carta mais curta entre resultados: "${card.name}"`);
          }
        }
      } catch (searchError) {
        logger.error(`❌ [masterAddCardToHand] Erro ao buscar carta por nome parcial:`, searchError);
      }
    }

    if (!card) {
      try {
        logger.info(`🔍 [masterAddCardToHand] Tentando idCarta (case-insensitive): "${trimmedQuery}"`);
        card = await this.cardsService.findOneByIdCartaIgnoreCase(trimmedQuery);
        if (card) {
          logger.info(`✅ [masterAddCardToHand] Carta encontrada por idCarta: "${card.name}" (${card.idCarta})`);
        }
      } catch (error) {
        logger.info(`ℹ️ [masterAddCardToHand] idCarta não encontrado:`, error);
      }
    }

    if (!card) {
      return {
        success: false,
        message: `Carta "${cardName}" não encontrada na lista de cartas do jogo. Verifique o nome ou ID da carta.`
      };
    }

    logger.info(`✅ [masterAddCardToHand] Carta encontrada:`, {
      name: card.name,
      idCarta: card.idCarta,
      type: card.type,
      id: card.id,
    });

    // Criar uma cópia da carta no formato usado no duelo (similar ao preparePlayerDeck)
    const isMonster = card.type === 'Monster' || card.type === 'MONSTER' || card.cardType === 'Monster';

    // CRÍTICO: Garantir que idCarta seja sempre usado (não usar id como fallback se idCarta existir)
    const cardIdCarta = card.idCarta || null;
    if (!cardIdCarta) {
      logger.warn(`⚠️ [masterAddCardToHand] Carta "${card.name}" não tem idCarta! Usando id como fallback.`);
    }

    const duelCard = {
      id: card.id,
      idCarta: cardIdCarta || card.id, // Usar idCarta se existir, senão usar id
      cardId: cardIdCarta || card.id, // Usar idCarta se existir, senão usar id
      name: card.name,
      type: card.type,
      cardType: card.type,
      atk: card.atk || 0,
      def: card.def || 0,
      level: card.level || 0,
      attribute: isMonster ? (card.attribute || null) : null,
      race: isMonster ? (card.race || null) : null, // race só para monstros
      rarity: card.rarity || null,
      instanceId: this.generateCardInstanceId(), // ID único para esta instância da carta
      // CRÍTICO: Preservar cardImage (caminho da imagem) para o frontend conseguir carregar
      cardImage: card.cardImage || null,
    };

    logger.info(`🔍 [masterAddCardToHand] Carta formatada para duelo:`, duelCard);
    logger.info(`🔍 [masterAddCardToHand] Hand ANTES de adicionar: ${playerField.hand.length} cartas`);

    // Adicionar à mão
    playerField.hand.push(duelCard);

    logger.info(`✅ [masterAddCardToHand] Carta "${card.name}" adicionada à mão do ${isPlayer1 ? 'Player 1' : 'Player 2'} (userId: ${userId}). Hand DEPOIS: ${playerField.hand.length} cartas`);
    logger.info(`🔍 [masterAddCardToHand] Última carta na mão:`, {
      name: playerField.hand[playerField.hand.length - 1]?.name,
      idCarta: playerField.hand[playerField.hand.length - 1]?.idCarta,
      type: playerField.hand[playerField.hand.length - 1]?.type,
      fullCard: JSON.stringify(playerField.hand[playerField.hand.length - 1])
    });

    // Garantir que o duelo atualizado está no cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`💾 [masterAddCardToHand] Atualizando duelo no banco de dados...`);
    logger.info(`🔍 [masterAddCardToHand] player1Field.hand antes de salvar: ${(duel as any).player1Field?.hand?.length || 0} cartas`);
    logger.info(`🔍 [masterAddCardToHand] player2Field.hand antes de salvar: ${(duel as any).player2Field?.hand?.length || 0} cartas`);

    // Atualizar no banco de dados
    await this.updateDuelInDatabase(duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    logger.info(`✅ [masterAddCardToHand] Duelo atualizado no banco de dados`);

    // Verificar se foi salvo corretamente
    const verifyDuel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (verifyDuel) {
      const verifyField = isPlayer1 ? (verifyDuel as any).player1Field : (verifyDuel as any).player2Field;
      logger.info(`🔍 [masterAddCardToHand] Verificação pós-salvamento - Hand tem ${verifyField?.hand?.length || 0} cartas`);
      if (verifyField?.hand && verifyField.hand.length > 0) {
        logger.info(`🔍 [masterAddCardToHand] Última carta na hand verificada:`, {
          name: verifyField.hand[verifyField.hand.length - 1]?.name,
          idCarta: verifyField.hand[verifyField.hand.length - 1]?.idCarta
        });
      }
    } else {
      logger.error(`❌ [masterAddCardToHand] Não foi possível verificar o duelo após salvar!`);
    }

    // Adicionar log
    try {
      const duelForLog = await this.findDuelByIdFromDatabase(duelIdStr);
      if (duelForLog) {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        const log = this.duelLogsRepository.create({
          duel: duelForLog,
          user: user || undefined,
          actionType: 'DRAW_CARD' as any,
          message: `[MASTER] Carta "${card.name}" (${card.idCarta}) adicionada à mão da lista de cartas do jogo`,
        });
        await this.duelLogsRepository.save(log);
      }
    } catch (logError) {
      logger.error('Erro ao criar log:', logError);
      // Não falhar a operação se o log falhar
    }

    return { success: true, message: `Carta "${card.name}" adicionada à mão com sucesso` };
  }

  /**
   * Assento (1 ou 2) do duelista que começou o duelo (primeiro turno). Persistido em player1Field/player2Field.
   * Usado para DP→MAIN2 e restrições de BP só no primeiro turno de quem começou.
   * `stolenTurnOccurred` anula isso para o restante do duelo.
   */
  private getFirstTurnPlayerSeat(duel: Duel): 1 | 2 | undefined {
    const p1 = (duel as any).player1Field;
    const p2 = (duel as any).player2Field;
    const fp = p1?.firstTurnPlayer ?? p2?.firstTurnPlayer;
    return fp === 1 || fp === 2 ? fp : undefined;
  }

  /** Após qualquer roubo de turno, o restante do duelo usa só fases normais (nada de DP→MP2 / sem BP do 1º turno). */
  private hasStarterFirstTurnRulesVoided(duel: Duel): boolean {
    const p1 = (duel as any).player1Field;
    const p2 = (duel as any).player2Field;
    return p1?.stolenTurnOccurred === true || p2?.stolenTurnOccurred === true;
  }

  /**
   * Processa a fase DRAW automaticamente: compra uma carta e avança para STANDBY
   * A fase DRAW deve ser mostrada visualmente antes de processar
   * Retorna o duelo atualizado após processar
   */
  async processDrawPhase(duelId: string | number): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    // Se não encontrou em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) {
        logger.warn(`⚠️ [processDrawPhase] Duelo ${duelIdStr} não encontrado`);
        return null;
      }
      duel = duelFromDb;
    }

    if (duel.status === DuelStatus.FINISHED) {
      return duel;
    }

    // Se não está na fase DRAW, não fazer nada
    if (duel.currentPhase !== TurnPhase.DRAW) {
      logger.info(`ℹ️ [processDrawPhase] Duelo ${duelIdStr} não está na fase DRAW (fase atual: ${duel.currentPhase})`);
      return null;
    }

    logger.debug(`🔄 [processDrawPhase] Processando fase DRAW para duelo ${duelIdStr}, turno do player ${duel.currentTurn}`);

    // Identificar jogador atual e oponente
    const currentPlayerId = duel.currentTurn === 1 ? duel.player1Id : duel.player2Id;
    const opponentId = duel.currentTurn === 1 ? duel.player2Id : duel.player1Id;
    const isCurrentPlayer1 = duel.currentTurn === 1;
    const currentPlayerField = isCurrentPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isCurrentPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    const jinzoOnField = this.isJinzoOnField(duel);

    // Verificar se o oponente tem "Drop Off" set (face-down) e ativar automaticamente
    // Mas só se Jinzo NÃO estiver no campo
    if (!jinzoOnField && opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
      for (let i = 0; i < opponentField.spellTrap.length; i++) {
        const trap = opponentField.spellTrap[i];
        if (trap && trap !== null) {
          const trapName = (trap.name || '').toLowerCase().trim();
          const trapPosition = trap.position || 'set';

          // Verificar se é "Drop Off" pelo nome (não pelo idCarta, que pode variar)
          // Aceitar variações: "Drop Off", "DropOff", "drop off", etc.
          const isDropOff = trapName === 'drop off' || trapName === 'dropoff' || trapName.includes('drop off');

          if (isDropOff && trapPosition === 'set') {
            // Ativar automaticamente (virar face-up)
            trap.position = 'face-up';
            logger.info(`✨ [processDrawPhase] Drop Off ativada automaticamente na zona ${i} do oponente antes da compra de carta`);

            // Atualizar no banco antes de comprar a carta
            await this.updateDuelInDatabase(duelIdStr, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);

            // Buscar duelo atualizado após ativar a trap para garantir que drawCard veja a trap ativada
            const updatedDuelAfterTrap = await this.findDuelByIdFromDatabase(duelIdStr);
            if (updatedDuelAfterTrap) {
              duel = updatedDuelAfterTrap;
              // Atualizar referências dos campos após buscar do banco
              const updatedCurrentPlayerField = isCurrentPlayer1 ? (updatedDuelAfterTrap as any).player1Field : (updatedDuelAfterTrap as any).player2Field;
              const updatedOpponentField = isCurrentPlayer1 ? (updatedDuelAfterTrap as any).player2Field : (updatedDuelAfterTrap as any).player1Field;
              if (updatedCurrentPlayerField) {
                (duel as any)[isCurrentPlayer1 ? 'player1Field' : 'player2Field'] = updatedCurrentPlayerField;
              }
              if (updatedOpponentField) {
                (duel as any)[isCurrentPlayer1 ? 'player2Field' : 'player1Field'] = updatedOpponentField;
              }
            }
            break;
          }
        }
      }
    } else if (jinzoOnField) {
      logger.info(`🤖 [processDrawPhase] Jinzo está no campo - Drop Off não pode ser ativada`);
    }

    // Comprar uma carta para o jogador do turno atual
    logger.debug(`🔄 [processDrawPhase] Comprando carta para player ${currentPlayerId}...`);
    await this.drawCard(duelId, currentPlayerId);

    // Buscar o duelo atualizado após comprar a carta - SEMPRE do banco para garantir dados atualizados
    let updatedDuel: Duel | null = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!updatedDuel) {
      updatedDuel = this.activeDuels.get(duelIdStr) || null;
      if (!updatedDuel) {
        logger.warn(`⚠️ [processDrawPhase] Não foi possível buscar duelo atualizado após comprar carta`);
        return null;
      }
    }

    if (updatedDuel.status === DuelStatus.FINISHED) {
      logger.info(`🏁 [processDrawPhase] Duelo encerrado (deck vazio na compra obrigatória)`);
      this.activeDuels.set(duelIdStr, updatedDuel);
      return updatedDuel;
    }

    logger.debug(`✅ [processDrawPhase] Carta comprada com sucesso`);

    logger.debug(`🔄 [processDrawPhase] Duelo atualizado encontrado. Fase atual: ${updatedDuel.currentPhase}, turnCounter: ${(updatedDuel as any).turnCounter}, currentTurn: ${updatedDuel.currentTurn}`);

    // Regra Yu-Gi-Oh!: só no primeiro turno de quem COMEÇOU o duelo: na DP compra e pula para MP2 (sem STANDBY, MP1, BP).
    // Roubo de turno anula essa regra para todo o duelo; com turnCounter===1 outro assento também vai para STANDBY após a compra.
    const turnCounter = (updatedDuel as any).turnCounter;
    const turnCounterNum = turnCounter != null && turnCounter !== undefined ? Number(turnCounter) : 1;
    const firstSeat = this.getFirstTurnPlayerSeat(updatedDuel);
    const voided = this.hasStarterFirstTurnRulesVoided(updatedDuel);
    const isStartingPlayersFirstTurnDraw =
      !voided &&
      (firstSeat != null
        ? turnCounterNum === 1 && updatedDuel.currentTurn === firstSeat
        : turnCounterNum === 1 || (turnCounter == null && updatedDuel.currentPhase === TurnPhase.DRAW));
    if (isStartingPlayersFirstTurnDraw) {
      updatedDuel.currentPhase = TurnPhase.MAIN2;
      logger.info(`✅ [processDrawPhase] Primeiro turno de quem começou (assento ${firstSeat ?? 'legacy'}, jogador atual ${updatedDuel.currentTurn}): DP → MAIN2`);
    } else {
      // Demais turnos (ou quem roubou o turno no turnCounter 1): após DRAW vai para STANDBY
      updatedDuel.currentPhase = TurnPhase.STANDBY;
      logger.debug(`✅ [processDrawPhase] Fase DRAW processada, avançando para STANDBY`);
    }

    // Garantir que o duelo atualizado está no cache
    this.activeDuels.set(duelIdStr, updatedDuel);

    // Atualizar no banco de dados
      await this.updateDuelInDatabase(duelId, {
      currentPhase: updatedDuel.currentPhase,
      player1Field: (updatedDuel as any).player1Field,
      player2Field: (updatedDuel as any).player2Field,
      } as any);

    logger.debug(`✅ [processDrawPhase] Duelo atualizado no banco. Retornando duelo atualizado.`);

    // Retornar o duelo atualizado para que o gateway possa emitir duelUpdate
    return updatedDuel;
  }

  /**
   * Verifica e ativa Trap Hole do oponente se as condições forem atendidas
   * Condições: oponente tem Trap Hole setada E monstro tem 1000+ de ataque
   * Retorna true se o monstro foi destruído, false caso contrário
   */
  private async checkAndActivateTrapHole(duelId: string | number, duel: Duel, isPlayer1: boolean, monsterZoneIndex: number, monster: any): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateTrapHole', this, [duelId, duel, isPlayer1, monsterZoneIndex, monster]);
  }

  /**
   * Verifica e ativa Bottomless Trap Hole do oponente se as condições forem atendidas
   * Quando seu oponente Invocar um ou mais monstros com 1500 ou mais de ATK: destrua esse(s) monstro(s) e bana-o(s).
   * Retorna true se o monstro foi destruído e banido, false caso contrário
   */
  private async checkAndActivateBottomlessTrapHole(duelId: string | number, duel: Duel, isPlayer1: boolean, monsterZoneIndex: number, monster: any): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateBottomlessTrapHole', this, [duelId, duel, isPlayer1, monsterZoneIndex, monster]);
  }

  /**
   * Verifica apenas Bottomless Trap Hole do oponente após invocação especial (ou qualquer invocação que não seja normal/flip).
   * Bottomless: quando um monstro é invocado (qualquer tipo) ou virado com 1500+ ATK → destruir e banir.
   * Não verifica Trap Hole aqui (Trap Hole só em invocação normal ou flip com 1000+ ATK).
   * @returns true se o monstro foi destruído/banido
   */
  async checkTrapsOnMonsterSummon(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    zoneIndex: number,
    monster: any,
    position: 'attack' | 'defense',
  ): Promise<boolean> {
    if (!monster) return false;
    const monsterAtk = monster.atk || 0;
    if (monsterAtk >= 1500) {
      return await this.checkAndActivateBottomlessTrapHole(duelId, duel, isPlayer1, zoneIndex, monster);
    }
    return false;
  }

  private async checkAndActivateSakuretsuArmor(duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number, attacker: any): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateSakuretsuArmor', this, [duelId, duel, isPlayer1, attackerZoneIndex, attacker]);
  }

  private async checkAndActivateMagicCylinder(duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number, attacker: any): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateMagicCylinder', this, [duelId, duel, isPlayer1, attackerZoneIndex, attacker]);
  }

  private async checkAndActivateNegateAttack(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number,
    attacker: any,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateNegateAttack', this, [duelId, duel, isPlayer1, attackerZoneIndex, attacker]);
  }

  private async checkAndActivateHeroBarrier(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    attackerZoneIndex: number,
    attacker: any,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateHeroBarrier', this, [duelId, duel, isPlayer1, attackerZoneIndex, attacker]);
  }

  /**
   * Ring of Destruction (set): quando o defensor iria sofrer dano de batalha nos LP,
   * ativa automaticamente e escolhe o monstro atacante como alvo (destrói e causa dano aos dois duelistas).
   * isPlayer1 = jogador que está atacando.
   */
  private async checkAndActivateRingOfDestruction(duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number, attacker: any,): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateRingOfDestruction', this, [duelId, duel, isPlayer1, attackerZoneIndex, attacker]);
  }

  /**
   * Verifica se Jinzo está no campo (de qualquer jogador)
   * Jinzo nega todos os efeitos de Trap Cards
   */
  /**
   * Verifica se uma carta tem exatamente o idCarta especificado
   * Usa comparação exata (case-insensitive) para evitar falsos positivos
   */
  // Delegar para DuelUtilsService
  isExactCard(card: any, exactIdCarta: string): boolean {
    return this.duelUtils.isExactCard(card, exactIdCarta);
  }

  /**
   * Busca uma carta em um array usando instanceId (prioritário) ou idCarta/id/cardId
   * Isso permite distinguir múltiplas cópias da mesma carta no duelo
   * Delegado para DuelUtilsService
   */
  findCardInArray(cards: any[], searchCriteria: { instanceId?: string; idCarta?: string; id?: string; cardId?: string; cardName?: string }, preferSameName: boolean = false): any | null {
    return this.duelUtils.findCardInArray(cards, searchCriteria, preferSameName);
  }

  /**
   * Verifica se duas cartas têm o mesmo nome (normalizado)
   */
  areCardsSameByName(card1: any, card2: any): boolean {
    return this.duelUtils.areCardsSameByName(card1, card2);
  }

  /**
   * Normaliza o nome de uma carta para comparação
   */
  normalizeCardName(card: any): string {
    return this.duelUtils.normalizeCardName(card);
  }

  /**
   * Retorna o campo (player1Field ou player2Field) do DONO ORIGINAL do monstro.
   * Quando um monstro é destruído ou banido, deve ir para o cemitério/zona de banidos do dono,
   * não do controlador atual (ex.: monstro controlado por Change of Heart vai para o cemitério do oponente).
   * @param duel - Duelo
   * @param monster - Carta monstro (pode ter originalOwner: 1 | 2)
   * @param controllerIsPlayer1 - true se quem controla o monstro atualmente é Player1
   */
  private getOwnerFieldForMonster(duel: Duel, monster: any, controllerIsPlayer1: boolean): any {
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;
    const ownerNum = monster?.originalOwner ?? (controllerIsPlayer1 ? 1 : 2);
    return ownerNum === 1 ? player1Field : player2Field;
  }

  /**
   * Envia monstro que sai do campo para GY ou banished (Dark Magician of Chaos).
   * @param destroyedByBattleBy - atacante que destruiu em batalha (se aplicável)
   */
  sendMonsterLeavingField(
    duel: Duel,
    monster: any,
    controllerIsPlayer1: boolean,
    opts?: { destroyedByBattleBy?: any },
  ): 'banished' | 'graveyard' {
    const ownerField = this.getOwnerFieldForMonster(duel, monster, controllerIsPlayer1);
    const destination = Dmoc.sendMonsterOffField(ownerField, monster, opts);

    // Archfiend of Gilfer trigger: if sent to GY
    if (destination === 'graveyard' && ArchfiendOfGilfer.isArchfiendOfGilfer(monster)) {
      logger.info(`👹 [Archfiend of Gilfer] Monster sent to GY - marking for trigger check`);
      // Store for async trigger after database update
      if (!ownerField.gilferTriggerPending) {
        ownerField.gilferTriggerPending = [];
      }
      ownerField.gilferTriggerPending.push({
        monsterName: monster.name || monster.cardName,
        instanceId: monster.instanceId,
      });
    }

    return destination;
  }

  /**
   * Check and trigger Archfiend of Gilfer equip effect when it enters GY.
   * @returns true if pending choice was created
   */
  async tryStartArchfiendOfGilferEquip(
    duelId: string | number,
    duel: Duel,
    ownerIsPlayer1: boolean,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartArchfiendOfGilferEquip', this, [duelId, duel, ownerIsPlayer1]);
  }

  /**
   * End Phase: se DMoC foi invocado neste turno e há Magia no GY, cria pendingChoice.
   * @returns true se o fluxo do turno deve pausar aguardando escolha
   */
  async tryStartDarkMagicianOfChaosEndPhase(
    duelId: string | number,
    duel: Duel,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartDarkMagicianOfChaosEndPhase', this, [duelId, duel]);
  }

  async processDarkMagicianOfChaosEndPhaseChoice(
    duelId: string | number,
    userId: number,
    graveyardIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processDarkMagicianOfChaosEndPhaseChoice', this, [duelId, userId, graveyardIndex]);
  }

  async skipDarkMagicianOfChaosEndPhase(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipDarkMagicianOfChaosEndPhase', this, [duelId, userId]);
  }

  /** Continua End Phase (Swords / troca de turno) após escolha ou skip do DMoC. */
  private async finishEndPhaseAfterDmoc(duelId: string | number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr) || (await this.findDuelByIdFromDatabase(duelIdStr));
    if (!duel) return;

    const duelForCheck = await this.findDuelByIdFromDatabase(duelIdStr) || duel;
    await this.checkAndDestroySwordsOfRevealingLight(duelId, duelForCheck);
    const updated = await this.findDuelByIdFromDatabase(duelIdStr);
    if (updated) duel = updated;

    const advanceResult = await this.advanceToNextTurn(duelId);
    if (advanceResult?.duel) {
      this.activeDuels.set(duelIdStr, advanceResult.duel);
    }
  }

  /**
   * Magician's Rod — efeito 1 (após Invocação-Normal face-up).
   * Retorna true se criou pendingChoice MAGICIAN_S_ROD_SEARCH.
   */
  async tryStartMagiciansRodSearch(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    zoneIndex: number,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartMagiciansRodSearch', this, [duelId, duel, isPlayer1, zoneIndex]);
  }

  async processMagiciansRodSearchChoice(
    duelId: string | number,
    userId: number,
    deckIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processMagiciansRodSearchChoice', this, [duelId, userId, deckIndex]);
  }

  async skipMagiciansRodSearch(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipMagiciansRodSearch', this, [duelId, userId]);
  }

  /**
   * Magician's Rod — efeito 2 (GY no turno do oponente após você ativar Magia/Armadilha).
   * rodOwnerIsPlayer1 = dono do Rod no GY (quem ativou a S/T).
   */
  async tryStartMagiciansRodGyRecycle(
    duelId: string | number,
    duel: Duel,
    rodOwnerIsPlayer1: boolean,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartMagiciansRodGyRecycle', this, [duelId, duel, rodOwnerIsPlayer1]);
  }

  async processMagiciansRodGyChoice(
    duelId: string | number,
    userId: number,
    tributeZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processMagiciansRodGyChoice', this, [duelId, userId, tributeZoneIndex]);
  }

  async skipMagiciansRodGy(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipMagiciansRodGy', this, [duelId, userId]);
  }

  /**
   * Berfomet — efeito de busca ao Normal/Flip Summon
   */
  async tryStartBerfometSearch(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    zoneIndex: number,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartBerfometSearch', this, [duelId, duel, isPlayer1, zoneIndex]);
  }

  async processBerfometSearchChoice(
    duelId: string | number,
    userId: number,
    deckIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processBerfometSearchChoice', this, [duelId, userId, deckIndex]);
  }

  async skipBerfometSearch(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipBerfometSearch', this, [duelId, userId]);
  }

  /**
   * King's Knight: When Normal Summoned while you control Queen's Knight:
   * You can Special Summon 1 Jack's Knight from your Deck.
   */
  async tryStartKingsKnightSearch(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    zoneIndex: number,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartKingsKnightSearch', this, [duelId, duel, isPlayer1, zoneIndex]);
  }

  async processKingsKnightSearchChoice(
    duelId: string | number,
    userId: number,
    deckIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processKingsKnightSearchChoice', this, [duelId, userId, deckIndex]);
  }

  async skipKingsKnightSearch(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipKingsKnightSearch', this, [duelId, userId]);
  }

  /**
   * Electromagnetic Turtle — Quick Effect durante Battle Phase do oponente
   */
  async activateElectromagneticTurtle(
    duelId: string | number,
    userId: number,
    graveyardIndex?: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('activateElectromagneticTurtle', this, [duelId, userId, graveyardIndex]);
  }

  isElectromagneticTurtle(card: any): boolean {
    if (!card) return false;
    const id = String(card.idCarta || card.id || card.cardId || '').toLowerCase();
    const name = String(card.name || card.cardName || '').toLowerCase();
    return (
      id.includes('electromagneticturtle') ||
      id.includes('34710660') ||
      name.includes('electromagnetic turtle') ||
      name.includes('tartaruga eletromagn')
    );
  }

  /**
   * Após ativar Magia/Armadilha no turno do oponente: oferece Rod do GY agora,
   * ou agenda para depois se já houver pendingChoice (ex.: MST pedindo alvo).
   */
  async queueOrStartMagiciansRodGy(
    duelId: string | number,
    duel: Duel,
    activatorUserId: number,
  ): Promise<boolean> {
    const isPlayer1 = Number(duel.player1Id) === Number(activatorUserId);
    const isActivatorsTurn =
      (duel.currentTurn === 1 && isPlayer1) || (duel.currentTurn === 2 && !isPlayer1);
    if (isActivatorsTurn) return false;

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField) return false;

    if ((duel as any).pendingChoice) {
      playerField.magiciansRodGyCheckPending = true;
      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);
      this.activeDuels.set(typeof duelId === 'string' ? duelId : duelId.toString(), duel);
      logger.info(`🪄 [Magician's Rod] GY check agendado (pendingChoice ativo)`);
      return false;
    }

    return this.tryStartMagiciansRodGyRecycle(duelId, duel, isPlayer1);
  }

  /** Após limpar pendingChoice de outra carta — oferecer Rod se estava agendado. */
  /**
   * Magician's Salvation — ao ativar: opcionalmente Baixar Eternal Soul do Deck.
   */
  async tryStartMagiciansSalvationEternalSoul(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartMagiciansSalvationEternalSoul', this, [duelId, duel, isPlayer1]);
  }

  async processMagiciansSalvationEternalSoulChoice(
    duelId: string | number,
    userId: number,
    deckIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processMagiciansSalvationEternalSoulChoice', this, [duelId, userId, deckIndex]);
  }

  async skipMagiciansSalvationEternalSoul(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipMagiciansSalvationEternalSoul', this, [duelId, userId]);
  }

  /**
   * Magician's Salvation — após NS/SS de DM ou DMG: SS do GY o outro nome.
   */
  async tryStartMagiciansSalvationPairEffect(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
    summonedZoneIndex: number,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('tryStartMagiciansSalvationPairEffect', this, [duelId, duel, isPlayer1, summonedZoneIndex]);
  }

  async processMagiciansSalvationPairChoice(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processMagiciansSalvationPairChoice', this, [duelId, userId]);
  }

  async skipMagiciansSalvationPair(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipMagiciansSalvationPair', this, [duelId, userId]);
  }

  async flushMagiciansRodGyCheck(duelId: string | number): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr) || (await this.findDuelByIdFromDatabase(duelIdStr));
    if (!duel || (duel as any).pendingChoice) return false;

    for (const isP1 of [true, false]) {
      const field = isP1 ? (duel as any).player1Field : (duel as any).player2Field;
      if (!field?.magiciansRodGyCheckPending) continue;
      field.magiciansRodGyCheckPending = false;
      const started = await this.tryStartMagiciansRodGyRecycle(duelId, duel, isP1);
      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
        pendingChoice: (duel as any).pendingChoice || null,
      } as any);
      this.activeDuels.set(duelIdStr, duel);
      if (started) return true;
    }
    return false;
  }

  isJinzoOnField(duel: Duel): boolean {
    return this.duelUtils.isJinzoOnField(duel);
  }


  /**
   * Verifica se MirageDragon está no campo do oponente durante a Fase de Batalha
   * MirageDragon impede que o oponente ative traps durante a Fase de Batalha
   * @param duel - Duelo atual
   * @param isPlayer1 - Se o jogador que está tentando ativar a trap é Player1
   * @returns true se MirageDragon está no campo do oponente e estamos na Fase de Batalha
   */
  isMirageDragonBlockingTraps(duel: Duel, isPlayer1: boolean): boolean {
    return this.duelUtils.isMirageDragonBlockingTraps(duel, isPlayer1);
  }


  /**
   * Verifica e ativa Mirror Force do oponente se as condições forem atendidas
   * Condições: oponente tem Mirror Force setada E um monstro está atacando
   * Destrói todos os monstros do atacante que estão em modo de ataque
   * Retorna true se Mirror Force foi ativada, false caso contrário
   */
  /**
   * Verifica e ativa Defense Draw durante o cálculo de dano de batalha
   * Retorna true se Defense Draw foi ativada e o dano foi prevenido
   */
  private async checkAndActivateDefenseDraw(duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, damageAmount: number): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateDefenseDraw', this, [duelId, duel, isAttackerPlayer1, damageAmount]);
  }

  /** Kuriboh: descarta da mão do defensor; previne dano de batalha dessa batalha. */
  private async checkAndActivateKuriboh(
    duelId: string | number,
    duel: Duel,
    isAttackerPlayer1: boolean,
    damageAmount: number,
  ): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateKuriboh', this, [duelId, duel, isAttackerPlayer1, damageAmount]);
  }

  /**
   * Defense Draw e/ou Kuriboh durante o cálculo de dano (só o defensor).
   * Retorna o dano efetivo após prevenção (0 se algum ativou).
   */
  private async applyBattleDamagePreventionForDefender(
    duelId: string | number,
    duel: Duel,
    isAttackerPlayer1: boolean,
    damageAmount: number,
  ): Promise<number> {
    if (damageAmount <= 0) return 0;
    if (await this.checkAndActivateDefenseDraw(duelId, duel, isAttackerPlayer1, damageAmount)) {
      return 0;
    }
    if (await this.checkAndActivateKuriboh(duelId, duel, isAttackerPlayer1, damageAmount)) {
      return 0;
    }
    return damageAmount;
  }

  private async checkAndActivateMirrorForce(duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateMirrorForce', this, [duelId, duel, isPlayer1]);
  }

  /**
   * Verifica e ativa Dimensional Prison do oponente se as condições forem atendidas
   * Condições: oponente tem Dimensional Prison setada E um monstro está atacando
   * Bane o monstro atacante (remove do campo e envia para a zona de banidos)
   * Retorna true se Dimensional Prison foi ativada, false caso contrário
   */
  private async checkAndActivateDimensionalPrison(duelId: string | number, duel: Duel, isPlayer1: boolean, attackerZoneIndex: number): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateDimensionalPrison', this, [duelId, duel, isPlayer1, attackerZoneIndex]);
  }

  /**
   * Verifica e ativa Waboku do oponente se as condições forem atendidas
   * Condições: oponente tem Waboku setada E um monstro está atacando
   * Waboku previne dano de batalha e destruição de monstros em batalha neste turno
   * Retorna true se Waboku foi ativada, false caso contrário
   */
  private async checkAndActivateWaboku(duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<boolean> {
    return this.cardEffectsService.executeAction('checkAndActivateWaboku', this, [duelId, duel, isPlayer1]);
  }

  /**
   * Verifica e destrói SwordsOfRevealingLight na Fase Final do 3º turno do oponente após ativação
   */
  private async checkAndDestroySwordsOfRevealingLight(duelId: string | number, duel: Duel): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const currentTurnCounter = duel.turnCounter || 1;
    const currentTurn = duel.currentTurn; // 1 = Player1, 2 = Player2

    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;

    // Verificar SwordsOfRevealingLight no campo do Player1
    if (player1Field && player1Field.spellTrap && Array.isArray(player1Field.spellTrap)) {
      for (let i = 0; i < player1Field.spellTrap.length; i++) {
        const spellTrap = player1Field.spellTrap[i];
        if (spellTrap && spellTrap !== null && spellTrap.position === 'face-up') {
          const cardId = spellTrap.idCarta || spellTrap.id || spellTrap.cardId;
          const cardName = (spellTrap.name || spellTrap.cardName || '').toLowerCase();
          const isSwords = this.duelUtils.isSwordsOfRevealingLight(spellTrap);

          if (isSwords && spellTrap.activationTurnCounter && spellTrap.activatedByPlayer1 !== undefined) {
            // Foi ativada pelo Player1, então deve ser destruída no 3º turno do Player2
            // Turno do oponente = turno diferente de quem ativou
            // Se ativou no turnCounter X, deve destruir quando:
            // - Estamos no turno do oponente (currentTurn !== activationTurn)
            // - Passaram 3 turnos do oponente desde a ativação
            const activationTurnCounter = spellTrap.activationTurnCounter;
            const activationTurn = spellTrap.activationTurn; // 1 ou 2
            const activatedByPlayer1 = spellTrap.activatedByPlayer1;

            // O oponente é quem não ativou
            const opponentTurn = activatedByPlayer1 ? 2 : 1;

            // Verificar se estamos no turno do oponente na fase END
            if (currentTurn === opponentTurn && duel.currentPhase === TurnPhase.END) {
              // Contar quantos turnos do oponente passaram desde a ativação
              const turnsSinceActivation = currentTurnCounter - activationTurnCounter;
              const activationTurn = spellTrap.activationTurn; // 1 ou 2
              const activatedInOpponentTurn = activationTurn === opponentTurn;

              // Calcular turnos do oponente usando a mesma lógica do bloqueio de ataques
              let opponentTurnsSinceActivation: number;
              if (activatedInOpponentTurn) {
                // Ativou no turno do oponente, então só conta a partir do próximo turno do oponente
                opponentTurnsSinceActivation = Math.floor((turnsSinceActivation) / 2);
              } else {
                // Ativou no turno do outro jogador, então o próximo turno já é do oponente
                opponentTurnsSinceActivation = Math.floor((turnsSinceActivation) / 2) + 1;
              }

              // Destruir após 3 turnos do oponente (no final do 3º turno)
              if (opponentTurnsSinceActivation >= 3) {
                logger.info(`🗡️ [checkAndDestroySwordsOfRevealingLight] Destruindo SwordsOfRevealingLight - ativada no turnCounter ${activationTurnCounter}, atual: ${currentTurnCounter}, turnos do oponente desde ativação: ${opponentTurnsSinceActivation}/3`);

                // Mover para o cemitério
                if (!player1Field.graveyard) {
                  player1Field.graveyard = [];
                }
                player1Field.graveyard.push(spellTrap);
                player1Field.spellTrap[i] = null;

                // Atualizar no banco
                await this.updateDuelInDatabase(duelIdStr, {
                  player1Field: player1Field,
                  player2Field: player2Field,
                } as any);

                // Atualizar cache
                this.activeDuels.set(duelIdStr, duel);

                logger.info(`✅ [checkAndDestroySwordsOfRevealingLight] SwordsOfRevealingLight movida para o cemitério após 3 turnos do oponente`);
              } else {
                logger.info(`ℹ️ [checkAndDestroySwordsOfRevealingLight] SwordsOfRevealingLight ainda ativa - ${opponentTurnsSinceActivation}/3 turnos do oponente passaram`);
              }
            }
          }
        }
      }
    }

    // Verificar SwordsOfRevealingLight no campo do Player2
    if (player2Field && player2Field.spellTrap && Array.isArray(player2Field.spellTrap)) {
      for (let i = 0; i < player2Field.spellTrap.length; i++) {
        const spellTrap = player2Field.spellTrap[i];
        if (spellTrap && spellTrap !== null && spellTrap.position === 'face-up') {
          const cardId = spellTrap.idCarta || spellTrap.id || spellTrap.cardId;
          const cardName = (spellTrap.name || spellTrap.cardName || '').toLowerCase();
          const isSwords = this.duelUtils.isSwordsOfRevealingLight(spellTrap);

          if (isSwords && spellTrap.activationTurnCounter && spellTrap.activatedByPlayer1 !== undefined) {
            const activationTurnCounter = spellTrap.activationTurnCounter;
            const activationTurn = spellTrap.activationTurn;
            const activatedByPlayer1 = spellTrap.activatedByPlayer1;
            const opponentTurn = activatedByPlayer1 ? 2 : 1;

            if (currentTurn === opponentTurn && duel.currentPhase === TurnPhase.END) {
              // Contar quantos turnos do oponente passaram desde a ativação
              const turnsSinceActivation = currentTurnCounter - activationTurnCounter;
              const activationTurn = spellTrap.activationTurn; // 1 ou 2
              const activatedInOpponentTurn = activationTurn === opponentTurn;

              // Calcular turnos do oponente usando a mesma lógica do bloqueio de ataques
              let opponentTurnsSinceActivation: number;
              if (activatedInOpponentTurn) {
                // Ativou no turno do oponente, então só conta a partir do próximo turno do oponente
                opponentTurnsSinceActivation = Math.floor((turnsSinceActivation) / 2);
              } else {
                // Ativou no turno do outro jogador, então o próximo turno já é do oponente
                opponentTurnsSinceActivation = Math.floor((turnsSinceActivation) / 2) + 1;
              }

              // Destruir após 3 turnos do oponente (no final do 3º turno)
              if (opponentTurnsSinceActivation >= 3) {
                logger.info(`🗡️ [checkAndDestroySwordsOfRevealingLight] Destruindo SwordsOfRevealingLight - ativada no turnCounter ${activationTurnCounter}, atual: ${currentTurnCounter}, turnos do oponente desde ativação: ${opponentTurnsSinceActivation}/3`);

                // Mover para o cemitério
                if (!player2Field.graveyard) {
                  player2Field.graveyard = [];
                }
                player2Field.graveyard.push(spellTrap);
                player2Field.spellTrap[i] = null;

                // Atualizar no banco
                await this.updateDuelInDatabase(duelIdStr, {
                  player1Field: player1Field,
                  player2Field: player2Field,
                } as any);

                // Atualizar cache
                this.activeDuels.set(duelIdStr, duel);

                logger.info(`✅ [checkAndDestroySwordsOfRevealingLight] SwordsOfRevealingLight movida para o cemitério após 3 turnos do oponente`);
              } else {
                logger.info(`ℹ️ [checkAndDestroySwordsOfRevealingLight] SwordsOfRevealingLight ainda ativa - ${opponentTurnsSinceActivation}/3 turnos do oponente passaram`);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Invoca um monstro normalmente (nível 4 ou menos sem tributo, nível 5-6 com 1 tributo, nível 7+ com 2 tributos)
   * Valida se o jogador ainda tem direito a invocação normal neste turno
   */
  async normalSummonMonster(duelId: string | number, userId: number, cardId: string, zoneIndex: number, position: 'attack' | 'defense' | 'set', tributeZoneIndices?: number[]): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Memória é fonte da verdade do campo (debounce). Recarregar do DB aqui
    // apagava sets/magias jogados no mesmo turno pelo bot ou jogador.
    let duel: Duel | null = this.activeDuels.get(duelIdStr) || null;

    try {
      if (!duel) {
        logger.info(`🔍 [normalSummonMonster] Sem cache — buscando duelo do banco...`);
        duel = await this.duelsRepository
          .createQueryBuilder('duel')
          .leftJoinAndSelect('duel.player1', 'player1')
          .leftJoinAndSelect('duel.player2', 'player2')
          .where('duel.id = :id', { id: duelIdStr })
          .getOne();

        if (!duel) {
          logger.error(`❌ [normalSummonMonster] Duelo ${duelIdStr} não encontrado no banco`);
          return { success: false, message: 'Duelo não encontrado' };
        }
        this.activeDuels.set(duelIdStr, duel);
      } else {
        logger.info(`✅ [normalSummonMonster] Usando duelo em memória (evita rollback de campo)`);
      }

      logger.info(`✅ [normalSummonMonster] Duelo ok - player1Id: ${duel.player1Id}, player2Id: ${duel.player2Id}, currentTurn: ${duel.currentTurn}`);
    } catch (error) {
      logger.error(`❌ [normalSummonMonster] Erro ao buscar duelo:`, error);
      return { success: false, message: 'Erro ao buscar duelo' };
    }

    // Verificar se é o turno do jogador e está na fase MAIN1 ou MAIN2
    // Garantir que os tipos sejam consistentes (number)
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    logger.info(`🔍 [normalSummonMonster] Validação de turno - userId: ${userId} (${typeof userId}), player1Id: ${duel.player1Id} (${typeof duel.player1Id}) -> ${player1IdNum}, player2Id: ${duel.player2Id} (${typeof duel.player2Id}) -> ${player2IdNum}, currentTurn: ${duel.currentTurn}, isPlayer1: ${isPlayer1}, isCurrentTurn: ${isCurrentTurn}`);

    if (!isCurrentTurn) {
      logger.error(`❌ [normalSummonMonster] Não é o turno do jogador! userId: ${userId}, currentTurn: ${duel.currentTurn}, isPlayer1: ${isPlayer1}`);
      return { success: false, message: 'Não é seu turno' };
    }

    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode invocar monstros nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.hand) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Verificar se já fez invocação normal neste turno (Double Summon: +1 invocação extra)
    if (playerField.normalSummonUsed === true) {
      const bonus =
        typeof playerField.bonusNormalSummonsRemaining === 'number'
          ? playerField.bonusNormalSummonsRemaining
          : 0;
      if (bonus > 0) {
        playerField.bonusNormalSummonsRemaining = bonus - 1;
        logger.info(
          `✨ [normalSummonMonster] Invocação normal extra (Double Summon). Restam ${playerField.bonusNormalSummonsRemaining} bônus`,
        );
      } else {
        return { success: false, message: 'Você já usou sua invocação normal neste turno' };
      }
    }

    // Buscar a carta na mão - cartas com mesmo nome são tratadas como iguais
    let cardIndex = playerField.hand.findIndex((c: any) => {
      if (!c) return false;
      // Comparar por nome primeiro
      const cName = (c.name || c.cardName || '').trim().toLowerCase();
      const searchName = String(cardId).trim().toLowerCase();
      if (cName && cName === searchName) {
        return true;
      }
      // Comparar por idCarta/id/cardId
      return c.idCarta === cardId || c.id === cardId || c.cardId === cardId ||
             String(c.idCarta) === String(cardId) || String(c.id) === String(cardId) || String(c.cardId) === String(cardId);
    });
    if (cardIndex === -1) {
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const card = playerField.hand[cardIndex];

    // Verificar se é um monstro
    const isMonster = card.type === 'Monster' || card.cardType === 'Monster';
    if (!isMonster) {
      return { success: false, message: 'Esta carta não é um monstro' };
    }

    // Verificar nível do monstro e tributos necessários
    const cardLevel = card.level || 0;
    const cardIdCarta = card.idCarta || card.id || card.cardId || '';

    // Verificar se é Swift Gaia The Fierce Knight e se é o único card na mão
    const isSwiftGaia = this.isExactCard(card, 'SwiftGaiaTheFierceKnight');
    const isOnlyCardInHand = playerField.hand.length === 1;
    const canSummonWithoutTribute = isSwiftGaia && isOnlyCardInHand;

    let requiredTributes = 0;
    if (cardLevel >= 7) {
      requiredTributes = 2;
    } else if (cardLevel >= 5) {
      requiredTributes = 1;
    }
    // Slifer the Sky Dragon / Obelisk the Tormentor: requer exatamente 3 tributos para invocação normal
    if (this.isSliferTheSkyDragon(card) || this.isObeliskTheTormentor(card)) {
      requiredTributes = 3;
    }

    // Se pode invocar sem tributo (Swift Gaia especial), ignorar necessidade de tributos
    if (canSummonWithoutTribute) {
      requiredTributes = 0;
      logger.info(`✨ [normalSummonMonster] Swift Gaia The Fierce Knight pode ser invocado sem tributo (único card na mão)`);
    }

    // Se precisa de tributo, verificar se foram fornecidos
    if (requiredTributes > 0) {
      if (!tributeZoneIndices || tributeZoneIndices.length !== requiredTributes) {
        return { success: false, message: `Este monstro precisa de ${requiredTributes} tributo(s) para ser invocado` };
      }

      // Verificar se os índices de tributo são válidos e se há monstros nessas zonas
      for (const tributeIndex of tributeZoneIndices) {
        if (tributeIndex < 0 || tributeIndex >= 5) {
          return { success: false, message: 'Índice de tributo inválido' };
        }
        if (!playerField.monsters[tributeIndex] || playerField.monsters[tributeIndex] === null) {
          return { success: false, message: 'Não há monstro na zona selecionada para tributar' };
        }
      }
      // zoneIndex deve ser uma das zonas que serão liberadas pelo tributo (permite invocação por tributo com campo cheio)
      if (!tributeZoneIndices.includes(zoneIndex)) {
        return { success: false, message: 'A zona de colocação deve ser uma das zonas liberadas pelo tributo' };
      }
      // Remover os monstros tributados PRIMEIRO (libera as zonas) para permitir invocação com 5 monstros no campo
      let monsterTributed = false;
      for (const tributeIndex of tributeZoneIndices) {
        const tributedMonster = playerField.monsters[tributeIndex];
        if (tributedMonster) {
          await this.handleEquipmentDestruction(duelId, duel, isPlayer1, tributedMonster);
          playerField.monsters[tributeIndex] = null;
          this.sendMonsterLeavingField(duel, tributedMonster, isPlayer1);
          monsterTributed = true;
        }
      }
      if (monsterTributed && !playerField.monsterDestroyedThisTurn) {
        playerField.monsterDestroyedThisTurn = true;
      }
    } else {
      // Nível 4 ou menos não precisa de tributo
      if (tributeZoneIndices && tributeZoneIndices.length > 0) {
        return { success: false, message: 'Monstros de nível 4 ou menos não precisam de tributo' };
      }
    }

    // Verificar se a zona está ocupada (após remover tributos, a zona de zoneIndex pode ter sido liberada)
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
      return { success: false, message: 'Esta zona de monstro já está ocupada' };
    }

    // Verificar se é uma carta Chaos que não pode ser invocada normalmente (ANTES de remover da mão)
    const isChaosSorcerer = this.isExactCard(card, 'ChaosSorcerer');
    const isChaosEmperorDragon = this.isExactCard(card, 'ChaosEmperorDragon');
    const isBlackLusterSoldier = this.isExactCard(card, 'BlackLusterSoldierEnvoyOfTheBeginning');

    if (isChaosSorcerer || isChaosEmperorDragon || isBlackLusterSoldier) {
      const cardDisplayName = isChaosSorcerer ? 'Chaos Sorcerer' :
                              isChaosEmperorDragon ? 'Chaos Emperor Dragon' :
                              'Black Luster Soldier - Envoy of the Beginning';
      return { success: false, message: `${cardDisplayName} não pode ser invocado por invocação normal. Use invocação especial banindo 1 monstro LIGHT e 1 monstro DARK do cemitério.` };
    }

    // Verificar se é Red-Eyes Darkness Metal Dragon (não pode ser invocado normalmente)
    const isRedEyesDarknessMetalDragon = this.isRedEyesDarknessMetalDragon(card);
    if (isRedEyesDarknessMetalDragon) {
      return { success: false, message: 'Red-Eyes Darkness Metal Dragon não pode ser invocado por invocação normal. Use invocação especial banindo 1 monstro do Tipo Dragão face-up que você controla.' };
    }

    // Verificar se é Dark Armed Dragon (não pode ser invocado normalmente)
    const isDarkArmedDragon = this.isExactCard(card, 'DarkArmedDragon') ||
                              cardIdCarta === 'DarkArmedDragon' ||
                              cardIdCarta === 'darkarmeddragon' ||
                              cardIdCarta === 'Dark-ArmedDragon' ||
                              (card.name || card.cardName || '').toLowerCase().includes('dark armed dragon');
    if (isDarkArmedDragon) {
      return { success: false, message: 'Dark Armed Dragon não pode ser invocado por invocação normal. Use invocação especial da mão quando você tiver exatamente 3 monstros do atributo Dark no seu cemitério.' };
    }

    // Remover carta da mão e colocar no campo PRIMEIRO
    const cardToSummon = playerField.hand.splice(cardIndex, 1)[0];
    // 'defense' e 'set' são a mesma coisa: face-down em defesa
    // Normalizar ambos para 'set'
    const finalPosition = (position === 'defense' || position === 'set') ? 'set' : position;
    if (position === 'defense' || position === 'set') {
      logger.info(`🔄 [normalSummonMonster] Invocando face-down: ${position} -> 'set'`);
    }
    // Adicionar turno de invocação para controlar mudança de posição
    // Usar turnCounter do JSON (prioridade) ou do banco (fallback)
    const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

    playerField.monsters[zoneIndex] = {
      ...cardToSummon,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter, // Rastrear turno GLOBAL de invocação
      summonedByPlayer: duel.currentTurn, // Rastrear qual jogador invocou (1 ou 2)
      positionChangedThisTurn: false, // Inicializar flag
      attackedThisTurn: false, // Inicializar flag de ataque
      attacksThisTurn: 0, // Inicializar contador de ataques
    };

    logger.info(`✅ [normalSummonMonster] Monstro invocado:`, {
      name: cardToSummon.name,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      currentTurnCounter: currentTurnCounter,
      zoneIndex: zoneIndex,
    });

    // Tributos já foram removidos antes (quando requiredTributes > 0) para permitir invocação com campo cheio

    // Marcar que já usou invocação normal neste turno
    playerField.normalSummonUsed = true;

    // Breaker the Magical Warrior: ao ser invocado por invocação normal ganha +300 ATK.
    // Pode usar o efeito em qualquer turno (não só no turno da invocação): escolher 1 Spell/Trap no campo e destruí-la; ao usar o efeito perde os 300 de ATK.
    const isBreaker = this.isExactCard(cardToSummon, 'BreakerTheMagicalWarrior');
    if (isBreaker) {
      logger.info(`✨ [normalSummonMonster] Breaker The Magical Warrior invocado por invocação normal - +300 ATK (pode usar efeito depois para destruir 1 S/T e perder esse bônus)`);
      if (!playerField.monsters[zoneIndex].spellCounters) {
        playerField.monsters[zoneIndex].spellCounters = 0;
      }
      playerField.monsters[zoneIndex].spellCounters = Math.min(1, (playerField.monsters[zoneIndex].spellCounters || 0) + 1);
      const spellCounters = playerField.monsters[zoneIndex].spellCounters || 0;
      const atkBonus = spellCounters * 300;
      playerField.monsters[zoneIndex].spellCounterBonusAtk = atkBonus;
    }

    // Verificar efeito de Thestalos The Firestorm Monarch (invocado por tributo)
    const thestalosCardId = cardToSummon.idCarta || cardToSummon.id || cardToSummon.cardId || '';
    const isThestalos = this.isExactCard(cardToSummon, 'ThestalosTheFirestormMonarch');

    if (isThestalos && requiredTributes > 0 && tributeZoneIndices && tributeZoneIndices.length > 0) {
      logger.info(`✨ [normalSummonMonster] Thestalos The Firestorm Monarch invocado por tributo - ativando efeito`);

      const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

      // Verificar se o oponente tem cartas na mão
      if (opponentField && opponentField.hand && Array.isArray(opponentField.hand) && opponentField.hand.length > 0) {
        // Selecionar aleatoriamente 1 card da mão do oponente
        const randomIndex = Math.floor(Math.random() * opponentField.hand.length);
        const discardedCard = opponentField.hand.splice(randomIndex, 1)[0];

        logger.info(`💥 [normalSummonMonster] Thestalos: Carta aleatória descartada da mão do oponente: ${discardedCard.name || discardedCard.cardName || 'Desconhecida'}`);

        // Adicionar ao cemitério do oponente
        if (!opponentField.graveyard) {
          opponentField.graveyard = [];
        }
        opponentField.graveyard.push(discardedCard);

        // Verificar se é um Card de Monstro
        const isMonster = discardedCard.type === 'Monster' || discardedCard.cardType === 'Monster';

        if (isMonster) {
          // Calcular dano: Nível original x 100
          const monsterLevel = discardedCard.level || 0;
          const damage = monsterLevel * 100;

          logger.info(`⚡ [normalSummonMonster] Thestalos: Carta descartada é monstro (Nível ${monsterLevel}) - causando ${damage} de dano`);

          // Aplicar dano ao oponente
          if (isPlayer1) {
            duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
            logger.info(`💥 [normalSummonMonster] Thestalos: Player 2 recebeu ${damage} de dano. LP restante: ${duel.player2LifePoints}`);
          } else {
            duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
            logger.info(`💥 [normalSummonMonster] Thestalos: Player 1 recebeu ${damage} de dano. LP restante: ${duel.player1LifePoints}`);
          }

          // Verificar se o oponente perdeu por LP
          if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
            const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
            await this.finishDuel(duelId, duel.player1LifePoints <= 0 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN, winnerId);

            // Atualizar no banco antes de retornar
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
              player1LifePoints: duel.player1LifePoints,
              player2LifePoints: duel.player2LifePoints,
            } as any);

            this.activeDuels.set(duelIdStr, duel);
            return { success: true };
          }
        } else {
          logger.info(`ℹ️ [normalSummonMonster] Thestalos: Carta descartada não é monstro - nenhum dano causado`);
        }
      } else {
        logger.info(`ℹ️ [normalSummonMonster] Thestalos: Oponente não tem cartas na mão - efeito não ativado`);
      }
    }

    // Invocação NORMAL: Bottomless (1500+ ATK) e Trap Hole (1000+ ATK, só em ataque) do oponente
    if (finalPosition === 'attack') {
      const monsterAtk = cardToSummon.atk || 0;
      let bottomlessActivated = false;
      if (monsterAtk >= 1500) {
        bottomlessActivated = await this.checkAndActivateBottomlessTrapHole(duelId, duel, isPlayer1, zoneIndex, cardToSummon);
      }
      if (!bottomlessActivated && monsterAtk >= 1000) {
        await this.checkAndActivateTrapHole(duelId, duel, isPlayer1, zoneIndex, cardToSummon);
      }
    } else if (finalPosition === 'set') {
      const monsterAtk = cardToSummon.atk || 0;
      if (monsterAtk >= 1500) {
        await this.checkAndActivateBottomlessTrapHole(duelId, duel, isPlayer1, zoneIndex, cardToSummon);
      }
    }

    // Slifer the Sky Dragon: oponente do controlador invocou em ataque → -2000 ATK; se ATK ≤ 0, destruir
    if (finalPosition === 'attack') {
      await this.applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, zoneIndex);
    }

    // Garantir que o duelo atualizado está no cache
    this.activeDuels.set(duelIdStr, duel);

    // Atualizar no banco - SEMPRE salvar ambos os campos para manter sincronização
    // Incluir LP se foram modificados (Thestalos)
    const updateData: any = {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    };

    // Se os LP foram modificados (Thestalos), incluir na atualização
    if (isThestalos && requiredTributes > 0 && tributeZoneIndices && tributeZoneIndices.length > 0) {
      updateData.player1LifePoints = duel.player1LifePoints;
      updateData.player2LifePoints = duel.player2LifePoints;
    }

    await this.updateDuelInDatabase(duelId, updateData);

    // Recalcular UnitedWeStand para ambos os jogadores se monstro foi invocado face-up
    // (número de monstros face-up mudou - novo monstro adicionado e/ou monstros tributados removidos)
    if (finalPosition === 'attack' || position === 'defense') {
      // Monstro invocado face-up: recalcular
      await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
    } else if (requiredTributes > 0 && tributeZoneIndices) {
      // Mesmo que invocado face-down, se houve tributos, recalcular (monstros foram removidos)
      await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
    }

    // Magician's Rod: Quando Invocado por Invocação-Normal face-up (neste engine: position attack)
    // Nota: 'defense'/'set' são face-down e não disparam "Normal Summoned"
    if (
      finalPosition === 'attack' &&
      MagiciansRod.isMagiciansRod(playerField?.monsters?.[zoneIndex])
    ) {
      await this.tryStartMagiciansRodSearch(duelId, duel, isPlayer1, zoneIndex);
      // Persistir pendingChoice se criado
      if ((duel as any).pendingChoice?.type === 'MAGICIAN_S_ROD_SEARCH') {
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          pendingChoice: (duel as any).pendingChoice,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
      }
    }

    // Magician's Salvation: NS de Dark Magician / Dark Magician Girl
    if (
      finalPosition === 'attack' &&
      !(duel as any).pendingChoice &&
      MagiciansSalvation.isDarkMagicianOrGirl(playerField?.monsters?.[zoneIndex])
    ) {
      const salvationStarted = await this.tryStartMagiciansSalvationPairEffect(
        duelId,
        duel,
        isPlayer1,
        zoneIndex,
      );
      if (salvationStarted) {
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          pendingChoice: (duel as any).pendingChoice,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
      }
    }

    // Berfomet: When Normal Summoned face-up
    if (
      finalPosition === 'attack' &&
      Berfomet.isBerfomet(playerField?.monsters?.[zoneIndex]) &&
      !(duel as any).pendingChoice
    ) {
      await this.tryStartBerfometSearch(duelId, duel, isPlayer1, zoneIndex);
      // Persistir pendingChoice se criado
      if ((duel as any).pendingChoice?.type === 'BERFOMET_SEARCH') {
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          pendingChoice: (duel as any).pendingChoice,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
      }
    }

    // King's Knight: When Normal Summoned while you control Queen's Knight
    if (
      finalPosition === 'attack' &&
      KingsKnight.isKingsKnight(playerField?.monsters?.[zoneIndex]) &&
      !(duel as any).pendingChoice
    ) {
      await this.tryStartKingsKnightSearch(duelId, duel, isPlayer1, zoneIndex);
      // Persistir pendingChoice se criado
      if ((duel as any).pendingChoice?.type === 'KINGS_KNIGHT_SEARCH') {
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          pendingChoice: (duel as any).pendingChoice,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
      }
    }

    logger.info(`✅ [normalSummonMonster] Player ${isPlayer1 ? 1 : 2} invocou ${cardToSummon.name} (nível ${cardLevel}) em ${position} -> salvo como ${finalPosition}`);

    return { success: true };
  }

  /**
   * Invoca Cyber Dragon por invocação especial da mão
   * Condições: oponente controla pelo menos 1 monstro E jogador não controla nenhum monstro
   * Não conta como invocação normal
   */
  async specialSummonCyberDragon(duelId: string | number, userId: number, cardId: string, zoneIndex: number, position: 'attack' | 'defense'): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Preferir memória para não apagar cartas do mesmo turno ainda no debounce
    let duel =
      this.activeDuels.get(duelIdStr) ||
      (await this.findDuelByIdFromDatabase(duelIdStr, false));
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser invocada em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode invocar Cyber Dragon nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    if (!playerField || !playerField.hand || !opponentField) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Buscar a carta na mão
    const cardIndex = playerField.hand.findIndex((c: any) => {
      const cId = c.idCarta || c.id || c.cardId;
      const cName = (c.name || c.cardName || '').toLowerCase();
      return cId === cardId ||
             String(cId) === String(cardId) ||
             cName === 'cyberdragon' ||
             cName === 'cyber dragon';
    });

    if (cardIndex === -1) {
      return { success: false, message: 'Cyber Dragon não encontrado na mão' };
    }

    const card = playerField.hand[cardIndex];

    // Verificar se é realmente Cyber Dragon
    const cardName = (card.name || card.cardName || '').toLowerCase();
    const cardIdCheck = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
    const isCyberDragon = this.isExactCard(card, 'CyberDragon');

    if (!isCyberDragon) {
      return { success: false, message: 'Esta carta não é Cyber Dragon' };
    }

    // Verificar condições: oponente tem pelo menos 1 monstro
    const opponentMonsters = (opponentField.monsters || []).filter((m: any) => m !== null && m !== undefined);
    if (opponentMonsters.length === 0) {
      return { success: false, message: 'Cyber Dragon só pode ser invocado se o oponente controlar pelo menos um monstro' };
    }

    // Verificar condições: jogador não tem nenhum monstro
    const playerMonsters = (playerField.monsters || []).filter((m: any) => m !== null && m !== undefined);
    if (playerMonsters.length > 0) {
      return { success: false, message: 'Cyber Dragon só pode ser invocado se você não controlar nenhum monstro' };
    }

    // Verificar se a zona está ocupada
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
      return { success: false, message: 'Esta zona de monstro já está ocupada' };
    }

    // Remover carta da mão e colocar no campo
    const cardToSummon = playerField.hand.splice(cardIndex, 1)[0];
    // O jogador escolhe a posição (ataque ou defesa) ao invocar por invocação especial
    const finalPosition = position;

    // Obter turnCounter
    const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

    playerField.monsters[zoneIndex] = {
      ...cardToSummon,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true, // Marcar como invocação especial
    };

    const placedCyber = playerField.monsters[zoneIndex];
    if (placedCyber) {
      const destroyed = await this.checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, zoneIndex, placedCyber, finalPosition as 'attack' | 'defense');
      if (destroyed) {
        this.activeDuels.set(duelIdStr, duel);
        return { success: true };
      }
    }
    if (finalPosition === 'attack') {
      await this.applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, zoneIndex);
    }

    logger.info(`✅ [specialSummonCyberDragon] Cyber Dragon invocado por invocação especial:`, {
      name: cardToSummon.name,
      position: finalPosition,
      zoneIndex: zoneIndex,
      opponentMonsters: opponentMonsters.length,
      playerMonsters: playerMonsters.length,
    });

    // NÃO marcar normalSummonUsed - invocação especial não conta como invocação normal

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return { success: true };
  }

  /**
   * Muda a posição de um monstro no campo (ataque <-> defesa)
   * Só pode mudar no turno seguinte ao da invocação
   */
  async changeMonsterPosition(duelId: string | number, userId: number, zoneIndex: number, newPosition: 'attack' | 'defense'): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Preferir memória — force DB apagava invocações/sets do mesmo turno
    let duel =
      this.activeDuels.get(duelIdStr) ||
      (await this.findDuelByIdFromDatabase(duelIdStr, false));
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    // CRÍTICO: Sincronizar turnCounter do JSON com o banco
    const p1Counter = (duel as any).player1Field?.turnCounter || 0;
    const p2Counter = (duel as any).player2Field?.turnCounter || 0;
    const dbCounter = duel.turnCounter || 0;
    const maxCounter = Math.max(p1Counter, p2Counter, dbCounter, 1);

    // Sincronizar todos para o maior valor
    if ((duel as any).player1Field) {
      (duel as any).player1Field.turnCounter = maxCounter;
    }
    if ((duel as any).player2Field) {
      (duel as any).player2Field.turnCounter = maxCounter;
    }
    duel.turnCounter = maxCounter;

    logger.info(`🔄 [changeMonsterPosition] Sincronizado turnCounter: ${maxCounter} (p1=${p1Counter}, p2=${p2Counter}, db=${dbCounter})`);

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode mudar posição de monstros nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.monsters) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Obter contador global de turnos do JSON (prioridade) ou do banco (fallback)
    const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

    logger.info(`🔍 [changeMonsterPosition] Estado do duelo - turnCounter do JSON: ${playerFieldForCounter?.turnCounter}, turnCounter do banco: ${duel.turnCounter}, currentTurn: ${duel.currentTurn}, currentTurnCounter calculado: ${currentTurnCounter}`);

    // Debug: mostrar todos os monstros no campo
    logger.info(`🔍 [changeMonsterPosition] Monstros no campo do jogador ${isPlayer1 ? 1 : 2}:`,
      playerField.monsters.map((m: any, idx: number) => ({
        index: idx,
        name: m?.name || 'vazio',
        position: m?.position || 'n/a',
        summonedTurnNumber: m?.summonedTurnNumber !== undefined ? m.summonedTurnNumber : 'undefined',
        positionChangedThisTurn: m?.positionChangedThisTurn,
        currentTurnCounter: currentTurnCounter,
      }))
    );

    // Garantir que monsters seja um array de 5 elementos
    if (!Array.isArray(playerField.monsters)) {
      playerField.monsters = [null, null, null, null, null];
    }
    while (playerField.monsters.length < 5) {
      playerField.monsters.push(null);
    }
    playerField.monsters = playerField.monsters.slice(0, 5);

    if (zoneIndex < 0 || zoneIndex >= 5) {
      return { success: false, message: 'Zona inválida' };
    }

    const monster = playerField.monsters[zoneIndex];
    if (!monster) {
      return { success: false, message: 'Não há monstro nesta zona' };
    }

    // Debug: verificar estado do monstro
    logger.info(`🔍 [changeMonsterPosition] Monstro carregado:`, {
      name: monster.name,
      position: monster.position,
      summonedTurnNumber: monster.summonedTurnNumber,
      summonedByPlayer: monster.summonedByPlayer,
      currentTurnCounter: currentTurnCounter,
      currentTurn: duel.currentTurn,
      allKeys: Object.keys(monster)
    });

    // Verificar se o monstro foi invocado no turno atual DO MESMO JOGADOR
    // Regra: Um monstro só pode mudar de posição no PRÓXIMO turno do mesmo jogador que o invocou
    // Exemplo: Player 1 invoca no turno 1 (turnCounter=1), Player 2 joga (turnCounter=2),
    //          Player 1 joga novamente (turnCounter=3) -> PODE mudar posição

    const summonedTurnNumber = monster.summonedTurnNumber;
    const summonedByPlayer = monster.summonedByPlayer;

    logger.info(`🔍 [changeMonsterPosition] Verificando turno de invocação:`);
    logger.info(`   - summonedTurnNumber: ${summonedTurnNumber} (tipo: ${typeof summonedTurnNumber})`);
    logger.info(`   - summonedByPlayer: ${summonedByPlayer} (tipo: ${typeof summonedByPlayer})`);
    logger.info(`   - currentTurnCounter: ${currentTurnCounter} (tipo: ${typeof currentTurnCounter})`);
    logger.info(`   - currentTurn (jogador atual): ${duel.currentTurn}`);
    logger.info(`   - isPlayer1: ${isPlayer1}`);

    // Verificar se foi invocado no turno atual DO MESMO JOGADOR
    // Bloquear apenas se: mesmo jogador E mesmo turno global
    // Regra: monstro invocado por INVOCAÇÃO ESPECIAL pode mudar posição no mesmo turno; invocação normal/set não pode
    const isSpecialSummoned = monster.specialSummoned === true;
    const canChangePositionSameTurn = isSpecialSummoned;

    if (summonedTurnNumber != null && summonedByPlayer != null) {
      const isSamePlayer = (isPlayer1 && summonedByPlayer === 1) || (!isPlayer1 && summonedByPlayer === 2);
      const isSameTurn = summonedTurnNumber === currentTurnCounter;

      logger.info(`   - É o mesmo jogador? ${isSamePlayer}`);
      logger.info(`   - É o mesmo turno global? ${isSameTurn}`);
      logger.info(`   - Foi invocado por invocação especial? ${canChangePositionSameTurn}`);

      if (isSamePlayer && isSameTurn && !canChangePositionSameTurn) {
        logger.info(`❌ [changeMonsterPosition] Bloqueado: monstro foi invocado (normal/set) no turno ${summonedTurnNumber} pelo mesmo jogador (${summonedByPlayer}), turno atual: ${currentTurnCounter}`);
        return { success: false, message: 'Você não pode mudar a posição de um monstro no mesmo turno em que foi invocado (invocação normal/set). Monstros invocados por invocação especial podem mudar.' };
      }

      if (canChangePositionSameTurn) {
        logger.info(`✅ [changeMonsterPosition] Monstro invocado por invocação especial pode mudar posição no mesmo turno`);
      } else {
        const diff = currentTurnCounter - summonedTurnNumber;
        logger.info(`✅ [changeMonsterPosition] Monstro foi invocado no turno ${summonedTurnNumber} pelo jogador ${summonedByPlayer}, turno atual é ${currentTurnCounter} (diferença: ${diff}). PERMITINDO mudança de posição.`);
      }
    } else if (summonedTurnNumber == null) {
      logger.info(`⚠️ [changeMonsterPosition] summonedTurnNumber não definido para ${monster.name}, permitindo mudança (assumindo que foi invocado em turno anterior)`);
    }

    // Verificar se ESTE monstro específico já mudou posição neste turno (cada monstro só pode mudar uma vez por turno)
    // Inicializar o campo se não existir
    if (monster.positionChangedThisTurn === undefined || monster.positionChangedThisTurn === null) {
      monster.positionChangedThisTurn = false;
    }

    logger.info(`🔍 [changeMonsterPosition] Verificando mudança de posição - Player ${isPlayer1 ? 1 : 2}, monster: ${monster.name}, positionChangedThisTurn: ${monster.positionChangedThisTurn}, currentTurn: ${duel.currentTurn}, turnCounter: ${currentTurnCounter}`);

    if (monster.positionChangedThisTurn === true) {
      logger.info(`❌ [changeMonsterPosition] Bloqueado: ${monster.name} já mudou posição neste turno`);
      return { success: false, message: 'Este monstro já teve sua posição alterada neste turno. Cada monstro só pode mudar de posição uma vez por turno.' };
    }

    const currentPosition = monster.position;

    // Se estiver em 'set' (face-down), pode virar para 'defense' (face-up em defesa) ou 'attack' (face-up em ataque)
    if (currentPosition === 'set') {
      // Virar face-down para face-up
      if (newPosition === 'defense') {
        monster.position = 'defense'; // Face-up em defesa
      } else if (newPosition === 'attack') {
        monster.position = 'attack'; // Face-up em ataque
      } else {
        return { success: false, message: 'Posição inválida' };
      }

      // Flip: Bottomless (1500+ ATK, banir) e Trap Hole (1000+ ATK, destruir) do oponente
      const monsterAtk = monster.atk || 0;
      if (monsterAtk >= 1500) {
        const bottomlessActivated = await this.checkAndActivateBottomlessTrapHole(duelId, duel, isPlayer1, zoneIndex, monster);
        if (bottomlessActivated) {
          return { success: true };
        }
      }
      if (monsterAtk >= 1000) {
        const wasDestroyed = await this.checkAndActivateTrapHole(duelId, duel, isPlayer1, zoneIndex, monster);
        if (wasDestroyed) {
          return { success: true };
        }
      }

      // Verificar se é Fiber Jar, SnowmanEater, MorphingJar ou Dekoichi e processar efeito de flip (Dekoichi compra 1 quando flipa)
      const monsterNameOrId = (monster.name || monster.cardName || monster.idCarta || monster.id || monster.cardId || '').toString().toLowerCase();
      const isDekoichi = this.isExactCard(monster, 'DekoichiTheBattlechantedLocomotive') || monsterNameOrId.includes('dekoichi');
      if (this.isExactCard(monster, 'FiberJar') || this.isExactCard(monster, 'SnowmanEater') || this.isExactCard(monster, 'MorphingJar') || isDekoichi) {
        await this.cardEffectsService.processFlipEffect(duelIdStr, duel, isPlayer1, monster, zoneIndex);
      }
    } else if (currentPosition === 'attack' || currentPosition === 'defense') {
      // Mudar entre ataque e defesa (ambos face-up)
      if (newPosition === 'attack') {
        monster.position = 'attack';
      } else if (newPosition === 'defense') {
        monster.position = 'defense';
      } else {
        return { success: false, message: 'Posição inválida' };
      }
    } else {
      return { success: false, message: 'Posição atual do monstro não permite mudança' };
    }

    // Marcar que ESTE monstro específico já mudou posição neste turno (cada monstro só pode mudar uma vez por turno)
    monster.positionChangedThisTurn = true;
    logger.info(`✅ [changeMonsterPosition] Flag positionChangedThisTurn marcada para ${monster.name}`);

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Recalcular United We Stand / Mage Power: número de monstros face-up mudou (virar face-up ou mudar ataque/defesa)
    await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [changeMonsterPosition] Player ${isPlayer1 ? 1 : 2} mudou posição do monstro ${monster.name} de ${currentPosition} para ${monster.position}`);

    return { success: true };
  }

  async placeCardOnField(duelId: string | number, userId: number, cardId: string, zoneIndex: number, position: 'attack' | 'defense' | 'face-up' | 'set', cardType?: string, skipEffectProcessing?: boolean): Promise<{ success: boolean; message?: string }> {
    logger.info(`🚀 [placeCardOnField] INICIANDO - duelId: ${duelId}, userId: ${userId}, cardId: ${cardId}, zoneIndex: ${zoneIndex}, position: ${position}, cardType: ${cardType}`);
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Memória é fonte da verdade do campo (debounce ~2.5s). Recarregar do DB aqui
    // apagava cartas colocadas no mesmo turno que ainda não tinham sido flushadas.
    let duel: Duel | null = this.activeDuels.get(duelIdStr) || null;

    try {
      if (!duel) {
        logger.info(`🔍 [placeCardOnField] Sem cache — buscando duelo do banco...`);
        duel = await this.duelsRepository
          .createQueryBuilder('duel')
          .leftJoinAndSelect('duel.player1', 'player1')
          .leftJoinAndSelect('duel.player2', 'player2')
          .where('duel.id = :id', { id: duelIdStr })
          .getOne();

        if (!duel) {
          logger.error(`❌ [placeCardOnField] Duelo ${duelIdStr} não encontrado no banco`);
          return { success: false, message: 'Duelo não encontrado' };
        }
        this.activeDuels.set(duelIdStr, duel);
      } else {
        logger.info(`✅ [placeCardOnField] Usando duelo em memória (evita rollback de campo pendente)`);
      }

      logger.info(`✅ [placeCardOnField] Duelo ok - player1Id: ${duel.player1Id}, player2Id: ${duel.player2Id}, currentTurn: ${duel.currentTurn}`);
    } catch (error) {
      logger.error(`❌ [placeCardOnField] Erro ao buscar duelo:`, error);
      return { success: false, message: 'Erro ao buscar duelo' };
    }

    // Verificar se é o turno do jogador e está na fase MAIN1 ou MAIN2
    // Garantir que os tipos sejam consistentes (number)
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    logger.info(`🔍 [placeCardOnField] Validação de turno - userId: ${userId} (${typeof userId}), player1Id: ${duel.player1Id} (${typeof duel.player1Id}) -> ${player1IdNum}, player2Id: ${duel.player2Id} (${typeof duel.player2Id}) -> ${player2IdNum}, currentTurn: ${duel.currentTurn}, isPlayer1: ${isPlayer1}, isCurrentTurn: ${isCurrentTurn}`);
    logger.info(`🔍 [placeCardOnField] Condição de turno - (isPlayer1=${isPlayer1} && currentTurn=${duel.currentTurn} === 1) || (!isPlayer1=${!isPlayer1} && currentTurn=${duel.currentTurn} === 2) = ${isCurrentTurn}`);

    if (!isCurrentTurn) {
      logger.error(`❌ [placeCardOnField] Não é o turno do jogador! userId: ${userId}, currentTurn: ${duel.currentTurn}, isPlayer1: ${isPlayer1}`);
      logger.error(`❌ [placeCardOnField] Detalhes: player1Id=${duel.player1Id} (${typeof duel.player1Id}), player2Id=${duel.player2Id} (${typeof duel.player2Id}), userId=${userId} (${typeof userId})`);
      return { success: false, message: 'Não é seu turno' };
    }

    logger.info(`✅ [placeCardOnField] Validação de turno passou! É o turno do player ${isPlayer1 ? 1 : 2}`);

    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      logger.error(`❌ [placeCardOnField] Fase inválida! currentPhase: ${duel.currentPhase}, precisa ser MAIN1 ou MAIN2`);
      return { success: false, message: 'Você só pode colocar cartas no campo nas fases principais (MP1 ou MP2)' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Verificar se a carta já está no campo (para ativação de cartas já colocadas)
    let card = null;
    let cardIndex = -1;
    let cardIsOnField = false;

    // SEMPRE verificar primeiro se a carta está no campo quando position é 'face-up'
    // Isso permite ativar cartas que já foram colocadas em 'set'
    // NÃO verificar no campo quando position é 'set' (carta sendo colocada pela primeira vez)
    // Quando position é 'set', sempre procurar na mão primeiro
    if (position === 'face-up') {
      // Verificar se há spellTrap no campo
      if (playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
        // Garantir que o array tem 5 elementos
        while (playerField.spellTrap.length < 5) {
          playerField.spellTrap.push(null);
        }
        playerField.spellTrap = playerField.spellTrap.slice(0, 5);

        // Verificar se há carta no zoneIndex
        if (zoneIndex >= 0 && zoneIndex < 5 && playerField.spellTrap[zoneIndex]) {
          const cardOnField = playerField.spellTrap[zoneIndex];
          // Verificar se é a mesma carta (por idCarta, id ou cardId)
          const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
          const requestedCardId = cardId;

          // Comparar por múltiplos identificadores e também por nome
          const requestedCardName = cardId; // Pode ser nome também
          const cardOnFieldName = cardOnField.name || cardOnField.cardName;

          const isSameCardById = cardOnFieldId === requestedCardId ||
                                String(cardOnFieldId) === String(requestedCardId) ||
                                cardOnField.idCarta === requestedCardId ||
                                cardOnField.id === requestedCardId ||
                                cardOnField.cardId === requestedCardId;

          const isSameCardByName = cardOnFieldName && requestedCardName &&
                                  (cardOnFieldName === requestedCardName ||
                                   cardOnFieldName.toLowerCase() === requestedCardName.toLowerCase());

          // Verificar se a carta no campo é spell/trap (não monstro)
          const cardOnFieldType = cardOnField.type || cardOnField.cardType;
          const isSpellOrTrapOnField = cardOnFieldType === 'Spell' || cardOnFieldType === 'Trap';

          if ((isSameCardById || isSameCardByName) && cardOnField.position === 'set' && isSpellOrTrapOnField) {
            card = cardOnField;
            cardIsOnField = true;
            // Se cardType não foi fornecido, determinar pelo tipo da carta no campo
            if (!cardType) {
              cardType = card.type === 'Spell' || card.cardType === 'Spell' ? 'Spell' : 'Trap';
            }
            logger.info(`🔍 [placeCardOnField] Carta encontrada no campo (para ativação):`, {
              name: card.name || card.cardName,
              idCarta: card.idCarta || card.id || card.cardId,
              cardId: card.cardId,
              position: card.position,
              zoneIndex: zoneIndex,
              requestedCardId: cardId,
              cardOnFieldId: cardOnFieldId,
              cardType: cardType,
              matchedById: isSameCardById,
              matchedByName: isSameCardByName,
            });
          } else {
            logger.info(`⚠️ [placeCardOnField] Carta no campo não corresponde - zoneIndex: ${zoneIndex}, cardOnFieldId: ${cardOnFieldId}, requestedCardId: ${requestedCardId}, position: ${cardOnField.position}, isSameCardById: ${isSameCardById}, isSameCardByName: ${isSameCardByName}`);
          }
        } else {
          logger.info(`⚠️ [placeCardOnField] Nenhuma carta encontrada no zoneIndex ${zoneIndex} do campo`);
        }
      } else {
        logger.info(`⚠️ [placeCardOnField] spellTrap não é um array válido`);
      }
    }

    // Se não encontrou no campo, procurar na mão
    if (!card && playerField.hand && Array.isArray(playerField.hand)) {
      logger.info(`🔍 [placeCardOnField] Procurando carta na mão - cardId: ${cardId}, handLength: ${playerField.hand.length}`);
      logger.info(`🔍 [placeCardOnField] IDs na mão:`, playerField.hand.map((c: any, idx: number) => ({
        index: idx,
        name: c.name || c.cardName,
        idCarta: c.idCarta,
        id: c.id,
        cardId: c.cardId,
        allIds: [c.idCarta, c.id, c.cardId].filter(Boolean)
      })));

      cardIndex = playerField.hand.findIndex((c: any) => {
        const cIdCarta = c.idCarta;
        const cId = c.id;
        const cCardId = c.cardId;
        const cName = c.name || c.cardName;

        // Comparar por todos os identificadores possíveis
        const matchesById = cIdCarta === cardId ||
                           cId === cardId ||
                           cCardId === cardId ||
                           String(cIdCarta) === String(cardId) ||
                           String(cId) === String(cardId) ||
                           String(cCardId) === String(cardId);

        // Comparar por nome também
        const matchesByName = cName && (cName === cardId || cName.toLowerCase() === cardId.toLowerCase());

        return matchesById || matchesByName;
      });

      if (cardIndex !== -1) {
        card = playerField.hand[cardIndex];
        logger.info(`✅ [placeCardOnField] Carta encontrada na mão no índice ${cardIndex}:`, {
          name: card.name || card.cardName,
          idCarta: card.idCarta,
          id: card.id,
          cardId: card.cardId,
        });
      } else {
        logger.info(`⚠️ [placeCardOnField] Carta não encontrada na mão após busca detalhada`);
      }
    }

    if (!card) {
      logger.error(`❌ [placeCardOnField] Carta não encontrada - cardId: ${cardId}, zoneIndex: ${zoneIndex}, position: ${position}, cardType: ${cardType}`);
      logger.error(`❌ [placeCardOnField] Estado do campo:`, {
        hasSpellTrap: !!playerField.spellTrap,
        spellTrapLength: playerField.spellTrap?.length || 0,
        spellTrapAtZone: playerField.spellTrap?.[zoneIndex] ? {
          name: playerField.spellTrap[zoneIndex].name,
          idCarta: playerField.spellTrap[zoneIndex].idCarta,
          id: playerField.spellTrap[zoneIndex].id,
          cardId: playerField.spellTrap[zoneIndex].cardId,
          position: playerField.spellTrap[zoneIndex].position
        } : null,
        hasHand: !!playerField.hand,
        handLength: playerField.hand?.length || 0
      });
      return { success: false, message: 'Carta não encontrada na mão nem no campo' };
    }

    // Log detalhado da carta
    logger.info(`🔍 [placeCardOnField] Carta encontrada:`, {
      name: card.name || card.cardName,
      idCarta: card.idCarta || card.id || card.cardId,
      type: card.type,
      cardType: card.cardType,
      cardTypeParam: cardType,
      cardIsOnField: cardIsOnField,
      allProperties: Object.keys(card)
    });

    // Determinar o tipo da carta
    // Se cardType não foi fornecido, usar o tipo da carta encontrada
    const finalCardType = cardType || card.type || card.cardType;
    const isMonster = finalCardType === 'Monster';
    const isSpellOrTrap = finalCardType === 'Spell' || finalCardType === 'Trap';

    logger.info(`🔍 [placeCardOnField] Determinação do tipo:`, {
      isMonster,
      isSpellOrTrap,
      cardTypeParam: cardType,
      cardType: card.type,
      cardCardType: card.cardType,
      willProcessEffect: !isMonster && position === 'face-up'
    });

    if (!isMonster && !isSpellOrTrap) {
      logger.error(`❌ [placeCardOnField] Tipo de carta inválido - cardType: ${cardType}, card.type: ${card.type}, card.cardType: ${card.cardType}`);
      return { success: false, message: 'Tipo de carta inválido' };
    }

    // Validar zoneIndex (0-4 para cada tipo)
    if (zoneIndex < 0 || zoneIndex >= 5) {
      return { success: false, message: 'Zona inválida. Use uma zona de 0 a 4' };
    }

    // Verificar se é invocação normal de monstro (position='attack' ou 'defense' da mão)
    // Tanto ataque quanto defesa (set/face-down) contam como invocação normal
    // Invocações normais devem verificar se já foi usada neste turno
    if (isMonster && (position === 'attack' || position === 'defense' || position === 'set') && !cardIsOnField) {
      // Verificar se já fez invocação normal neste turno
      if (playerField.normalSummonUsed === true) {
        return { success: false, message: 'Você já usou sua invocação normal neste turno. Só pode fazer uma invocação normal por turno.' };
      }

      // Chaos Sorcerer, Chaos Emperor Dragon e BLS só podem ser invocados por invocação especial (banir LIGHT + DARK do cemitério)
      const isChaosSorcererPlace = this.isExactCard(card, 'ChaosSorcerer');
      const isChaosEmperorDragonPlace = this.isExactCard(card, 'ChaosEmperorDragon');
      const isBlackLusterSoldierPlace = this.isExactCard(card, 'BlackLusterSoldierEnvoyOfTheBeginning') ||
        (typeof (card.name || card.cardName) === 'string' && (card.name || card.cardName).toLowerCase().includes('black luster soldier'));
      if (isChaosSorcererPlace || isChaosEmperorDragonPlace || isBlackLusterSoldierPlace) {
        const namePlace = isChaosSorcererPlace ? 'Chaos Sorcerer' : isChaosEmperorDragonPlace ? 'Chaos Emperor Dragon' : 'Black Luster Soldier - Envoy of the Beginning';
        return { success: false, message: `${namePlace} não pode ser invocado por invocação normal. Use invocação especial banindo 1 monstro LIGHT e 1 monstro DARK do cemitério.` };
      }

      // Verificar nível do monstro (deve ser 4 ou menos para invocação normal sem tributo)
      const cardLevel = card.level || 0;
      if (cardLevel > 4) {
        return { success: false, message: 'Monstros de nível 5 ou superior não podem ser invocados normalmente sem tributo' };
      }
    }

    // Verificar se a zona está ocupada
    if (isMonster) {
      // Garantir que monsters seja um array de 5 elementos
      if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
        playerField.monsters = [null, null, null, null, null];
      } else {
        // Garantir que tenha exatamente 5 elementos
        while (playerField.monsters.length < 5) {
          playerField.monsters.push(null);
        }
        playerField.monsters = playerField.monsters.slice(0, 5);
      }

      // Verificar se a zona específica está ocupada
      if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
        return { success: false, message: 'Esta zona de monstro já está ocupada' };
      }
    } else {
      // Garantir que spellTrap seja um array de 5 elementos
      if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
        playerField.spellTrap = [null, null, null, null, null];
      } else {
        // Garantir que tenha exatamente 5 elementos
        while (playerField.spellTrap.length < 5) {
          playerField.spellTrap.push(null);
        }
        playerField.spellTrap = playerField.spellTrap.slice(0, 5);
      }

      // Verificar se a zona específica está ocupada (mas permitir se for ativação de carta já no campo)
      if (playerField.spellTrap[zoneIndex] !== null && playerField.spellTrap[zoneIndex] !== undefined && !cardIsOnField) {
        return { success: false, message: 'Esta zona de spell/trap já está ocupada' };
      }
    }

    // Se a carta já está no campo, apenas mudar a posição
    // Verificar se é uma Field Spell (antes de processar a carta)
    const cardSpellType = card.spellType || card.cardSpellType;
    const isFieldSpell = cardSpellType === 'Field' || cardSpellType === 'FIELD' ||
                        (card.name || card.cardName || '').toLowerCase().includes('field') ||
                        MagiciansSalvation.isMagiciansSalvation(card);

    let cardToPlace;
    if (cardIsOnField) {
      // Carta já está no campo, apenas mudar posição
      cardToPlace = { ...card, position: 'face-up' };
      // Se for Field Spell, atualizar no slot field; senão, atualizar em spellTrap
      if (isFieldSpell && cardType === 'Spell') {
        playerField.field = cardToPlace;
      } else {
        playerField.spellTrap[zoneIndex] = cardToPlace;
      }
      logger.info(`✅ [placeCardOnField] Carta ${card.name || card.cardName} ativada no campo (mudou de 'set' para 'face-up')`);
      // Garantir que isMonster está correto para cartas no campo
      const cardTypeFromCard = card.type || card.cardType;
      if (cardTypeFromCard && !isMonster && !isSpellOrTrap) {
        // Se o tipo não foi determinado corretamente, usar o tipo da carta
        logger.info(`⚠️ [placeCardOnField] Tipo não determinado, usando tipo da carta: ${cardTypeFromCard}`);
      }
    } else {
      // Remover carta da mão e colocar no campo no slot específico
      // NOTA: Para Field Spells, a remoção da mão será feita depois, então não remover aqui ainda
      const shouldRemoveFromHandNow = !(isFieldSpell && cardType === 'Spell');

      if (shouldRemoveFromHandNow) {
        cardToPlace = playerField.hand.splice(cardIndex, 1)[0];
      } else {
        // Para Field Spells, apenas copiar a carta sem remover da mão ainda
        cardToPlace = { ...playerField.hand[cardIndex] };
      }

      // Garantir que os arrays de monstros e spellTrap existem e têm 5 elementos
      if (isMonster) {
      if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
        playerField.monsters = [null, null, null, null, null];
      }
      while (playerField.monsters.length < 5) {
        playerField.monsters.push(null);
      }
      playerField.monsters = playerField.monsters.slice(0, 5);

      // Validar zoneIndex antes de salvar
      if (zoneIndex < 0 || zoneIndex >= 5) {
        logger.error(`❌ [placeCardOnField] zoneIndex inválido: ${zoneIndex}`);
        return { success: false, message: 'Zona inválida' };
      }

      // Salvar no slot específico
      // 'defense' e 'set' são a mesma coisa quando invoca da mão: face-down em defesa
      // Normalizar ambos para 'set' se não estiver no campo
      const finalPosition = ((position === 'defense' || position === 'set') && !cardIsOnField) ? 'set' : position;
      if ((position === 'defense' || position === 'set') && !cardIsOnField) {
        logger.info(`🔄 [placeCardOnField] Invocando face-down da mão: ${position} -> 'set'`);
      }

      // Obter contador global de turnos do JSON (prioridade) ou do banco (fallback)
      const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

      playerField.monsters[zoneIndex] = {
        ...cardToPlace,
        position: finalPosition,
        summonedTurnNumber: currentTurnCounter, // Rastrear turno GLOBAL de invocação
        summonedByPlayer: duel.currentTurn, // Rastrear qual jogador invocou (1 ou 2)
        positionChangedThisTurn: false, // Inicializar flag
        attackedThisTurn: false, // Inicializar flag de ataque
        attacksThisTurn: 0 // Inicializar contador de ataques
      };

      // Se for invocação normal (attack, defense ou set), marcar que já usou invocação normal
      if (isMonster && (position === 'attack' || position === 'defense' || position === 'set') && !cardIsOnField) {
        playerField.normalSummonUsed = true;
        logger.info(`✅ [placeCardOnField] Invocação normal usada - Player ${isPlayer1 ? 1 : 2} invocou ${cardToPlace.name} em ${finalPosition}`);
      }

      logger.info(`✅ [placeCardOnField] Player ${isPlayer1 ? 1 : 2} colocou monstro ${cardToPlace.name} na zona ${zoneIndex} em ${position}`);
      logger.info(`🔍 [placeCardOnField] Estado dos monstros após salvar:`, playerField.monsters.map((m: any, i: number) => ({ index: i, card: m?.name || 'null', position: m?.position || 'null' })));

      // Bottomless Trap Hole: qualquer invocação (ataque ou defesa) com 1500+ ATK. Trap Hole: só invocação NORMAL em ataque com 1000+ ATK
      let placedMonsterRef = playerField.monsters[zoneIndex];
      const isNormalSummonHere = isMonster && !cardIsOnField && (position === 'attack' || position === 'defense' || position === 'set');
      if (placedMonsterRef) {
        const monsterAtk = placedMonsterRef.atk || 0;
        let bottomlessActivated = false;
        if (monsterAtk >= 1500 && (finalPosition === 'attack' || finalPosition === 'defense')) {
          bottomlessActivated = await this.checkAndActivateBottomlessTrapHole(duelId, duel, isPlayer1, zoneIndex, placedMonsterRef);
        }
        if (!bottomlessActivated && finalPosition === 'attack' && monsterAtk >= 1000 && isNormalSummonHere) {
          await this.checkAndActivateTrapHole(duelId, duel, isPlayer1, zoneIndex, placedMonsterRef);
        }
        // Re-buscar duelo após traps (podem ter destruído o monstro)
        const duelAfterTraps = await this.findDuelByIdFromDatabase(duelIdStr);
        if (duelAfterTraps) duel = duelAfterTraps;
      }
      // Slifer the Sky Dragon: oponente invocou monstro em ataque → -2000 ATK; se ATK 0, destruir
      if (isMonster && finalPosition === 'attack') {
        await this.applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, zoneIndex);
      }

      // Garantir que o duelo atualizado está no cache
      this.activeDuels.set(duelIdStr, duel);
    } else {
      if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
        playerField.spellTrap = [null, null, null, null, null];
      }
      while (playerField.spellTrap.length < 5) {
        playerField.spellTrap.push(null);
      }
      playerField.spellTrap = playerField.spellTrap.slice(0, 5);

      // Validar zoneIndex antes de salvar
      if (zoneIndex < 0 || zoneIndex >= 5) {
        logger.error(`❌ [placeCardOnField] zoneIndex inválido: ${zoneIndex}`);
        return { success: false, message: 'Zona inválida' };
      }

      // Verificar se precisa de modal antes de revelar (só para spells ativadas da mão)
      // Se a spell precisa de modal, NÃO colocar no campo ainda - apenas criar pendingChoice
      // A carta permanece na mão até o modal ser confirmado
      // OU se está no campo em "set", permanece em "set" até o modal ser confirmado
      if (position === 'face-up' && this.needsModalBeforeReveal(cardToPlace, duel, isPlayer1)) {
        if (!cardIsOnField) {
          // Carta estava na mão - não colocar no campo ainda
        logger.info(`🔒 [placeCardOnField] Spell ${cardToPlace.name || cardToPlace.cardName} precisa de modal - NÃO colocando no campo, criando pendingChoice`);
        // Não remover da mão ainda - a carta permanece na mão
        // Não colocar no campo
        // O pendingChoice será criado pelo processCardEffect ou pelo gateway
        // Retornar sucesso mas sem colocar no campo
        return { success: true, message: 'Spell requer seleção - modal será aberto' };
        } else {
          // Carta está no campo em "set" - não revelar ainda, permanece em "set"
          logger.info(`🔒 [placeCardOnField] Spell ${cardToPlace.name || cardToPlace.cardName} está em "set" e precisa de modal - NÃO revelando, criando pendingChoice`);
          // Não mudar posição - a carta permanece em "set"
          // O pendingChoice será criado pelo processCardEffect ou pelo gateway
          // Retornar sucesso mas sem revelar a carta
          return { success: true, message: 'Spell requer seleção - modal será aberto' };
        }
      }

      // Verificar se é uma Field Spell
      const cardSpellType = cardToPlace.spellType || cardToPlace.cardSpellType;
      const isFieldSpell = cardSpellType === 'Field' || cardSpellType === 'FIELD' ||
                          (cardToPlace.name || cardToPlace.cardName || '').toLowerCase().includes('field') ||
                          MagiciansSalvation.isMagiciansSalvation(cardToPlace);

      if (isFieldSpell && cardType === 'Spell') {
        // Field Spells vão para o slot field, não para spellTrap
        logger.info(`🌍 [placeCardOnField] Field Spell detectada: ${cardToPlace.name || cardToPlace.cardName}`);

        // Se já existe uma Field Spell no campo, enviá-la para o cemitério
        if (playerField.field && playerField.field !== null) {
          const previousFieldSpell = playerField.field;
          logger.info(`🔄 [placeCardOnField] Movendo Field Spell anterior para o cemitério: ${previousFieldSpell.name || previousFieldSpell.cardName}`);

          if (!playerField.graveyard) {
            playerField.graveyard = [];
          }
          playerField.graveyard.push(previousFieldSpell);
        }

        // Colocar a nova Field Spell no slot field
        playerField.field = { ...cardToPlace, position };
        logger.info(`✅ [placeCardOnField] Player ${isPlayer1 ? 1 : 2} colocou Field Spell ${cardToPlace.name} no slot field em ${position}`);

        // Remover da mão se não estava no campo
        if (!cardIsOnField && cardIndex !== -1 && playerField.hand) {
          playerField.hand.splice(cardIndex, 1);
          logger.info(`✅ [placeCardOnField] Field Spell removida da mão`);
        }
      } else {
        // Spells/Traps normais vão para spellTrap
        // Salvar no slot específico (só se não precisar de modal ou se for exceção)
        const isTrapPlace =
          cardType === 'Trap' ||
          cardToPlace.type === 'Trap' ||
          cardToPlace.cardType === 'Trap';
        const turnCounterWhenSet = duel.turnCounter ?? 1;
        const spellTrapPayload =
          isTrapPlace && position === 'set' && !cardIsOnField
            ? { ...cardToPlace, position, trapSetTurnCounter: turnCounterWhenSet }
            : { ...cardToPlace, position };
        playerField.spellTrap[zoneIndex] = spellTrapPayload;
        logger.info(`✅ [placeCardOnField] Player ${isPlayer1 ? 1 : 2} colocou spell/trap ${cardToPlace.name} na zona ${zoneIndex} em ${position}`);
        logger.info(`🔍 [placeCardOnField] Estado dos spellTrap após salvar:`, playerField.spellTrap.map((s: any, i: number) => ({ index: i, card: s?.name || 'null', position: s?.position || 'null' })));
      }

      // Recalcular MagePower sempre que uma carta spell/trap é adicionada (face-up ou set)
      // O MagePower conta TODAS as cartas na zona spell/trap, independente de estarem face-up ou face-down
      // Também recalcular UnitedWeStand caso o número de monstros tenha mudado
      await this.recalculateMagePowerAtk(duelIdStr, duel, isPlayer1);
      await this.recalculateUnitedWeStandAtk(duelIdStr, duel, isPlayer1);
      }
    }

    // Garantir que o duelo atualizado está no cache
    this.activeDuels.set(duelIdStr, duel);

    // Atualizar no banco PRIMEIRO para garantir que a carta apareça no campo
    logger.info(`💾 [placeCardOnField] Salvando no banco - zoneIndex: ${zoneIndex}, position: ${position}`);
    logger.info(`🔍 [placeCardOnField] Estado ANTES de salvar - player1Field.monsters:`, (duel as any).player1Field?.monsters?.map((m: any, i: number) => ({ index: i, card: m?.name || 'null', position: m?.position || 'null' })));
    logger.info(`🔍 [placeCardOnField] Estado ANTES de salvar - player2Field.monsters:`, (duel as any).player2Field?.monsters?.map((m: any, i: number) => ({ index: i, card: m?.name || 'null', position: m?.position || 'null' })));

    try {
      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);

      // Atualizar o cache também para manter sincronizado
      this.activeDuels.set(duelIdStr, duel);

      // Processar efeitos de cartas quando ativadas (face-up) APÓS salvar no banco
      logger.info(`🔍 [placeCardOnField] Verificando se deve processar efeito:`, {
        isMonster,
        position,
        isFaceUp: position === 'face-up',
        willProcess: !isMonster && position === 'face-up',
        cardName: cardToPlace.name || cardToPlace.cardName,
        cardId: cardToPlace.idCarta || cardToPlace.id || cardToPlace.cardId
      });

      // Processar efeitos de spell/trap quando ativadas (face-up)
      // Verificar se não é monstro e está em face-up
      // IMPORTANTE: Se skipEffectProcessing for true, não processar efeito aqui (já foi processado antes)
      // IMPORTANTE: Se a spell foi colocada em 'set' porque precisa de modal, não processar efeito ainda
      // Para Field Spells, verificar o slot field; para outras, verificar spellTrap
      const actualPosition = !isMonster ? (
        isFieldSpell && cardType === 'Spell'
          ? (playerField.field?.position || position)
          : (playerField.spellTrap?.[zoneIndex]?.position || position)
      ) : position;
      if (!isMonster && actualPosition === 'face-up' && !skipEffectProcessing) {
        logger.info(`✨ [placeCardOnField] Processando efeito da carta ${cardToPlace.name || cardToPlace.cardName} (${cardToPlace.idCarta || cardToPlace.id || cardToPlace.cardId})`);
        logger.info(`🔍 [placeCardOnField] Detalhes da ativação:`, {
          cardName: cardToPlace.name || cardToPlace.cardName,
          cardId: cardToPlace.idCarta || cardToPlace.id || cardToPlace.cardId,
          cardType: cardToPlace.type || cardToPlace.cardType,
          isMonster: isMonster,
          isFieldSpell: isFieldSpell && cardType === 'Spell',
          position: position,
          cardIsOnField: cardIsOnField,
          zoneIndex: zoneIndex
        });
        // Para Field Spells, passar zoneIndex como -1 ou null para indicar que está no slot field
        const effectZoneIndex = (isFieldSpell && cardType === 'Spell') ? -1 : zoneIndex;
        // CRÍTICO: Usar CardEffectsService para processar efeitos (novo sistema de registro)
        await this.cardEffectsService.processCardEffect(duelIdStr, duel, isPlayer1, cardToPlace, effectZoneIndex);
        logger.info(`✅ [placeCardOnField] Efeito processado para ${cardToPlace.name || cardToPlace.cardName}`);

        // Skilled Dark Magician: +1 Marcador de Magia quando uma Magia resolve (máx. 3)
        const activatedType = String(cardToPlace?.type || cardToPlace?.cardType || '').toLowerCase();
        if (activatedType.includes('spell') || activatedType.includes('magia')) {
          const added = SkilledDm.addSpellCountersOnSpellResolve(playerField);
          if (added > 0) {
            logger.info(`✨ [Skilled Dark Magician] +1 Marcador em ${added} monstro(s) após Magia resolver`);
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          }
        }

        // Recalcular ATK de equipamentos quando cartas são adicionadas
        if (position === 'face-up') {
          // Aguardar um pouco para garantir que o processCardEffect terminou
          await new Promise(resolve => setTimeout(resolve, 100));

          if (isMonster) {
            // Monstro invocado: recalcular UnitedWeStand para ambos os jogadores (número de monstros face-up mudou)
            await this.recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
          }
          // Nota: MagePower já foi recalculado acima quando a carta spell/trap foi adicionada (face-up ou set)

          // Atualizar no banco após recalcular
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
        }
      } else {
        logger.info(`ℹ️ [placeCardOnField] Efeito NÃO será processado - isMonster: ${isMonster}, position: ${position}, cardIsOnField: ${cardIsOnField}`);
      }

      // Verificar se foi salvo corretamente - buscar do banco
      const savedDuel = await this.findDuelByIdFromDatabase(duelIdStr);
      if (savedDuel) {
        const savedField = isPlayer1 ? (savedDuel as any).player1Field : (savedDuel as any).player2Field;
        const savedMonster = isMonster ? savedField?.monsters?.[zoneIndex] : null;
        const savedSpellTrap = !isMonster ? savedField?.spellTrap?.[zoneIndex] : null;
        logger.info(`✅ [placeCardOnField] Verificação pós-salvamento - zoneIndex ${zoneIndex}:`, savedMonster ? { name: savedMonster.name, position: savedMonster.position } : savedSpellTrap ? { name: savedSpellTrap.name, position: savedSpellTrap.position } : 'null');

        if (!savedMonster && !savedSpellTrap) {
          logger.error(`❌ [placeCardOnField] Carta NÃO foi salva no banco! zoneIndex: ${zoneIndex}`);
          if (isMonster) {
            logger.error(`❌ [placeCardOnField] Estado do campo salvo (monsters):`, savedField?.monsters?.map((m: any, i: number) => ({ index: i, card: m?.name || 'null', position: m?.position || 'null' })));
          } else {
            logger.error(`❌ [placeCardOnField] Estado do campo salvo (spellTrap):`, savedField?.spellTrap?.map((s: any, i: number) => ({ index: i, card: s?.name || 'null', position: s?.position || 'null' })));
          }
        }
      } else {
        logger.error(`❌ [placeCardOnField] Não foi possível buscar duelo do banco após salvar!`);
      }
    } catch (error) {
      logger.error(`❌ [placeCardOnField] Erro ao salvar no banco:`, error);
      throw error;
    }

    // Magician's Salvation: NS/SS face-up de DM/DMG via placeCardOnField
    if (isMonster && !cardIsOnField && !(duel as any).pendingChoice) {
      const placed = playerField?.monsters?.[zoneIndex];
      const placedPos = String(placed?.position || '').toLowerCase();
      if (
        placed &&
        (placedPos === 'attack' || placedPos === 'defense') &&
        MagiciansSalvation.isDarkMagicianOrGirl(placed)
      ) {
        const started = await this.tryStartMagiciansSalvationPairEffect(
          duelId,
          duel,
          isPlayer1,
          zoneIndex,
        );
        if (started) {
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
            pendingChoice: (duel as any).pendingChoice,
          } as any);
          this.activeDuels.set(duelIdStr, duel);
        }
      }
    }

    return { success: true };
  }

  /**
   * Verifica se uma spell precisa de modal/seleção antes de ser revelada
   * Retorna true se precisa de modal, false caso contrário
   * Exceções: Confiscation, Graceful Charity e Forceful Sentry são ativadas imediatamente
   */
  needsModalBeforeReveal(card: any, duel?: Duel, activatorIsPlayer1?: boolean): boolean {
    const cardId = card.idCarta || card.id || card.cardId;
    const cardName = (card.name || card.cardName || '').trim().toLowerCase();
    const cardType = card.type || card.cardType;
    const spellType = card.spellType;

    // Exceções: estas spells são ativadas imediatamente
    const immediateActivationCards = ['confiscation', 'gracefulcharity', 'graceful charity', 'forcefulsentry', 'forceful sentry'];
    const cardIdLower = String(cardId || '').toLowerCase();

    for (const immediateCard of immediateActivationCards) {
      if (cardIdLower.includes(immediateCard) || cardName.includes(immediateCard)) {
        return false; // Não precisa de modal, ativa imediatamente
      }
    }

    if (duel && activatorIsPlayer1 !== undefined) {
      const ptsKind = Pts.detectPlayerTargetSpellKind(card, duel, activatorIsPlayer1);
      if (ptsKind) return true;
    }

    // Spells Equip precisam de modal para selecionar o monstro
    if (cardType === 'Spell' && spellType === 'Equip') {
      return true;
    }

    // Verificar outras spells que precisam de seleção
    const needsModalCards = [
      'monsterreborn', 'monster reborn',
      'changeofheart', 'change of heart',
      'braincontrol', 'brain control',
      'mysticalspacetyphoon', 'mystical space typhoon',
      'soultaker', 'soul taker',
      'lightningstorm', 'lightning storm',
      'snowmaneater', 'snowman eater',
      'lastwill', 'last will',
      'monsterreincarnation', 'monster reincarnation',
      'prematureburial', 'premature burial',
      'autonomousactionunit', 'autonomous action unit'
    ];

    for (const modalCard of needsModalCards) {
      if (cardIdLower.includes(modalCard) || cardName.includes(modalCard)) {
        return true; // Precisa de modal
      }
    }

    return false; // Não precisa de modal, pode ser revelada imediatamente
  }

  /**
   * Retorna o bônus de ATK do Banner of Courage: Spell Contínua que fica no campo até ser destruída.
   * Quando ativada: durante a SUA fase de batalha, todos os seus monstros ganham 200 de ATK.
   * O efeito é acumulativo: cada Banner of Courage face-up no campo adiciona +200 ATK.
   */
  private getBannerOfCourageBonus(duel: Duel, isPlayer1: boolean, currentPhase: string | TurnPhase): number {
    // Banner of Courage só funciona durante a Fase de Batalha do dono da carta
    if (currentPhase !== 'BATTLE' && currentPhase !== TurnPhase.BATTLE) {
      return 0;
    }
    const currentTurn = duel.currentTurn; // 1 = Player1, 2 = Player2
    const isMyBattlePhase = (isPlayer1 && currentTurn === 1) || (!isPlayer1 && currentTurn === 2);
    if (!isMyBattlePhase) {
      return 0;
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.spellTrap) {
      return 0;
    }

    // Contar quantas Banner of Courage estão face-up no campo (efeito acumulativo: cada uma +200)
    const count = playerField.spellTrap.filter((st: any) => {
      if (!st) return false;
      const pos = st.position || '';
      if (pos !== 'face-up') return false;
      const cardId = st.idCarta || st.id || st.cardId;
      const cardName = (st.name || st.cardName || '').toLowerCase();
      return cardId === 'BannerOfCourage' ||
             (typeof cardId === 'string' && cardId.toLowerCase().includes('bannerofcourage')) ||
             cardName.includes('banner of courage');
    }).length;

    return count * 200;
  }

  /** Slifer the Sky Dragon: ganha 1000 ATK/DEF para cada carta na mão do controlador. */
  private isSliferTheSkyDragon(monster: any): boolean {
    if (!monster) return false;
    const name = (monster.name || monster.cardName || '').toLowerCase();
    return /slifer\s*the\s*sky\s*dragon/.test(name);
  }

  /** Obelisk the Tormentor: 3 tributos, invocação não negável, não pode ser alvo de efeitos. */
  private isObeliskTheTormentor(monster: any): boolean {
    if (!monster) return false;
    const name = (monster.name || monster.cardName || '').toLowerCase();
    return /obelisk\s*the\s*tormentor/.test(name);
  }

  /**
   * Monstros válidos como alvo de Spell de Equip (face-up em ataque ou defesa; Obelisk não pode ser alvo).
   */
  countFaceUpMonstersForEquipSpell(playerField: any): number {
    const monsters = playerField?.monsters;
    if (!Array.isArray(monsters)) return 0;
    let n = 0;
    for (const m of monsters) {
      if (!m) continue;
      const position = m.position || 'attack';
      if (position !== 'attack' && position !== 'defense') continue;
      if (this.isObeliskTheTormentor(m)) continue;
      n++;
    }
    return n;
  }

  /** Bônus de ATK/DEF do Slifer: 1000 × número de cartas na mão do controlador do monstro. */
  private getSliferHandBonus(duel: Duel, isPlayer1Field: boolean): number {
    const field = isPlayer1Field ? (duel as any).player1Field : (duel as any).player2Field;
    const hand = field?.hand;
    const count = Array.isArray(hand) ? hand.length : 0;
    return count * 1000;
  }

  /**
   * Retorna o ATK total do monstro (base + equipamentos + efeitos que aumentam ATK).
   * Usado na batalha para comparar atacante vs defensor considerando todos os bônus.
   * Slifer the Sky Dragon: +1000 ATK por cada carta na mão do controlador.
   * Efeito do Slifer no oponente: monstro invocado em ataque perde 2000 ATK (sliferAtkDebuff).
   */
  private getTotalMonsterAtk(monster: any, duel: Duel, isPlayer1Field: boolean, currentPhase: string | TurnPhase): number {
    if (!monster || monster === null) return 0;

    // Get base ATK
    let base = Number(monster.atk) || 0;
    const originalBase = base;

    // Shrink: halve original ATK
    if (monster.shrinkAtkHalvedThisTurn) {
      const originalAtk = monster.originalAtkBeforeShrink || base;
      base = Math.floor(originalAtk / 2);
    }

    // Megamorph: replace base with 2x or 0.5x original based on LP
    if (monster.hasMegamorph) {
      const playerLP = isPlayer1Field ? duel.player1LifePoints : duel.player2LifePoints;
      const opponentLP = isPlayer1Field ? duel.player2LifePoints : duel.player1LifePoints;
      if (playerLP < opponentLP) {
        base = originalBase * 2;
      } else if (playerLP > opponentLP) {
        base = Math.floor(originalBase / 2);
      }
      // If equal, base remains unchanged
    }

    const equipment = Number(monster.equipmentBonusAtk) || 0;
    const spellCounter = Number(monster.spellCounterBonusAtk) || 0;
    const bannerOfCourage = this.getBannerOfCourageBonus(duel, isPlayer1Field, currentPhase);
    const sliferBonus = this.isSliferTheSkyDragon(monster) ? this.getSliferHandBonus(duel, isPlayer1Field) : 0;
    const sliferDebuff = Number(monster.sliferAtkDebuff) || 0;
    const ownerField = isPlayer1Field ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1Field ? (duel as any).player2Field : (duel as any).player1Field;
    const dmgGirlBonus = DmgAtk.getDarkMagicianGirlAtkBonus(monster, ownerField);
    const busterBladerBonus = BusterBlader.getBusterBladerAtkBonus(monster, opponentField);
    const darkPaladinBonus = DarkPaladin.getDarkPaladinAtkBonus(
      monster,
      ownerField,
      opponentField,
    );
    const heatBonus = ElementalHeroHeat.isElementalHeroHeat(monster)
      ? ElementalHeroHeat.getHeatAtkBonus(ownerField)
      : 0;

    let totalAtk = base +
      equipment +
      spellCounter +
      bannerOfCourage +
      sliferBonus +
      dmgGirlBonus +
      busterBladerBonus +
      darkPaladinBonus +
      heatBonus -
      sliferDebuff;

    // Limiter Removal: double ATK for Machine monsters
    if (monster.limiterRemovalDoubled) {
      totalAtk = totalAtk * 2;
    }

    return Math.max(0, totalAtk);
  }

  /**
   * Retorna o DEF total do monstro (base + equipamentos + efeitos que aumentam DEF).
   * Slifer the Sky Dragon: +1000 DEF por cada carta na mão do controlador.
   */
  private getTotalMonsterDef(monster: any, duel: Duel, isPlayer1Field: boolean): number {
    if (!monster || monster === null) return 0;
    const base = Number(monster.def ?? monster.defense ?? 0) || 0;
    const equipment = Number(monster.equipmentBonusDef) || 0;
    const spellCounter = Number(monster.spellCounterBonusDef) || 0;
    const sliferBonus = this.isSliferTheSkyDragon(monster) ? this.getSliferHandBonus(duel, isPlayer1Field) : 0;
    return base + equipment + spellCounter + sliferBonus;
  }

  /**
   * Efeito do Slifer the Sky Dragon: quando o OPONENTE do duelista que controla Slifer invoca
   * um monstro em posição de ataque, esse monstro perde 2000 ATK. Se o ATK chegar a 0 ou menos,
   * o monstro é destruído automaticamente.
   * (opponentField = campo de quem tem Slifer; summonerField = campo de quem invocou = oponente do controlador.)
   */
  async applySliferEffectOnOpponentSummon(
    duelId: string | number,
    duel: Duel,
    isPlayer1Summoner: boolean,
    zoneIndex: number,
  ): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);
    const summonerField = isPlayer1Summoner ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1Summoner ? (duel as any).player2Field : (duel as any).player1Field;
    const placedMonster = summonerField?.monsters?.[zoneIndex];
    if (!placedMonster || placedMonster.position !== 'attack') return;
    const opponentMonsters = opponentField?.monsters || [];
    const hasSlifer = opponentMonsters.some((m: any) => m && this.isSliferTheSkyDragon(m));
    if (!hasSlifer) return;

    placedMonster.sliferAtkDebuff = 2000;
    const totalAtk = this.getTotalMonsterAtk(placedMonster, duel, isPlayer1Summoner, duel.currentPhase);
    if (totalAtk <= 0) {
      logger.info(`🐉 [Slifer] Monstro ${placedMonster.name || placedMonster.cardName} teve ATK reduzido a 0 ou menos - destruído automaticamente`);
      if (!summonerField.graveyard) summonerField.graveyard = [];
      summonerField.graveyard.push(placedMonster);
      summonerField.monsters[zoneIndex] = null;
      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);
    }
  }

  /**
   * Processa a escolha de carta do The Forceful Sentry
   */
  // Delegar para CardEffectHandlersService
  async processForcefulSentryChoice(duelId: string | number, userId: number, instanceId: string): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processForcefulSentryChoice', this, [duelId, userId, instanceId]);
  }


  // Delegar para CardEffectHandlersService
  async processConfiscationChoice(duelId: string | number, userId: number, instanceId: string): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processConfiscationChoice', this, [duelId, userId, instanceId]);
  }


  /**
   * Processa a escolha de cartas do GracefulCharity
   */
  // Delegar para CardEffectHandlersService
  async processGracefulCharityChoice(duelId: string | number, userId: number, instanceIdsToDiscard: string[]): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processGracefulCharityChoice', this, [duelId, userId, instanceIdsToDiscard]);
  }


  /**
   * Processa a escolha do MonsterReborn - reviver um monstro do cemitério
   */
  async processMonsterRebornChoice(duelId: string | number, userId: number, chosenMonster: { graveyard: 'player' | 'opponent'; index: number }): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processMonsterRebornChoice', this, [duelId, userId, chosenMonster]);
  }

  async processPrematureBurialChoice(
    duelId: string | number,
    userId: number,
    chosenMonster: { index: number },
    spellTrapZoneIndex: number,
  ): Promise<{ success: boolean; message?: string; duel?: any }> {
    return this.cardEffectsService.executeAction('processPrematureBurialChoice', this, [duelId, userId, chosenMonster, spellTrapZoneIndex]);
  }

  /**
   * Processa a escolha do Reinforcement Of The Army - adicionar monstro Warrior de Level 4 ou menos do deck à mão
   */
  async processReinforcementOfTheArmyChoice(duelId: string | number, userId: number, deckIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processReinforcementOfTheArmyChoice', this, [duelId, userId, deckIndex]);
  }

  /**
   * Processa a escolha do Last Will - invoca por invocação especial um monstro do deck e embaralha
   */
  async processLastWillChoice(duelId: string | number, userId: number, deckIndex: number, zoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processLastWillChoice', this, [duelId, userId, deckIndex, zoneIndex]);
  }

  /**
   * Processa a escolha do monstro do cemitério do oponente para Autonomous Action Unit:
   * remove o monstro do cemitério do oponente, invoca por invocação especial no campo do jogador em ataque e equipa com a carta.
   */
  async processAutonomousActionUnitChoice(duelId: string | number, userId: number, chosenMonsterIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processAutonomousActionUnitChoice', this, [duelId, userId, chosenMonsterIndex]);
  }


  /**
   * Destrói o monstro equipado quando Autonomous Action Unit é removida do campo
   */
  private async handleAutonomousActionUnitDestruction(duelId: string | number, duel: Duel, isPlayer1: boolean, zoneIndex: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return;
    }

    const zoneNum = Number(zoneIndex);
    // Procurar por monstros equipados com Autonomous Action Unit nesta zona (usar == para string/number)
    for (let i = 0; i < playerField.monsters.length; i++) {
      const monster = playerField.monsters[i];
      const monsterEquipZone = monster?.equippedZoneIndex ?? monster?.equippedSpellTrapZoneIndex;
      const zoneMatch = monsterEquipZone !== undefined && monsterEquipZone !== null && (Number(monsterEquipZone) === zoneNum || monsterEquipZone == zoneIndex);
      const isAAU = monster?.equippedBy === 'AutonomousActionUnit' || (monster?.equippedCardId && String(monster.equippedCardId).toLowerCase().includes('autonomousactionunit'));
      if (monster && zoneMatch && isAAU) {
        logger.info(`💥 [handleAutonomousActionUnitDestruction] Destruindo monstro ${monster.name || monster.cardName} equipado com Autonomous Action Unit`);

        // Remover equipamento do monstro
        if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
          monster.equippedCards = monster.equippedCards.filter((eq: any) => eq.zoneIndex !== zoneIndex);
        }
        monster.equippedBy = undefined;
        monster.equippedCardId = undefined;
        monster.equippedZoneIndex = undefined;

        // Mover monstro para o cemitério do DONO ORIGINAL
        const ownerFieldAAU = this.getOwnerFieldForMonster(duel, monster, isPlayer1);
        if (!ownerFieldAAU.graveyard) ownerFieldAAU.graveyard = [];
        ownerFieldAAU.graveyard.push(monster);
        playerField.monsters[i] = null;

        // Marcar que um monstro foi destruído no campo do jogador neste turno (para Last Will)
        if (!playerField.monsterDestroyedThisTurn) {
          playerField.monsterDestroyedThisTurn = true;
          logger.info(`✅ [handleAutonomousActionUnitDestruction] Monstro destruído no campo do jogador - Last Will pode ser ativada`);
        }

        logger.info(`✅ [handleAutonomousActionUnitDestruction] Monstro destruído e enviado para o cemitério do dono original`);

        // Enviar a carta Autonomous Action Unit ao cemitério e limpar a zona
        if (playerField.spellTrap && playerField.spellTrap[zoneIndex] !== null && playerField.spellTrap[zoneIndex] !== undefined) {
          const aauCard = playerField.spellTrap[zoneIndex];
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(aauCard);
          playerField.spellTrap[zoneIndex] = null;
          logger.info(`💥 [handleAutonomousActionUnitDestruction] Autonomous Action Unit enviada ao cemitério`);
        }

        // Recalcular UnitedWeStand para ambos os jogadores (número de monstros face-up mudou)
        await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
        break; // Só pode haver um monstro equipado com esta carta
      }
    }
  }

  /**
   * Chamar sempre que uma spell/trap for removida/destruída do campo (por qualquer efeito).
   * Se for Autonomous Action Unit ou Premature Burial, destrói o monstro equipado e envia a carta ao cemitério.
   * Não faz nada para outras cartas (o caller deve fazer push para graveyard e limpar zona).
   */
  async onSpellTrapRemovedFromField(duelId: string | number, duel: Duel, isPlayer1: boolean, zoneIndex: number): Promise<void> {
    return this.cardEffectsService.executeAction('onSpellTrapRemovedFromField', this, [duelId, duel, isPlayer1, zoneIndex]);
  }

  /** Eternal Soul: se sair face-up, destrói todos os monstros do controlador. */
  private async destroyAllMonstersControlledByEternalSoulLeave(
    duelId: string | number,
    duel: Duel,
    isPlayer1: boolean,
  ): Promise<void> {
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField?.monsters) return;
    if (!playerField.graveyard) playerField.graveyard = [];
    let destroyed = 0;
    for (let i = 0; i < playerField.monsters.length; i++) {
      const m = playerField.monsters[i];
      if (!m) continue;
      await this.handleEquipmentDestruction(duelId, duel, isPlayer1, m);
      this.sendMonsterLeavingField(duel, m, isPlayer1);
      playerField.monsters[i] = null;
      destroyed++;
    }
    if (destroyed > 0) {
      playerField.monsterDestroyedThisTurn = true;
      logger.info(`💀 [Eternal Soul] Saiu do campo — destruiu ${destroyed} monstro(s) do controlador`);
      await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
    }
  }

  /** Dark Magician imune a efeitos do oponente (Eternal Soul). */
  isMonsterUnaffectedByOpponentEffects(
    duel: Duel,
    monsterOwnerIsPlayer1: boolean,
    monster: any,
  ): boolean {
    return EternalSoul.isDarkMagicianUnaffectedByOpponent(duel, monsterOwnerIsPlayer1, monster);
  }

  /**
   * Eternal Soul — efeito 1x/turno: abre escolha (SS DM ou search DMA/Knives).
   */
  async tryStartEternalSoulEffect(
    duelId: string | number,
    userId: number,
    spellTrapZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('tryStartEternalSoulEffect', this, [duelId, userId, spellTrapZoneIndex]);
  }

  async processEternalSoulSpecialSummon(
    duelId: string | number,
    userId: number,
    source: 'hand' | 'graveyard',
    index: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processEternalSoulSpecialSummon', this, [duelId, userId, source, index]);
  }

  async processEternalSoulSearch(
    duelId: string | number,
    userId: number,
    deckIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processEternalSoulSearch', this, [duelId, userId, deckIndex]);
  }

  async skipEternalSoulEffect(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipEternalSoulEffect', this, [duelId, userId]);
  }

  /**
   * Skilled Dark Magician — Tributar com 3 marcadores → SS Dark Magician da mão/Deck/GY.
   */
  async tryStartSkilledDarkMagicianEffect(
    duelId: string | number,
    userId: number,
    monsterZoneIndex: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('tryStartSkilledDarkMagicianEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  async processSkilledDarkMagicianChoice(
    duelId: string | number,
    userId: number,
    source: 'hand' | 'deck' | 'graveyard',
    index: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processSkilledDarkMagicianChoice', this, [duelId, userId, source, index]);
  }

  async skipSkilledDarkMagicianEffect(
    duelId: string | number,
    userId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('skipSkilledDarkMagicianEffect', this, [duelId, userId]);
  }

  /**
   * Devolve monstros controlados por ChangeOfHeart quando a carta é destruída ou o turno acaba
   */
  private async returnChangeOfHeartMonsters(duelId: string, duel: Duel, isPlayer1: boolean): Promise<number> {
    let returnedCount = 0;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      logger.warn(`⚠️ [returnChangeOfHeartMonsters] Campo do controlador (isPlayer1=${isPlayer1}) ou monstros ausentes`);
      return returnedCount;
    }
    if (!opponentField) {
      logger.warn(`⚠️ [returnChangeOfHeartMonsters] Campo do oponente ausente`);
      return returnedCount;
    }

    // Garantir que o array de monstros do oponente está inicializado
    if (!opponentField.monsters || !Array.isArray(opponentField.monsters)) {
      opponentField.monsters = [null, null, null, null, null];
    }
    while (opponentField.monsters.length < 5) {
      opponentField.monsters.push(null);
    }
    opponentField.monsters = opponentField.monsters.slice(0, 5);

    const expectedController = isPlayer1 ? 1 : 2;
    const expectedOriginalOwner = isPlayer1 ? 2 : 1;

    for (let index = 0; index < playerField.monsters.length; index++) {
      const monster = playerField.monsters[index];
      if (!monster) continue;

      // Aceitar controlledBy/originalOwner/originalZoneIndex em qualquer formato (camelCase ou lowercase do JSON)
      const controlledByVal = monster.controlledBy ?? monster.controlledby;
      const originalOwnerVal = monster.originalOwner ?? monster.originalowner;
      const origZone = monster.originalZoneIndex ?? monster.originalzoneindex;
      const controlledByNum = Number(controlledByVal);
      const originalOwnerNum = Number(originalOwnerVal);
      const hasValidZone = origZone !== undefined && origZone !== null && !Number.isNaN(Number(origZone)) && Number(origZone) >= 0 && Number(origZone) <= 4;
      const isControlledMonster =
        !Number.isNaN(controlledByNum) && controlledByNum === expectedController &&
        !Number.isNaN(originalOwnerNum) && originalOwnerNum === expectedOriginalOwner &&
        hasValidZone;

      if (!isControlledMonster && (controlledByVal !== undefined || originalOwnerVal !== undefined)) {
        logger.info(`🔍 [returnChangeOfHeartMonsters] Monstro ${index} ${monster.name || monster.cardName} - controlledBy=${controlledByVal} (expected ${expectedController}), originalOwner=${originalOwnerVal} (expected ${expectedOriginalOwner}), zone=${origZone}`);
      }

      if (isControlledMonster) {
        const zoneIndex = Number(origZone);
        // Devolver ao campo do oponente (dono original)
        if (opponentField.monsters[zoneIndex] === null || opponentField.monsters[zoneIndex] === undefined) {
            const { controlledBy, originalOwner, originalZoneIndex, controlledUntilTurn, ...monsterWithoutControl } = monster;
            opponentField.monsters[zoneIndex] = {
              ...monsterWithoutControl,
              positionChangedThisTurn: false,
              attackedThisTurn: false,
              attacksThisTurn: 0,
            };
            playerField.monsters[index] = null;
            returnedCount++;
            logger.info(`🔄 [returnChangeOfHeartMonsters] Devolvendo monstro ${monster.name || monster.cardName} do Player ${isPlayer1 ? 1 : 2} para Player ${isPlayer1 ? 2 : 1} (zona ${zoneIndex})`);
          } else {
            if (!opponentField.graveyard) {
              opponentField.graveyard = [];
            }
            const { controlledBy, originalOwner, originalZoneIndex, controlledUntilTurn, ...monsterWithoutControl } = monster;
            opponentField.graveyard.push(monsterWithoutControl);
            playerField.monsters[index] = null;
            returnedCount++;
            logger.info(`🔄 [returnChangeOfHeartMonsters] Zona original ocupada - enviando monstro ${monster.name || monster.cardName} para o cemitério do Player ${isPlayer1 ? 2 : 1}`);
          }
      }
    }

    // Recalcular United We Stand quando monstros são devolvidos (número de face-up mudou em um ou ambos os campos)
    if (returnedCount > 0) {
      await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
      // Persistir para garantir que o monstro voltou ao campo original (ex.: quando a magia é destruída por MST/Harpie's/Breaker no turno do controlador)
      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);
      this.activeDuels.set(duelId, duel);
    }

    return returnedCount;
  }

  /**
   * Processa a escolha do ChangeOfHeart - controlar um monstro do oponente durante o turno
   */
  /**
   * Inicia o efeito do Cyber-Stein: pagar 5000 LP e escolher um monstro do Extra Deck para invocar
   */
  async startCyberSteinEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startCyberSteinEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  /**
   * Processa o efeito do Cyber-Stein: pagar 5000 LP e invocar um monstro do Extra Deck
   */
  async processCyberSteinEffectChoice(duelId: string | number, userId: number, monsterZoneIndex: number, extraDeckIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processCyberSteinEffectChoice', this, [duelId, userId, monsterZoneIndex, extraDeckIndex]);
  }

  /**
   * Inicia a invocação especial do Dark Armed Dragon - verifica se há exatamente 3 monstros Dark no cemitério
   */
  async startDarkArmedDragonSpecialSummon(duelId: string | number, userId: number, cardId: string): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startDarkArmedDragonSpecialSummon', this, [duelId, userId, cardId]);
  }

  /**
   * Processa a invocação especial do Dark Armed Dragon - sempre em modo de ataque
   */
  async specialSummonDarkArmedDragon(duelId: string | number, userId: number, cardId: string, zoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Buscar duelo do banco
    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;

    // Verificar se é o turno do jogador
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser usado em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode invocar por invocação especial nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Verificar se a zona é válida
    if (zoneIndex < 0 || zoneIndex >= 5) {
      return { success: false, message: 'Zona de invocação inválida' };
    }

    // Verificar se a zona está vazia
    if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
      return { success: false, message: 'A zona de invocação já está ocupada' };
    }

    // Verificar se ainda há exatamente 3 Dark no cemitério
    // IMPORTANTE: Conta TODOS os monstros Dark, mesmo que tenham o mesmo nome
    // Cada carta no cemitério é contada separadamente, independente do nome
    const graveyard = playerField.graveyard || [];
    const darkMonsters = graveyard.filter((c: any) => {
      if (!c) return false;
      const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
      const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
      if (!isMonster) return false;

      const attributeRaw = c.attribute || c.cardAttribute || '';
      const attribute = String(attributeRaw).toUpperCase().trim();
      const isDark = attribute === 'DARK' ||
                    attribute === 'TREVAS' ||
                    (typeof attribute === 'string' && attribute.includes('DARK'));

      return isDark;
    });

    if (darkMonsters.length !== 3) {
      return { success: false, message: `Você precisa ter exatamente 3 monstros do atributo Dark no seu cemitério (você tem ${darkMonsters.length})` };
    }

    // Buscar a carta na mão (usando a mesma lógica de startDarkArmedDragonSpecialSummon)
    // Priorizar instanceId, depois idCarta/id/cardId, depois nome
    const cardIndex = playerField.hand.findIndex((c: any) => {
      if (!c) return false;

      // Primeiro verificar por instanceId (mais específico)
      const cInstanceId = c.instanceId;
      if (cInstanceId && cInstanceId === cardId) {
        return true;
      }

      // Depois verificar por idCarta/id/cardId
      const cId = c.idCarta || c.id || c.cardId;
      if (cId && (cId === cardId || String(cId) === String(cardId))) {
        return true;
      }

      // Por último verificar por nome (cartas com mesmo nome são tratadas como iguais)
      const cName = (c.name || c.cardName || '').trim().toLowerCase();
      const searchName = String(cardId).trim().toLowerCase();
      if (cName && (cName === searchName || cName === 'dark armed dragon' || searchName === 'dark armed dragon')) {
        return true;
      }

      return false;
      return this.duelUtils.cardMatches(c, cardId);
    });

    if (cardIndex === -1) {
      logger.error(`❌ [specialSummonDarkArmedDragon] Carta não encontrada na mão - cardId procurado: ${cardId}, mão:`,
        playerField.hand.map((c: any) => ({
          idCarta: c?.idCarta,
          id: c?.id,
          cardId: c?.cardId,
          instanceId: c?.instanceId,
          name: c?.name || c?.cardName
        }))
      );
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const cardToSummon = playerField.hand.splice(cardIndex, 1)[0];

    // Verificar se é Dark Armed Dragon
    const cardIdCheck = cardToSummon.idCarta || cardToSummon.id || cardToSummon.cardId;
    const cardName = (cardToSummon.name || cardToSummon.cardName || '').toLowerCase();
    const isDarkArmedDragon = cardIdCheck === 'DarkArmedDragon' ||
                              cardIdCheck === 'darkarmeddragon' ||
                              cardIdCheck === 'Dark-ArmedDragon' ||
                              cardIdCheck === 'DarkArmed-Dragon' ||
                              cardName === 'dark armed dragon' ||
                              cardName === 'dark-armed dragon' ||
                              cardName === 'darkarmeddragon' ||
                              this.isExactCard(cardToSummon, 'DarkArmedDragon');

    if (!isDarkArmedDragon) {
      return { success: false, message: 'Carta inválida' };
    }

    // Obter turnCounter
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;

    // Invocar sempre em modo de ataque
    const finalPosition = 'attack';

    playerField.monsters[zoneIndex] = {
      ...cardToSummon,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true,
      effectUsedThisTurn: false,
    };

    const placedDAD = playerField.monsters[zoneIndex];
    if (placedDAD) {
      const destroyed = await this.checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, zoneIndex, placedDAD, 'attack');
      if (destroyed) {
        this.activeDuels.set(duelIdStr, duel);
        return { success: true };
      }
    }
    await this.applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, zoneIndex);

    logger.info(`✅ [specialSummonDarkArmedDragon] Dark Armed Dragon invocado por invocação especial em modo de ataque`);

    // Atualizar no banco
    await this.updateDuelInDatabase(duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return { success: true };
  }

  /**
   * Inicia o efeito do Dark Armed Dragon: banir 1 monstro Dark do cemitério para destruir 1 carta no campo
   */
  async startDarkArmedDragonEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startDarkArmedDragonEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  /**
   * Processa o efeito do Dark Armed Dragon: banir 1 Dark do cemitério e destruir 1 carta no campo
   */
  async processDarkArmedDragonEffect(duelId: string | number, userId: number, monsterZoneIndex: number, darkGraveyardIndex: number, targetPlayer: 'player' | 'opponent', targetType: 'monster' | 'spellTrap', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processDarkArmedDragonEffect', this, [duelId, userId, monsterZoneIndex, darkGraveyardIndex, targetPlayer, targetType, targetZoneIndex]);
  }

  async processChangeOfHeartChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processChangeOfHeartChoice', this, [duelId, userId, chosenMonsterZoneIndex]);
  }

  async processSoulTakerChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processSoulTakerChoice', this, [duelId, userId, chosenMonsterZoneIndex]);
  }

  /**
   * Processa a escolha do Lightning Storm - escolher 1 efeito:
   * - destroy_attack_monsters: destruir todos os monstros em posição de ataque que o oponente controla
   * - destroy_spells_traps: destruir todas as magias e armadilhas que o oponente controla
   * Só pode ativar 1 vez por turno (já validado no gateway).
   */
  async processLightningStormChoice(duelId: string | number, userId: number, effect: 'destroy_attack_monsters' | 'destroy_spells_traps'): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processLightningStormChoice', this, [duelId, userId, effect]);
  }

  /**
   * Processa a escolha do BrainControl - controlar um monstro face-up do oponente durante o turno
   */
  async processBrainControlChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processBrainControlChoice', this, [duelId, userId, chosenMonsterZoneIndex]);
  }

  /**
   * Revela uma spell que estava em 'set' porque precisava de modal
   */
  private async revealSpellAfterModal(duelId: string, duel: Duel, isPlayer1: boolean, spellTrapZoneIndex: number): Promise<void> {
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (playerField && playerField.spellTrap && playerField.spellTrap[spellTrapZoneIndex]) {
      const spellCard = playerField.spellTrap[spellTrapZoneIndex];

      // Se está em 'set', revelar (mudar para 'face-up')
      if (spellCard.position === 'set') {
        spellCard.position = 'face-up';
        logger.info(`✨ [revealSpellAfterModal] Spell ${spellCard.name || spellCard.cardName} revelada após confirmação do modal`);

        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);

        // Atualizar cache
        this.activeDuels.set(duelId, duel);
      }
    }
  }

  /**
   * Remove uma spell do campo se ela estiver em 'set' (modal cancelado)
   */
  async removeSpellIfSet(duelId: string | number, userId: number, spellTrapZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.spellTrap || !playerField.spellTrap[spellTrapZoneIndex]) {
      return { success: false, message: 'Spell não encontrada no campo' };
    }

    const spellCard = playerField.spellTrap[spellTrapZoneIndex];

    // Só remover se estiver em 'set' (foi colocada temporariamente)
    if (spellCard.position === 'set') {
      // Verificar se precisa de modal (se não precisar, não deve estar em 'set')
      if (this.needsModalBeforeReveal(spellCard, duel, isPlayer1)) {
        // Remover do campo e devolver para a mão
        if (!playerField.hand) {
          playerField.hand = [];
        }
        playerField.hand.push(spellCard);
        playerField.spellTrap[spellTrapZoneIndex] = null;

        logger.info(`🗑️ [removeSpellIfSet] Spell ${spellCard.name || spellCard.cardName} removida do campo e devolvida para a mão (modal cancelado)`);

        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);

        // Atualizar cache
        this.activeDuels.set(duelIdStr, duel);

        return { success: true };
      }
    }

    return { success: false, message: 'Spell não pode ser removida' };
  }

  /**
   * Processa a escolha do monstro para equipar UnitedWeStand
   */
  async processUnitedWeStandChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processUnitedWeStandChoice', this, [duelId, userId, chosenMonsterZoneIndex]);
  }

  /**
   * Processa a escolha do monstro para equipar MagePower
   */
  async processMagePowerChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processMagePowerChoice', this, [duelId, userId, chosenMonsterZoneIndex]);
  }

  /**
   * Efeito do Obelisk the Tormentor: escolher 2 monstros que você controla; destruir esses 2 e todos os monstros do oponente.
   * Uma vez por turno, apenas no seu turno.
   */
  async processObeliskEffect(duelId: string | number, userId: number, sacrificeZoneIndices: [number, number]): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processObeliskEffect', this, [duelId, userId, sacrificeZoneIndices]);
  }

  /**
   * Equipa uma spell equip diretamente da mão para um monstro
   */
  async equipSpellFromHand(duelId: string | number, userId: number, cardId: string, monsterZoneIndex: number, spellTrapZoneIndex: number, instanceId?: string): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Validar índices
    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona de monstro inválido' };
    }
    if (spellTrapZoneIndex < 0 || spellTrapZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona de spell/trap inválido' };
    }

    // Verificar se a carta está na mão
    if (!playerField || !playerField.hand) {
      return { success: false, message: 'Mão do jogador não encontrada' };
    }

    // Buscar carta na mão usando instanceId (prioritário), nome ou idCarta/id/cardId
    // Cartas com mesmo nome são tratadas como iguais
    let cardIndex = -1;
    if (instanceId) {
      // Se temos instanceId, buscar por ele primeiro (mais específico)
      cardIndex = playerField.hand.findIndex((c: any) => c && c.instanceId === instanceId);
    }
    if (cardIndex === -1) {
      // Se não encontrou por instanceId, buscar por nome (cartas com mesmo nome são iguais)
      const card = playerField.hand.find((c: any) => {
        if (!c) return false;
        const cName = (c.name || c.cardName || '').trim().toLowerCase();
        const searchName = (cardId || '').trim().toLowerCase();
        // Tentar encontrar por nome se cardId parece ser um nome
        if (cName && searchName && cName === searchName) {
          return true;
        }
        return false;
      });
      if (card) {
        cardIndex = playerField.hand.indexOf(card);
      }
    }
    if (cardIndex === -1) {
      // Se não encontrou por nome, buscar por idCarta/id/cardId
      cardIndex = playerField.hand.findIndex((c: any) => {
        if (!c) return false;
        const cId = c.idCarta || c.id || c.cardId;
        return cId === cardId || String(cId) === String(cardId);
      });
    }
    if (cardIndex === -1) {
      // Fallback: buscar por nome (United We Stand, Mage Power, etc.) quando id é numérico
      const searchName = (cardId || '').toString().toLowerCase();
      const isNumericId = /^\d+$/.test(searchName);
      if (isNumericId) {
        cardIndex = playerField.hand.findIndex((c: any) => {
          if (!c) return false;
          const cName = (c.name || c.cardName || '').toString().toLowerCase();
          const cId = (c.idCarta || c.id || c.cardId || '').toString().toLowerCase();
          return cName.includes('united we stand') || cName.includes('mage power') ||
                 cId.includes('unitedwestand') || cId.includes('magepower') ||
                 cName.includes('horn of the unicorn') || cName.includes('malevolent nuzzler');
        });
      }
    }

    if (cardIndex === -1) {
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const card = playerField.hand[cardIndex];

    // Verificar se é uma spell equip (por tipo ou por nome/id quando tipo não vem preenchido)
    const cardType = card.type || card.cardType;
    const spellType = card.spellType;
    const cardName = (card.name || card.cardName || '').toString().toLowerCase();
    const cardIdLower = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
    const isEquipByType = cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip');
    const isEquipByNameOrId = cardName.includes('united we stand') || cardName.includes('mage power') ||
      cardIdLower.includes('unitedwestand') || cardIdLower.includes('magepower') ||
      cardName.includes('horn of the unicorn') || cardName.includes('malevolent nuzzler');

    if (!isEquipByType && !isEquipByNameOrId) {
      return { success: false, message: 'Carta não é uma spell equip' };
    }

    // Verificar se o monstro existe e está face-up
    if (!playerField.monsters || !playerField.monsters[monsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const monster = playerField.monsters[monsterZoneIndex];
    if (monster.position === 'set') {
      return { success: false, message: 'Monstro deve estar face-up para equipar spell' };
    }

    // Verificar se a zona de spell/trap está vazia
    if (!playerField.spellTrap) {
      playerField.spellTrap = Array(5).fill(null);
    }
    if (playerField.spellTrap[spellTrapZoneIndex] !== null) {
      return { success: false, message: 'Zona de spell/trap já está ocupada' };
    }

    // Remover carta da mão
    playerField.hand.splice(cardIndex, 1);

    // Colocar spell no campo em face-up
    const spellCard = {
      ...card,
      position: 'face-up'
    };
    playerField.spellTrap[spellTrapZoneIndex] = spellCard;

    // IMPORTANTE: Permitir múltiplos equipamentos - os efeitos se somam
    // Não remover equipamentos anteriores, apenas adicionar o novo

    // Equipar a spell no monstro selecionado
    const spellCardId = spellCard.idCarta || spellCard.id || spellCard.cardId;
    monster.equippedBy = isPlayer1 ? 1 : 2;

    // Inicializar array de equips apenas se não existir (manter equipamentos anteriores)
    if (!monster.equippedCards || !Array.isArray(monster.equippedCards)) {
      monster.equippedCards = [];
    }

    // Criar referência única para este equipamento: cardId:spellTrapZoneIndex
    // Usar instanceId se disponível para distinguir múltiplas cópias da mesma carta
    const cardInstanceId = spellCard.instanceId;
    const uniqueEquipRef = cardInstanceId
      ? `${spellCardId}:${spellTrapZoneIndex}:${cardInstanceId}`
      : `${spellCardId}:${spellTrapZoneIndex}`;

    // Verificar se este equipamento já está no array (evitar duplicatas)
    if (!monster.equippedCards.includes(uniqueEquipRef)) {
      // Adicionar novo equip ao array (múltiplos equipamentos permitidos)
      monster.equippedCards.push(uniqueEquipRef);
      logger.info(`✅ [equipSpellFromHand] Equipamento ${spellCard.name || spellCard.cardName} adicionado ao monstro. Total de equips: ${monster.equippedCards.length}`);
    } else {
      logger.info(`⚠️ [equipSpellFromHand] Equipamento ${spellCard.name || spellCard.cardName} já está equipado neste monstro`);
    }

    // Manter equippedCardId para compatibilidade (último equip adicionado)
    monster.equippedCardId = spellCardId;
    monster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;
    spellCard.equippedToMonsterZoneIndex = monsterZoneIndex;

    // Recalcular bônus total do equipamento ANTES de processar efeito (ATK e DEF)
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);
    logger.info(`🔍 [equipSpellFromHand] ANTES processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, DEF bonus: ${monster.equipmentBonusDef || 0}, equips: ${monster.equippedCards?.length || 0}`);

    // Processar efeito da spell equip (calcula bonus de ATK, etc)
    // O processCardEffect será chamado com o monstro já selecionado
    await this.cardEffectsService.processCardEffect(duelIdStr, duel, isPlayer1, spellCard, spellTrapZoneIndex, monsterZoneIndex);

    // Recalcular TODOS os monstros com equipamentos após adicionar um novo equipamento (ATK e DEF)
    playerField.monsters.forEach((m: any, idx: number) => {
      if (m && m.equippedCards && Array.isArray(m.equippedCards) && m.equippedCards.length > 0) {
        const oldBonus = m.equipmentBonusAtk || 0;
        m.equipmentBonusAtk = this.calculateTotalEquipmentBonus(m, playerField);
        m.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(m, playerField);
        if (oldBonus !== m.equipmentBonusAtk) {
          logger.info(`🔄 [equipSpellFromHand] Recalculado monstro ${idx} (${m.name || m.cardName}) - ATK bonus: ${oldBonus} -> ${m.equipmentBonusAtk}`);
        }
      }
    });

    // Recalcular novamente o monstro específico após processar efeito (pode ter mudado o campo)
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);
    logger.info(`🔍 [equipSpellFromHand] APÓS processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, DEF bonus: ${monster.equipmentBonusDef || 0}, equips: ${monster.equippedCards?.length || 0}`);

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [equipSpellFromHand] Spell equip ${card.name || card.cardName} equipada ao monstro na zona ${monsterZoneIndex}`);

    return { success: true };
  }

  /**
   * Equipa uma spell equip que já está no campo para um monstro
   */
  async equipSpellFromField(duelId: string | number, userId: number, spellTrapZoneIndex: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Validar índices
    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona de monstro inválido' };
    }
    if (spellTrapZoneIndex < 0 || spellTrapZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona de spell/trap inválido' };
    }

    // Verificar se a spell existe no campo
    if (!playerField || !playerField.spellTrap) {
      return { success: false, message: 'Zona de spell/trap não encontrada' };
    }

    const spellCard = playerField.spellTrap[spellTrapZoneIndex];
    if (!spellCard) {
      return { success: false, message: 'Nenhuma carta encontrada na zona de spell/trap especificada' };
    }

    // Verificar se é uma spell equip (por tipo ou por nome/id)
    const cardType = spellCard.type || spellCard.cardType;
    const spellType = spellCard.spellType;
    const cardId = (spellCard.idCarta || spellCard.id || spellCard.cardId || '').toString().toLowerCase();
    const cardName = (spellCard.name || spellCard.cardName || '').toString().toLowerCase();
    const isEquipSpell = (cardType === 'Spell' && (spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip')) ||
                         cardId.includes('unitedwestand') || cardName.includes('united we stand') ||
                         cardId.includes('magepower') || cardName.includes('mage power') ||
                         cardId.includes('hornoftheunicorn') || cardName.includes('horn of the unicorn') ||
                         cardId.includes('malevolentnuzzler') || cardName.includes('malevolent nuzzler');

    if (!isEquipSpell) {
      return { success: false, message: 'Carta não é uma spell equip' };
    }

    // Se a spell estiver set (virada para baixo), virá-la para face-up ao equipar
    if (spellCard.position === 'set') {
      spellCard.position = 'face-up';
    }

    // Verificar se o monstro existe e está face-up
    if (!playerField.monsters || !playerField.monsters[monsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const monster = playerField.monsters[monsterZoneIndex];
    if (monster.position === 'set') {
      return { success: false, message: 'Monstro deve estar face-up para equipar spell' };
    }

    // IMPORTANTE: Permitir múltiplos equipamentos - os efeitos se somam
    // Não remover equipamentos anteriores, apenas adicionar o novo

    // Verificar se a spell já está equipada em outro monstro
    if (spellCard.equippedToMonsterZoneIndex !== undefined && spellCard.equippedToMonsterZoneIndex !== null) {
      return { success: false, message: 'Spell já está equipada em outro monstro' };
    }

    // Equipar a spell no monstro selecionado
    const spellCardId = spellCard.idCarta || spellCard.id || spellCard.cardId;
    monster.equippedBy = isPlayer1 ? 1 : 2;

    // Inicializar array de equips apenas se não existir (manter equipamentos anteriores)
    if (!monster.equippedCards || !Array.isArray(monster.equippedCards)) {
      monster.equippedCards = [];
    }

    // Criar referência única para este equipamento: cardId:spellTrapZoneIndex
    // Usar instanceId se disponível para distinguir múltiplas cópias da mesma carta
    const cardInstanceId = spellCard.instanceId;
    const uniqueEquipRef = cardInstanceId
      ? `${spellCardId}:${spellTrapZoneIndex}:${cardInstanceId}`
      : `${spellCardId}:${spellTrapZoneIndex}`;

    // Verificar se este equipamento já está no array (evitar duplicatas)
    if (!monster.equippedCards.includes(uniqueEquipRef)) {
      // Adicionar novo equip ao array (múltiplos equipamentos permitidos)
      monster.equippedCards.push(uniqueEquipRef);
      logger.info(`✅ [equipSpellFromField] Equipamento ${spellCard.name || spellCard.cardName} adicionado ao monstro. Total de equips: ${monster.equippedCards.length}`);
    } else {
      logger.info(`⚠️ [equipSpellFromField] Equipamento ${spellCard.name || spellCard.cardName} já está equipado neste monstro`);
    }

    // Manter equippedCardId para compatibilidade (último equip adicionado)
    monster.equippedCardId = spellCardId;
    monster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;
    spellCard.equippedToMonsterZoneIndex = monsterZoneIndex;

    // Recalcular bônus total do equipamento ANTES de processar efeito (ATK e DEF)
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);
    logger.info(`🔍 [equipSpellFromField] ANTES processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, DEF bonus: ${monster.equipmentBonusDef || 0}, equips: ${monster.equippedCards?.length || 0}`);

    // Processar efeito da spell equip (calcula bonus de ATK, etc)
    // O processCardEffect será chamado com o monstro já selecionado
    await this.cardEffectsService.processCardEffect(duelIdStr, duel, isPlayer1, spellCard, spellTrapZoneIndex, monsterZoneIndex);

    // Recalcular TODOS os monstros com equipamentos após adicionar um novo equipamento (ATK e DEF)
    playerField.monsters.forEach((m: any, idx: number) => {
      if (m && m.equippedCards && Array.isArray(m.equippedCards) && m.equippedCards.length > 0) {
        const oldBonus = m.equipmentBonusAtk || 0;
        m.equipmentBonusAtk = this.calculateTotalEquipmentBonus(m, playerField);
        m.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(m, playerField);
        if (oldBonus !== m.equipmentBonusAtk) {
          logger.info(`🔄 [equipSpellFromField] Recalculado monstro ${idx} (${m.name || m.cardName}) - ATK bonus: ${oldBonus} -> ${m.equipmentBonusAtk}`);
        }
      }
    });

    // Recalcular novamente o monstro específico após processar efeito (pode ter mudado o campo)
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);
    logger.info(`🔍 [equipSpellFromField] APÓS processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, DEF bonus: ${monster.equipmentBonusDef || 0}, equips: ${monster.equippedCards?.length || 0}`);

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [equipSpellFromField] Spell equip ${spellCard.name || spellCard.cardName} equipada ao monstro na zona ${monsterZoneIndex}`);

    return { success: true };
  }

  /**
   * Recalcula o ATK do Breaker The Magical Warrior baseado nos marcadores de magia
   */
  private async recalculateBreakerAtk(duelId: string, duel: Duel, isPlayer1: boolean): Promise<void> {
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.monsters) return;

    for (let i = 0; i < playerField.monsters.length; i++) {
      const monster = playerField.monsters[i];
      if (!monster) continue;

      const monsterCardId = monster.idCarta || monster.id || monster.cardId || '';
      const isBreaker = this.isExactCard(monster, 'BreakerTheMagicalWarrior');

      if (isBreaker && monster.spellCounters !== undefined) {
        const spellCounters = monster.spellCounters || 0;
        const atkBonus = spellCounters * 300;
        monster.spellCounterBonusAtk = atkBonus;
        logger.info(`📊 [recalculateBreakerAtk] Breaker na zona ${i} - ${spellCounters} marcador(es), ATK bonus: +${atkBonus}`);
      }
    }
  }

  /**
   * Breaker the Magical Warrior: ao usar o efeito, escolhe 1 Spell/Trap no campo e a destrói; perde o bônus de +300 ATK.
   */
  async processBreakerRemoveCounter(duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processBreakerRemoveCounter', this, [duelId, userId, monsterZoneIndex, targetPlayer, targetZoneIndex]);
  }

  /**
   * Processa a escolha de alvo para Mystical Space Typhoon
   */
  async processMysticalSpaceTyphoonChoice(duelId: string | number, userId: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number, spellTrapZoneIndex?: number): Promise<{ success: boolean; message?: string; duel?: Duel }> {
    return this.cardEffectsService.executeAction('processMysticalSpaceTyphoonChoice', this, [duelId, userId, targetPlayer, targetZoneIndex, spellTrapZoneIndex]);
  }

  /**
   * Processa a escolha de alvo do SnowmanEater
   * Destrói o monstro face-up escolhido
   */
  async processSnowmanEaterChoice(duelId: string | number, userId: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processSnowmanEaterChoice', this, [duelId, userId, targetPlayer, targetZoneIndex, monsterZoneIndex]);
  }

  /**
   * Remove equipamento quando monstro é destruído ou quando equipamento é destruído
   */
  private async handleEquipmentDestruction(duelId: string | number, duel: Duel, isPlayer1: boolean, destroyedMonster?: any, destroyedSpellTrap?: any, spellTrapZoneIndex?: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Se um monstro foi destruído, mover TODOS os equipamentos para o cemitério
    if (destroyedMonster) {
      // Inicializar cemitério se não existir
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }

      // Garantir que spellTrap seja um array válido
      if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
        playerField.spellTrap = [null, null, null, null, null];
      }
      while (playerField.spellTrap.length < 5) {
        playerField.spellTrap.push(null);
      }
      playerField.spellTrap = playerField.spellTrap.slice(0, 5);

      const monsterCardId = destroyedMonster.idCarta || destroyedMonster.id || destroyedMonster.cardId;
      logger.info(`💥 [handleEquipmentDestruction] Processando destruição do monstro: ${destroyedMonster.name || destroyedMonster.cardName || monsterCardId}`);

      // Coletar todos os índices de zonas spell/trap que precisam ser verificadas (antes de desvincular o monstro)
      const zonesToCheck: number[] = [];

      // Verificar se o monstro tinha equipamentos (novo sistema: array)
      if (destroyedMonster.equippedCards && Array.isArray(destroyedMonster.equippedCards) && destroyedMonster.equippedCards.length > 0) {
        logger.info(`💥 [handleEquipmentDestruction] Monstro destruído tem ${destroyedMonster.equippedCards.length} equipamento(s) no array - movendo todos para o cemitério`);

        // Processar cada equipamento no array
        destroyedMonster.equippedCards.forEach((equippedCardRef: string, index: number) => {
          // A referência pode ser "cardId:zoneIndex" ou apenas "cardId" (compatibilidade)
          const parts = (equippedCardRef || '').split(':');
          const cardId = parts[0];
          const zoneIndex = parts[1] ? parseInt(parts[1], 10) : destroyedMonster.equippedSpellTrapZoneIndex;

          logger.info(`🔍 [handleEquipmentDestruction] Equip ${index + 1}: ref="${equippedCardRef}", cardId="${cardId}", zoneIndex=${zoneIndex}`);

          // Se temos o índice da zona, adicionar à lista de zonas para verificar
          if (zoneIndex !== undefined && zoneIndex !== null && !isNaN(zoneIndex) && zoneIndex >= 0 && zoneIndex < 5) {
            if (!zonesToCheck.includes(zoneIndex)) {
              zonesToCheck.push(zoneIndex);
            }
          }
        });
      }
      // Sistema antigo: equip único (compatibilidade)
      else if (destroyedMonster.equippedCardId && destroyedMonster.equippedSpellTrapZoneIndex !== undefined && destroyedMonster.equippedSpellTrapZoneIndex !== null) {
        const equippedCardId = destroyedMonster.equippedCardId;
        const equippedSpellTrapZoneIndex = destroyedMonster.equippedSpellTrapZoneIndex;
        logger.info(`💥 [handleEquipmentDestruction] Monstro destruído tem equipamento único: ${equippedCardId} na zona ${equippedSpellTrapZoneIndex}`);

        if (!zonesToCheck.includes(equippedSpellTrapZoneIndex)) {
          zonesToCheck.push(equippedSpellTrapZoneIndex);
        }
      }

      // IMPORTANTE: Desvincular o monstro de todos os equipamentos ANTES de ir para o cemitério.
      // Assim, se o monstro voltar ao campo (reviver/ressuscitar), não volta com ATK/DEF de equip.
      if (destroyedMonster.equippedCards !== undefined) delete destroyedMonster.equippedCards;
      if (destroyedMonster.equippedBy !== undefined) delete destroyedMonster.equippedBy;
      if (destroyedMonster.equippedCardId !== undefined) delete destroyedMonster.equippedCardId;
      if (destroyedMonster.equippedSpellTrapZoneIndex !== undefined) delete destroyedMonster.equippedSpellTrapZoneIndex;
      if (destroyedMonster.equippedZoneIndex !== undefined) delete destroyedMonster.equippedZoneIndex;
      if (destroyedMonster.equipmentBonusAtk !== undefined) delete destroyedMonster.equipmentBonusAtk;
      if (destroyedMonster.equipmentBonusDef !== undefined) delete destroyedMonster.equipmentBonusDef;
      logger.info(`🔗 [handleEquipmentDestruction] Monstro desvinculado de equipamentos (evita bônus ao voltar ao campo)`);

      // Busca alternativa: verificar todas as zonas spell/trap para encontrar equipamentos órfãos
      // Um equipamento é órfão se:
      // 1. É do tipo Equip
      // 2. Está referenciando uma zona de monstro que está vazia (null)
      // Isso garante que mesmo se os dados do monstro não tiverem as referências corretas, ainda encontraremos os equipamentos
      logger.info(`🔍 [handleEquipmentDestruction] Verificando todas as zonas spell/trap para encontrar equipamentos órfãos`);

      for (let i = 0; i < playerField.spellTrap.length; i++) {
        const spellTrapCard = playerField.spellTrap[i];
        if (spellTrapCard && spellTrapCard !== null) {
          const cardId = (spellTrapCard.idCarta || spellTrapCard.id || spellTrapCard.cardId || '').toString().toLowerCase();
          const cardName = (spellTrapCard.name || spellTrapCard.cardName || '').toString().toLowerCase();
          const spellType = spellTrapCard.spellType;
          const isEquipSpell = spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip' ||
                              cardId.includes('unitedwestand') || cardName.includes('united we stand') ||
                              cardId.includes('magepower') || cardName.includes('mage power') ||
                              cardId.includes('prematureburial') || cardName.includes('premature burial') ||
                              cardId.includes('autonomousactionunit') || cardName.includes('autonomous action unit') ||
                              cardId.includes('equip') || cardName.includes('equip');

          if (isEquipSpell) {
            // Verificar se o equipamento está referenciando uma zona de monstro vazia (monstro destruído = equip órfão)
            const equippedToZone = spellTrapCard.equippedToMonsterZoneIndex;

            if (equippedToZone !== undefined && equippedToZone !== null) {
              // Verificar se a zona do monstro está vazia (monstro foi destruído)
              if (!playerField.monsters || !playerField.monsters[equippedToZone] || playerField.monsters[equippedToZone] === null) {
                // Equipamento órfão encontrado - mover para o cemitério
                if (!zonesToCheck.includes(i)) {
                  zonesToCheck.push(i);
                  logger.info(`🔍 [handleEquipmentDestruction] Encontrado equipamento órfão na zona ${i} (referencia zona monstro ${equippedToZone} que está vazia)`);
                }
              }
            }
          }
        }
      }

      // Mover todos os equipamentos encontrados para o cemitério
      let movedCount = 0;
      for (const zoneIndex of zonesToCheck) {
        if (playerField.spellTrap[zoneIndex] !== null && playerField.spellTrap[zoneIndex] !== undefined) {
          const equipCard = playerField.spellTrap[zoneIndex];
          const equipCardId = (equipCard.idCarta || equipCard.id || equipCard.cardId || '').toString().toLowerCase();
          const equipCardName = (equipCard.name || equipCard.cardName || '').toString().toLowerCase();

          // Verificar se é realmente um equipamento (United We Stand, Mage Power, Premature Burial, Autonomous Action Unit, etc)
          const isEquipSpell = equipCard.spellType === 'Equip' || equipCard.spellType === 'EQUIP' || equipCard.spellType === 'equip' ||
                              equipCardId.includes('unitedwestand') || equipCardName.includes('united we stand') ||
                              equipCardId.includes('magepower') || equipCardName.includes('mage power') ||
                              equipCardId.includes('prematureburial') || equipCardName.includes('premature burial') ||
                              equipCardId.includes('autonomousactionunit') || equipCardName.includes('autonomous action unit') ||
                              equipCardId.includes('equip') || equipCardName.includes('equip');

          if (isEquipSpell) {
            // Monstro foi destruído: equipamento vai junto para o cemitério (regra Yu-Gi-Oh!)
            playerField.graveyard.push(equipCard);
            playerField.spellTrap[zoneIndex] = null;
            movedCount++;
            logger.info(`💥 [handleEquipmentDestruction] Equipamento ${equipCard.name || equipCard.cardName || equipCardId} (zona ${zoneIndex}) movido para o cemitério - monstro destruído`);
          } else {
            logger.info(`⚠️ [handleEquipmentDestruction] Carta na zona ${zoneIndex} não é um equipamento: ${equipCardName}`);
          }
        } else {
          logger.info(`⚠️ [handleEquipmentDestruction] Zona ${zoneIndex} está vazia`);
        }
      }

      // Verificação final: após remover o monstro do campo, verificar novamente se há equipamentos órfãos
      // Isso garante que mesmo se os dados do monstro não tiverem as referências corretas, ainda encontraremos os equipamentos
      if (movedCount === 0) {
        logger.info(`🔍 [handleEquipmentDestruction] Nenhum equipamento encontrado nos dados do monstro - fazendo busca final por equipamentos órfãos`);

        // Buscar todos os equipamentos que referenciam zonas de monstros vazias
        for (let i = 0; i < playerField.spellTrap.length; i++) {
          const spellTrapCard = playerField.spellTrap[i];
          if (spellTrapCard && spellTrapCard !== null) {
            const cardId = (spellTrapCard.idCarta || spellTrapCard.id || spellTrapCard.cardId || '').toString().toLowerCase();
            const cardName = (spellTrapCard.name || spellTrapCard.cardName || '').toString().toLowerCase();
            const spellType = spellTrapCard.spellType;
            const isEquipSpell = spellType === 'Equip' || spellType === 'EQUIP' || spellType === 'equip' ||
                                cardId.includes('unitedwestand') || cardName.includes('united we stand') ||
                                cardId.includes('magepower') || cardName.includes('mage power') ||
                                cardId.includes('prematureburial') || cardName.includes('premature burial') ||
                                cardId.includes('autonomousactionunit') || cardName.includes('autonomous action unit') ||
                                cardId.includes('equip') || cardName.includes('equip');

            if (isEquipSpell) {
              const equippedToZone = spellTrapCard.equippedToMonsterZoneIndex;

              // Se o equipamento referencia uma zona de monstro que está vazia (monstro destruído), é órfão → cemitério
              if (equippedToZone !== undefined && equippedToZone !== null) {
                if (!playerField.monsters || !playerField.monsters[equippedToZone] || playerField.monsters[equippedToZone] === null) {
                  // Equipamento órfão encontrado - mover para o cemitério
                  const equipCardName = spellTrapCard.name || spellTrapCard.cardName || cardId;
                  playerField.graveyard.push(spellTrapCard);
                  playerField.spellTrap[i] = null;
                  movedCount++;
                  logger.info(`💥 [handleEquipmentDestruction] Equipamento órfão encontrado e movido: ${equipCardName} (zona ${i}, referencia zona monstro ${equippedToZone} que está vazia)`);
                }
              }
            }
          }
        }
      }

      if (movedCount > 0) {
        logger.info(`✅ [handleEquipmentDestruction] Total de ${movedCount} equipamento(s) movido(s) para o cemitério`);
      } else {
        logger.info(`⚠️ [handleEquipmentDestruction] Nenhum equipamento foi movido para o cemitério`);
      }
    }

    // Se Premature Burial foi destruída, o monstro equipado também vai para o cemitério (e a Premature Burial já foi enviada pelo ramo "monstro destruído" ao processar os equips do monstro)
    if (destroyedSpellTrap && spellTrapZoneIndex !== undefined && spellTrapZoneIndex !== null) {
      const cardId = destroyedSpellTrap.idCarta || destroyedSpellTrap.id || destroyedSpellTrap.cardId;
      const cardName = (destroyedSpellTrap.name || destroyedSpellTrap.cardName || '').toString().toLowerCase();
      const isPrematureBurial = this.isExactCard(destroyedSpellTrap, 'PrematureBurial') ||
        cardName.includes('premature burial') || (String(cardId || '').toLowerCase().includes('prematureburial'));
      if (isPrematureBurial) {
        // Encontrar o monstro equipado: primeiro por equippedToMonsterZoneIndex na carta, depois por busca no campo
        let monster: any = null;
        let equippedToZone: number | null = null;

        const zoneFromCard = destroyedSpellTrap.equippedToMonsterZoneIndex;
        if (playerField?.monsters && zoneFromCard !== undefined && zoneFromCard !== null &&
            zoneFromCard >= 0 && zoneFromCard < playerField.monsters.length && playerField.monsters[zoneFromCard]) {
          monster = playerField.monsters[zoneFromCard];
          equippedToZone = zoneFromCard;
          logger.info(`💥 [handleEquipmentDestruction] Premature Burial: monstro encontrado na zona ${zoneFromCard} (equippedToMonsterZoneIndex)`);
        }

        // Fallback: monstro pode ter equippedSpellTrapZoneIndex === spellTrapZoneIndex (carta pode ter perdido equippedToMonsterZoneIndex ao sincronizar)
        if (!monster && playerField?.monsters) {
          for (let mz = 0; mz < playerField.monsters.length; mz++) {
            const m = playerField.monsters[mz];
            if (!m) continue;
            const hasThisEquip = m.equippedSpellTrapZoneIndex === spellTrapZoneIndex ||
              (m.equippedCards && Array.isArray(m.equippedCards) && m.equippedCards.some((ref: string) => String(ref).includes(`:${spellTrapZoneIndex}`) || String(ref).endsWith(':' + spellTrapZoneIndex)));
            const isPremEquip = (m.equippedCardId && String(m.equippedCardId).toLowerCase().includes('prematureburial')) ||
              (m.equippedCards && m.equippedCards.some((ref: string) => String(ref).toLowerCase().includes('prematureburial')));
            if (hasThisEquip || isPremEquip) {
              monster = m;
              equippedToZone = mz;
              logger.info(`💥 [handleEquipmentDestruction] Premature Burial: monstro encontrado na zona ${mz} (fallback por equippedSpellTrapZoneIndex/equippedCards)`);
              break;
            }
          }
        }

        if (monster && equippedToZone !== null) {
          // Primeiro processar destruição dos equipamentos do monstro (envia Premature Burial e outros equips ao cemitério)
          await this.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);
          // Depois enviar o monstro ao cemitério do DONO ORIGINAL
          const ownerFieldPrem = this.getOwnerFieldForMonster(duel, monster, isPlayer1);
          if (!ownerFieldPrem.graveyard) ownerFieldPrem.graveyard = [];
          const { equipmentBonusAtk, equipmentBonusDef, equippedCards, equippedCardId, equippedSpellTrapZoneIndex, equippedBy, equippedZoneIndex, ...monsterBase } = monster;
          ownerFieldPrem.graveyard.push(monsterBase);
          playerField.monsters[equippedToZone] = null;
          logger.info(`💥 [handleEquipmentDestruction] Premature Burial destruída - monstro equipado ${monster.name || monster.cardName} enviado ao cemitério do dono`);
        } else {
          logger.warn(`⚠️ [handleEquipmentDestruction] Premature Burial destruída mas nenhum monstro equipado encontrado (zona ${spellTrapZoneIndex})`);
        }

        // Garantir que a Premature Burial seja enviada ao cemitério (e zona limpa)
        if (playerField.spellTrap && playerField.spellTrap[spellTrapZoneIndex] !== null && playerField.spellTrap[spellTrapZoneIndex] !== undefined) {
          const prematureBurialCard = playerField.spellTrap[spellTrapZoneIndex];
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(prematureBurialCard);
          playerField.spellTrap[spellTrapZoneIndex] = null;
          logger.info(`💥 [handleEquipmentDestruction] Premature Burial enviada ao cemitério`);
        }
        logger.info(`💥 [handleEquipmentDestruction] Premature Burial: monstro e carta enviados ao cemitério`);
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        return;
      }
    }

    // Se UnitedWeStand ou MagePower foi destruída, remover equipamento de todos os monstros (só ESTA cópia; pode haver 2 United We Stand no mesmo monstro)
    if (destroyedSpellTrap && spellTrapZoneIndex !== undefined && spellTrapZoneIndex !== null) {
      const cardId = destroyedSpellTrap.idCarta || destroyedSpellTrap.id || destroyedSpellTrap.cardId;
      const cardName = (destroyedSpellTrap.name || destroyedSpellTrap.cardName || '').toString().toLowerCase();
      const isUnitedWeStand = this.isExactCard(destroyedSpellTrap, 'UnitedWeStand') ||
        cardName.includes('united we stand') || (String(cardId || '').toLowerCase().includes('unitedwestand'));
      const isMagePower = this.isExactCard(destroyedSpellTrap, 'MagePower') ||
        cardName.includes('mage power') || (String(cardId || '').toLowerCase().includes('magepower'));

      if (isUnitedWeStand) {

        // Encontrar e remover APENAS esta cópia do equipamento (cada United We Stand é independente; pode haver 2 no mesmo monstro)
        if (playerField && playerField.monsters) {
          const uniqueEquipRefShort = `${cardId}:${spellTrapZoneIndex}`;
          const prefixWithZone = `${cardId}:${spellTrapZoneIndex}:`;

          playerField.monsters.forEach((monster: any) => {
            if (monster) {
              // Remover do array de equips se existir (só a ref que corresponde a ESTA carta destruída)
              if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
                const findIndex = () => {
                  const idx = monster.equippedCards.indexOf(uniqueEquipRefShort);
                  if (idx > -1) return idx;
                  return monster.equippedCards.findIndex((ref: string) =>
                    ref === uniqueEquipRefShort || (ref && ref.startsWith(prefixWithZone))
                  );
                };
                const index = findIndex();

                if (index > -1) {
                  const removedRef = monster.equippedCards[index];
                  monster.equippedCards.splice(index, 1);
                  logger.info(`💥 [handleEquipmentDestruction] Removendo UnitedWeStand (${removedRef}) do monstro ${monster.name || monster.cardName} - restam ${monster.equippedCards.length} equip(s)`);

                  // Se não há mais equips, limpar propriedades
                  if (monster.equippedCards.length === 0) {
                    delete monster.equippedBy;
                    delete monster.equippedCardId;
                    delete monster.equippedSpellTrapZoneIndex;
                    delete monster.equipmentBonusAtk;
                    delete monster.equipmentBonusDef;
                    delete monster.equippedCards;
                  } else {
                    // Atualizar equippedCardId para o último equip restante (extrair cardId da referência)
                    const lastEquipRef = monster.equippedCards[monster.equippedCards.length - 1];
                    const lastCardId = lastEquipRef.includes(':') ? lastEquipRef.split(':')[0] : lastEquipRef;
                    monster.equippedCardId = lastCardId;
                    // Recalcular bônus total
                    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
                    monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);
                  }
                }
              } else if (monster.equippedCardId === cardId &&
                         monster.equippedSpellTrapZoneIndex === spellTrapZoneIndex) {
                // Compatibilidade: sistema antigo (equip único)
                logger.info(`💥 [handleEquipmentDestruction] Removendo equipamento UnitedWeStand do monstro ${monster.name || monster.cardName}`);
                delete monster.equippedBy;
                delete monster.equippedCardId;
                delete monster.equippedSpellTrapZoneIndex;
                delete monster.equipmentBonusAtk;
                delete monster.equipmentBonusDef;
              }
            }
          });
        }
      } else if (isMagePower) {

        // Encontrar e remover APENAS esta cópia do equipamento (cada Mage Power é independente)
        if (playerField && playerField.monsters) {
          const uniqueEquipRefShort = `${cardId}:${spellTrapZoneIndex}`;
          const prefixWithZone = `${cardId}:${spellTrapZoneIndex}:`;

          playerField.monsters.forEach((monster: any) => {
            if (monster) {
              // Remover do array de equips se existir (só a ref que corresponde a ESTA carta destruída)
              if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
                const findIndex = () => {
                  const idx = monster.equippedCards.indexOf(uniqueEquipRefShort);
                  if (idx > -1) return idx;
                  return monster.equippedCards.findIndex((ref: string) =>
                    ref === uniqueEquipRefShort || (ref && ref.startsWith(prefixWithZone))
                  );
                };
                const index = findIndex();

                if (index > -1) {
                  const removedRef = monster.equippedCards[index];
                  monster.equippedCards.splice(index, 1);
                  logger.info(`💥 [handleEquipmentDestruction] Removendo MagePower (${removedRef}) do monstro ${monster.name || monster.cardName} - restam ${monster.equippedCards.length} equip(s)`);

                  // Se não há mais equips, limpar propriedades
                  if (monster.equippedCards.length === 0) {
                    delete monster.equippedBy;
                    delete monster.equippedCardId;
                    delete monster.equippedSpellTrapZoneIndex;
                    delete monster.equipmentBonusAtk;
                    delete monster.equipmentBonusDef;
                    delete monster.equippedCards;
                  } else {
                    // Atualizar equippedCardId para o último equip restante (extrair cardId da referência)
                    const lastEquipRef = monster.equippedCards[monster.equippedCards.length - 1];
                    const lastCardId = lastEquipRef.includes(':') ? lastEquipRef.split(':')[0] : lastEquipRef;
                    monster.equippedCardId = lastCardId;
                    // Recalcular bônus total
                    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
                    monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);
                  }
                }
              } else if (monster.equippedCardId === cardId &&
                         monster.equippedSpellTrapZoneIndex === spellTrapZoneIndex) {
                // Compatibilidade: sistema antigo (equip único)
                logger.info(`💥 [handleEquipmentDestruction] Removendo equipamento MagePower do monstro ${monster.name || monster.cardName}`);
                delete monster.equippedBy;
                delete monster.equippedCardId;
                delete monster.equippedSpellTrapZoneIndex;
                delete monster.equipmentBonusAtk;
                delete monster.equipmentBonusDef;
              }
            }
          });
        }
      }
    }

    // Recalcular ATK de todos os monstros equipados com UnitedWeStand ou MagePower
    await this.recalculateUnitedWeStandAtk(duelId, duel, isPlayer1);
    await this.recalculateMagePowerAtk(duelId, duel, isPlayer1);

    // Atualizar no banco após recalcular
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
  }

  /**
   * Remove o equipamento anterior de um monstro antes de equipar um novo
   * Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
   */
  private async removePreviousEquipment(duelId: string | number, duel: Duel, isPlayer1: boolean, monster: any): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!monster) return;

    // Inicializar cemitério se não existir
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }

    // Garantir que spellTrap seja um array válido
    if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
      playerField.spellTrap = [null, null, null, null, null];
    }
    while (playerField.spellTrap.length < 5) {
      playerField.spellTrap.push(null);
    }
    playerField.spellTrap = playerField.spellTrap.slice(0, 5);

    // Verificar se o monstro tem equipamentos (novo sistema: array)
    if (monster.equippedCards && Array.isArray(monster.equippedCards) && monster.equippedCards.length > 0) {
      logger.info(`🔄 [removePreviousEquipment] Removendo ${monster.equippedCards.length} equipamento(s) anterior(es) do monstro ${monster.name || monster.cardName}`);

      // Processar cada equipamento no array
      monster.equippedCards.forEach((equippedCardRef: string) => {
        // A referência pode ser "cardId:zoneIndex" ou apenas "cardId" (compatibilidade)
        const parts = (equippedCardRef || '').split(':');
        const cardId = parts[0];
        const zoneIndex = parts[1] ? parseInt(parts[1], 10) : monster.equippedSpellTrapZoneIndex;

        // Se temos o índice da zona, mover o equipamento para o cemitério
        if (zoneIndex !== undefined && zoneIndex !== null && !isNaN(zoneIndex) && zoneIndex >= 0 && zoneIndex < 5) {
          const equipCard = playerField.spellTrap[zoneIndex];
          if (equipCard && equipCard !== null) {
            const equipCardName = equipCard.name || equipCard.cardName || cardId;
            playerField.graveyard.push(equipCard);
            playerField.spellTrap[zoneIndex] = null;
            logger.info(`💥 [removePreviousEquipment] Equipamento anterior ${equipCardName} (zona ${zoneIndex}) movido para o cemitério`);
          }
        }
      });

      // Limpar todas as referências de equipamento do monstro
      delete monster.equippedBy;
      delete monster.equippedCardId;
      delete monster.equippedSpellTrapZoneIndex;
      delete monster.equipmentBonusAtk;
      delete monster.equipmentBonusDef;
      monster.equippedCards = [];
    }
    // Sistema antigo: equip único (compatibilidade)
    else if (monster.equippedCardId && monster.equippedSpellTrapZoneIndex !== undefined && monster.equippedSpellTrapZoneIndex !== null) {
      const equippedCardId = monster.equippedCardId;
      const equippedSpellTrapZoneIndex = monster.equippedSpellTrapZoneIndex;

      logger.info(`🔄 [removePreviousEquipment] Removendo equipamento anterior único: ${equippedCardId} (zona ${equippedSpellTrapZoneIndex})`);

      if (equippedSpellTrapZoneIndex >= 0 && equippedSpellTrapZoneIndex < 5) {
        const equipCard = playerField.spellTrap[equippedSpellTrapZoneIndex];
        if (equipCard && equipCard !== null) {
          const equipCardName = equipCard.name || equipCard.cardName || equippedCardId;
          playerField.graveyard.push(equipCard);
          playerField.spellTrap[equippedSpellTrapZoneIndex] = null;
          logger.info(`💥 [removePreviousEquipment] Equipamento anterior ${equipCardName} (zona ${equippedSpellTrapZoneIndex}) movido para o cemitério`);
        }
      }

      // Limpar todas as referências de equipamento do monstro
      delete monster.equippedBy;
      delete monster.equippedCardId;
      delete monster.equippedSpellTrapZoneIndex;
      delete monster.equipmentBonusAtk;
      delete monster.equipmentBonusDef;
    }
    // Mage Power: uma spell/trap (equipamento) foi removida do campo
    await this.recalculateMagePowerAtk(duelId, duel, isPlayer1);
  }

  /**
   * Calcula o bônus de ATK total de todos os equipamentos de um monstro
   * Múltiplos equipamentos são permitidos e seus efeitos se somam
   */
  private calculateTotalEquipmentBonus(monster: any, playerField: any): number {
    if (!monster) return 0;

    let totalBonus = 0;

    // Suportar array de equips (novo sistema) ou equippedCardId único (compatibilidade)
    const equippedCards: string[] = [];

    if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
      // Novo sistema: array de equips (múltiplos equipamentos permitidos)
      equippedCards.push(...monster.equippedCards);
      logger.info(`🔍 [calculateTotalEquipmentBonus] Array de equips encontrado: ${monster.equippedCards.length} equipamento(s) - ${monster.equippedCards.join(', ')}`);
    } else if (monster.equippedCardId) {
      // Sistema antigo: equip único (compatibilidade)
      equippedCards.push(monster.equippedCardId);
      logger.info(`🔍 [calculateTotalEquipmentBonus] Equip único (compatibilidade): ${monster.equippedCardId}`);
    } else {
      logger.info(`🔍 [calculateTotalEquipmentBonus] Nenhum equipamento encontrado no monstro`);
    }

    logger.info(`🔍 [calculateTotalEquipmentBonus] Monstro: ${monster.name || monster.cardName}, Total de equips a processar: ${equippedCards.length} (${equippedCards.join(', ')})`);

    // Calcular bônus do equipamento (múltiplos equipamentos - efeitos se somam)
    // IMPORTANTE: Cada equipamento calcula seu próprio bônus baseado no estado atual do campo
    // Os bônus são somados para obter o total
    equippedCards.forEach((equippedCardRef: string, index: number) => {
      // A referência pode ser "cardId:zoneIndex:instanceId" ou "cardId:zoneIndex" ou apenas "cardId" (compatibilidade)
      const parts = (equippedCardRef || '').split(':');
      const cardId = parts[0];
      const zoneIndex = parts[1] ? parseInt(parts[1], 10) : null;
      const instanceId = parts[2] || null;
      const cardIdLower = String(cardId || '').toLowerCase();
      // Se o id for numérico (ex.: id do banco), reconhecer United We Stand pela carta na zona spell/trap
      let cardInZone = (zoneIndex != null && playerField?.spellTrap?.[zoneIndex]) ? playerField.spellTrap[zoneIndex] : null;
      // Fallback: se zoneIndex ausente/inválido, buscar carta pelo cardId em todas as zonas spell/trap
      if (!cardInZone && playerField?.spellTrap && Array.isArray(playerField.spellTrap)) {
        cardInZone = playerField.spellTrap.find((c: any) =>
          c && (String(c.id || '') === String(cardId) || String(c.idCarta || '') === String(cardId) || String(c.cardId || '') === String(cardId))
        ) || null;
      }
      const cardNameLower = (cardInZone?.name || cardInZone?.cardName || '').toString().toLowerCase();
      const idCartaLower = (cardInZone?.idCarta || cardInZone?.cardId || '').toString().toLowerCase();
      const isUnitedWeStand = cardIdLower.includes('unitedwestand') ||
        cardNameLower.includes('united we stand') || cardNameLower.includes('unitedwestand') ||
        idCartaLower.includes('unitedwestand');
      const isMagePower = cardIdLower.includes('magepower') ||
        cardNameLower.includes('mage power') || cardNameLower.includes('magepower') ||
        idCartaLower.includes('magepower');

      logger.info(`🔍 [calculateTotalEquipmentBonus] Processando equipamento [${index + 1}/${equippedCards.length}]: ref="${equippedCardRef}", cardId="${cardId}", zoneIndex=${zoneIndex}, isUnitedWeStand=${isUnitedWeStand}, isMagePower=${isMagePower}`);

      // UnitedWeStand: +800 ATK por cada monstro face-up no campo
      if (isUnitedWeStand) {
        const faceUpMonsters = playerField?.monsters?.filter((m: any) =>
          m !== null && m !== undefined && (m.position === 'attack' || m.position === 'defense')
        ) || [];
        const bonusAtk = faceUpMonsters.length * 800;
        totalBonus += bonusAtk;
        logger.info(`📊 [calculateTotalEquipmentBonus] [${index + 1}/${equippedCards.length}] UnitedWeStand (${equippedCardRef}): ${faceUpMonsters.length} monstros face-up × 800 = +${bonusAtk} ATK (total acumulado: ${totalBonus})`);
      }

      // MagePower: +500 ATK por cada Magia/Armadilha na zona spell/trap do meu campo
      if (isMagePower) {
        // Garantir que spellTrap seja um array válido
        if (!playerField?.spellTrap || !Array.isArray(playerField.spellTrap)) {
          playerField.spellTrap = [null, null, null, null, null];
        }
        while (playerField.spellTrap.length < 5) {
          playerField.spellTrap.push(null);
        }
        playerField.spellTrap = playerField.spellTrap.slice(0, 5);

        const spellTrapCards = playerField.spellTrap.filter((card: any) =>
          card !== null && card !== undefined
        ) || [];
        // Cada MagePower dá +500 por carta spell/trap
        const bonusAtk = spellTrapCards.length * 500;
        totalBonus += bonusAtk;
        logger.info(`📊 [calculateTotalEquipmentBonus] [${index + 1}/${equippedCards.length}] MagePower (${equippedCardRef}): ${spellTrapCards.length} cartas spell/trap × 500 = +${bonusAtk} ATK (total acumulado: ${totalBonus})`);
        logger.info(`🔍 [calculateTotalEquipmentBonus] Spell/Trap cards: ${spellTrapCards.map((c: any) => c?.name || 'null').join(', ')}`);
      }

      // Archfiend of Gilfer: -500 ATK
      const isArchfiendOfGilfer = cardIdLower.includes('archfiendofgilfer') ||
        cardIdLower.includes('ygopro_50287060') ||
        cardIdLower.includes('50287060') ||
        cardNameLower.includes('archfiend of gilfer') ||
        cardNameLower.includes('arquidemonio de gilfer') ||
        cardNameLower.includes('arquidemônio de gilfer') ||
        idCartaLower.includes('archfiendofgilfer') ||
        idCartaLower.includes('ygopro_50287060') ||
        idCartaLower.includes('50287060');

      if (isArchfiendOfGilfer) {
        const bonusAtk = -500;
        totalBonus += bonusAtk;
        logger.info(`📊 [calculateTotalEquipmentBonus] [${index + 1}/${equippedCards.length}] Archfiend of Gilfer (${equippedCardRef}): -500 ATK (total acumulado: ${totalBonus})`);
      }
    });

    logger.info(`✅ [calculateTotalEquipmentBonus] Monstro ${monster.name || monster.cardName} - Bônus total final: +${totalBonus} ATK`);
    return totalBonus;
  }

  /**
   * Calcula o bônus de DEF total dos equipamentos.
   * United We Stand: +800 DEF por cada monstro face-up no campo.
   * Mage Power: +500 DEF por cada Magia/Armadilha no campo.
   */
  private calculateTotalEquipmentBonusDef(monster: any, playerField: any): number {
    if (!monster) return 0;
    const equippedCards: string[] = [];
    if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
      equippedCards.push(...monster.equippedCards);
    } else if (monster.equippedCardId) {
      equippedCards.push(monster.equippedCardId);
    } else {
      return 0;
    }
    let totalDefBonus = 0;
    equippedCards.forEach((equippedCardRef: string) => {
      const parts = (equippedCardRef || '').split(':');
      const cardId = (parts[0] || '').toLowerCase();
      const zoneIndex = parts[1] != null ? parseInt(parts[1], 10) : null;
      let cardInZone = (zoneIndex != null && playerField?.spellTrap?.[zoneIndex]) ? playerField.spellTrap[zoneIndex] : null;
      if (!cardInZone && playerField?.spellTrap?.length) {
        cardInZone = playerField.spellTrap.find((c: any) =>
          c && (String(c.id || '') === String(parts[0]) || String(c.idCarta || '') === String(parts[0]) || String(c.cardId || '') === String(parts[0]))
        ) || null;
      }
      const cardNameLower = (cardInZone?.name || cardInZone?.cardName || '').toString().toLowerCase();
      const idCartaLower = (cardInZone?.idCarta || cardInZone?.cardId || '').toString().toLowerCase();
      const isUnitedWeStand = cardId.includes('unitedwestand') || cardNameLower.includes('united we stand') || cardNameLower.includes('unitedwestand') || idCartaLower.includes('unitedwestand');
      const isMagePower = cardId.includes('magepower') || cardNameLower.includes('mage power') || cardNameLower.includes('magepower') || idCartaLower.includes('magepower');
      if (isUnitedWeStand) {
        const faceUpMonsters = playerField?.monsters?.filter((m: any) =>
          m !== null && m !== undefined && (m.position === 'attack' || m.position === 'defense')
        ) || [];
        totalDefBonus += faceUpMonsters.length * 800;
      }
      if (isMagePower) {
        if (!playerField?.spellTrap || !Array.isArray(playerField.spellTrap)) {
          playerField.spellTrap = [null, null, null, null, null];
        }
        const spellTrapCards = playerField.spellTrap.filter((c: any) => c != null);
        totalDefBonus += spellTrapCards.length * 500;
      }
    });
    return totalDefBonus;
  }

  /**
   * Recalcula o ATK bonus de monstros equipados com UnitedWeStand
   * Recalcula para um jogador específico
   */
  private async recalculateUnitedWeStandAtk(duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<void> {
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.monsters) return;

    // Contar monstros face-up
    const faceUpMonsters = playerField.monsters.filter((m: any) =>
      m !== null && m !== undefined && (m.position === 'attack' || m.position === 'defense')
    ) || [];

    logger.debug(`📊 [recalculateUnitedWeStandAtk] Player ${isPlayer1 ? 1 : 2} - Monstros face-up: ${faceUpMonsters.length}`);

    let updatedCount = 0;

    // Recalcular bônus total de TODOS os monstros (apenas um equipamento por vez)
    // Isso garante que UnitedWeStand e MagePower sejam recalculados corretamente
    playerField.monsters.forEach((monster: any, index: number) => {
      if (monster) {
        const oldBonus = monster.equipmentBonusAtk || 0;
        const newBonus = this.calculateTotalEquipmentBonus(monster, playerField);

        // Sempre atualizar, mesmo se o valor for o mesmo, para garantir consistência
        monster.equipmentBonusAtk = newBonus;
        monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);

        if (oldBonus !== newBonus) {
          updatedCount++;
          logger.debug(`📊 [recalculateUnitedWeStandAtk] Monstro ${index} (${monster.name || monster.cardName}) - ATK bonus atualizado: ${oldBonus} -> +${newBonus}`);
        }
      }
    });

    // OTIMIZAÇÃO: Só atualizar banco se realmente houve mudança significativa
    // O updateDuelInDatabase será chamado pela função que invocou recalculateUnitedWeStandAtk
    if (updatedCount > 0) {
      logger.debug(`✅ [recalculateUnitedWeStandAtk] ${updatedCount} monstro(s) atualizado(s), ${faceUpMonsters.length} monstro(s) face-up no campo`);
    }
  }

  /**
   * Recalcula UnitedWeStand e MagePower para ambos os jogadores (quando monstros ou spell/trap mudam)
   */
  private async recalculateUnitedWeStandForBothPlayers(duelId: string | number, duel: Duel): Promise<void> {
    logger.info(`🔄 [recalculateUnitedWeStandForBothPlayers] Recalculando UnitedWeStand e MagePower para ambos os jogadores`);
    await this.recalculateUnitedWeStandAtk(duelId, duel, true);
    await this.recalculateUnitedWeStandAtk(duelId, duel, false);
    await this.recalculateMagePowerAtk(duelId, duel, true);
    await this.recalculateMagePowerAtk(duelId, duel, false);
  }

  /**
   * Recalcula o ATK bonus de monstros equipados com MagePower
   * IMPORTANTE: Este método recalcula o equipamento de TODOS os monstros
   */
  private async recalculateMagePowerAtk(duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<void> {
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.monsters) return;

    // Garantir que spellTrap seja um array válido
    if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
      playerField.spellTrap = [null, null, null, null, null];
    }
    while (playerField.spellTrap.length < 5) {
      playerField.spellTrap.push(null);
    }
    playerField.spellTrap = playerField.spellTrap.slice(0, 5);

    // Contar TODAS as cartas na zona de spell/trap (face-up ou face-down, incluindo a própria MagePower)
    const spellTrapCards = playerField.spellTrap.filter((card: any) =>
      card !== null && card !== undefined
    );

    logger.debug(`🔄 [recalculateMagePowerAtk] Player ${isPlayer1 ? 1 : 2} - ${spellTrapCards.length} carta(s) spell/trap no campo`);

    let updatedCount = 0;

    // Recalcular bônus total de TODOS os monstros (apenas um equipamento por vez)
    playerField.monsters.forEach((monster: any, index: number) => {
      if (monster) {
        const oldBonus = monster.equipmentBonusAtk || 0;
        const equippedCardsCount = monster.equippedCards?.length || 0;

        // Calcular novo bônus do equipamento
        const newBonus = this.calculateTotalEquipmentBonus(monster, playerField);

        // Sempre atualizar, mesmo se o valor for o mesmo, para garantir consistência
        monster.equipmentBonusAtk = newBonus;
        monster.equipmentBonusDef = this.calculateTotalEquipmentBonusDef(monster, playerField);

        if (oldBonus !== newBonus) {
          updatedCount++;
          logger.debug(`📊 [recalculateMagePowerAtk] Monstro ${index} (${monster.name || monster.cardName}) - ATK bonus atualizado: ${oldBonus} -> +${newBonus}`);
        }
      }
    });

    // OTIMIZAÇÃO: Só atualizar banco se realmente houve mudança significativa
    // O updateDuelInDatabase será chamado pela função que invocou recalculateMagePowerAtk
    if (updatedCount > 0) {
      logger.debug(`✅ [recalculateMagePowerAtk] ${updatedCount} monstro(s) atualizado(s), ${spellTrapCards.length} carta(s) spell/trap no campo`);
    }
  }

  /**
   * Processa um ataque de monstro
   * @param duelId - ID do duelo
   * @param userId - ID do jogador que está atacando
   * @param attackerZoneIndex - Índice da zona do monstro atacante
   * @param targetZoneIndex - Índice da zona do monstro alvo (null para ataque direto)
   * @returns Resultado do ataque
   */
  async attackMonster(
    duelId: string | number,
    userId: number,
    attackerZoneIndex: number,
    targetZoneIndex: number | null
  ): Promise<{ success: boolean; message?: string; damage?: number; destroyed?: boolean }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    logger.debug(`⚔️ [attackMonster] Ataque iniciado: duelId=${duelIdStr}, userId=${userId}, attackerZone=${attackerZoneIndex}, targetZone=${targetZoneIndex}`);

    // Variável para rastrear se o Fiber Jar foi ativado durante este ataque
    let fiberJarActivated = false;

    // Buscar duelo do banco
    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    // Verificar se é o turno do jogador e está na fase BATTLE
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    if (duel.currentPhase !== TurnPhase.BATTLE) {
      return { success: false, message: 'Você só pode atacar na fase de batalha' };
    }

    // Verificar e ativar Waboku automaticamente se o oponente tiver setada
    const wabokuActivated = await this.checkAndActivateWaboku(duelId, duel, isPlayer1);
    if (wabokuActivated) {
      // Re-buscar o duelo após ativar Waboku
      duel = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duel) {
        return { success: false, message: 'Duelo não encontrado' };
      }
    }

    let attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    let defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se SwordsOfRevealingLight está bloqueando ataques
    // A carta fica no campo de quem a ativou (quem está sendo defendido), então verificamos no defenderField
    if (defenderField && defenderField.spellTrap && Array.isArray(defenderField.spellTrap)) {
      for (const spellTrap of defenderField.spellTrap) {
        if (spellTrap && spellTrap !== null && spellTrap.position === 'face-up') {
          const isSwordsOfRevealingLight = this.duelUtils.isSwordsOfRevealingLight(spellTrap);

          if (isSwordsOfRevealingLight) {
            // Verificar se ainda está dentro dos 3 turnos do oponente
            const currentTurnCounter = duel.turnCounter || 1;
            const currentTurn = duel.currentTurn; // 1 = Player1, 2 = Player2
            const activationTurnCounter = spellTrap.activationTurnCounter;
            const activatedByPlayer1 = spellTrap.activatedByPlayer1;

            // Se não tem informações de ativação, bloquear por segurança
            if (!activationTurnCounter || activatedByPlayer1 === undefined) {
              logger.info(`🛡️ [attackMonster] SwordsOfRevealingLight bloqueando ataque (sem info de ativação)`);
              return { success: false, message: 'SwordsOfRevealingLight está bloqueando seus ataques!' };
            }

            // Determinar qual é o turno do oponente
            // Se Player1 ativou (activatedByPlayer1 = true), o oponente é Player2 (turn=2)
            // Se Player2 ativou (activatedByPlayer1 = false), o oponente é Player1 (turn=1)
            const opponentTurn = activatedByPlayer1 ? 2 : 1;

            // Só bloquear se estamos no turno do oponente
            if (currentTurn === opponentTurn) {
              // Calcular quantos turnos do oponente passaram desde a ativação
              // turnCounter incrementa a cada turno (não alterna)
              // Se ativou no turnCounter X:
              // - turnCounter X+1: primeiro turno do oponente (se ativou no turno do outro jogador)
              // - turnCounter X+3: segundo turno do oponente
              // - turnCounter X+5: terceiro turno do oponente
              const turnsSinceActivation = currentTurnCounter - activationTurnCounter;

              // Contar apenas turnos do oponente
              // Se a diferença é ímpar e estamos no turno do oponente, significa que já passou pelo menos 1 turno do oponente
              // Fórmula: se ativou no turnCounter X e estamos no turnCounter Y no turno do oponente:
              // - Se ativou no turno do outro jogador: turnos do oponente = Math.floor((Y - X) / 2) + 1
              // - Se ativou no turno do oponente: turnos do oponente = Math.floor((Y - X) / 2) + 1 (mas só conta a partir do próximo turno)

              // Simplificação: contar turnos do oponente desde a ativação
              // Se ativou no turnCounter X no turno T, e estamos no turnCounter Y no turno O (oponente):
              // - Se T != O (ativou no turno do outro jogador): turnos do oponente = Math.floor((Y - X) / 2) + 1
              // - Se T == O (ativou no turno do oponente): turnos do oponente = Math.floor((Y - X) / 2)

              const activationTurn = spellTrap.activationTurn; // 1 ou 2
              const activatedInOpponentTurn = activationTurn === opponentTurn;

              let opponentTurnsSinceActivation: number;
              if (activatedInOpponentTurn) {
                // Ativou no turno do oponente, então só conta a partir do próximo turno do oponente
                opponentTurnsSinceActivation = Math.floor((turnsSinceActivation) / 2);
              } else {
                // Ativou no turno do outro jogador, então o próximo turno já é do oponente
                opponentTurnsSinceActivation = Math.floor((turnsSinceActivation) / 2) + 1;
              }

              // Se ainda não passaram 3 turnos do oponente, bloquear
              if (opponentTurnsSinceActivation < 3) {
                logger.info(`🛡️ [attackMonster] SwordsOfRevealingLight bloqueando ataque - turnos do oponente desde ativação: ${opponentTurnsSinceActivation}/3 (turnCounter: ${activationTurnCounter} -> ${currentTurnCounter})`);
                return { success: false, message: 'SwordsOfRevealingLight está bloqueando seus ataques!' };
              } else {
                logger.info(`ℹ️ [attackMonster] SwordsOfRevealingLight expirou - ${opponentTurnsSinceActivation} turnos do oponente passaram`);
              }
            } else {
              // Não estamos no turno do oponente, então não deve bloquear
              logger.info(`ℹ️ [attackMonster] SwordsOfRevealingLight presente mas não está no turno do oponente (currentTurn: ${currentTurn}, opponentTurn: ${opponentTurn})`);
            }
          }
        }
      }
    }

    if (!attackerField || !attackerField.monsters) {
      return { success: false, message: 'Campo do atacante não encontrado' };
    }

    // Verificar se o monstro atacante existe e está em posição de ataque
    let attacker = attackerField.monsters[attackerZoneIndex];
    if (!attacker || attacker.position !== 'attack') {
      return { success: false, message: 'Monstro atacante inválido ou não está em posição de ataque' };
    }

    // Obelisk the Tormentor: se usou o efeito neste turno, não pode atacar
    const turnCounterForAttack = (duel as any).turnCounter ?? 1;
    if (this.isObeliskTheTormentor(attacker) && attackerField.obeliskEffectUsedTurn === turnCounterForAttack) {
      return { success: false, message: 'Obelisk the Tormentor não pode atacar neste turno pois usou seu efeito.' };
    }

    // Verificar se ChaosSorcerer não pode atacar (efeito usado neste turno)
    if (attacker.cannotAttackThisTurn === true) {
      return { success: false, message: 'ChaosSorcerer não pode atacar no turno em que você ativar seu efeito!' };
    }

    // Verificar se é MatazaTheZapper, CyberTwinDragon ou BLS (podem atacar 2 vezes em certas condições)
    const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
    const attackerName = (attacker.name || attacker.cardName || '').toLowerCase();
    const isMatazaTheZapper = attackerCardId === 'MatazaTheZapper' ||
                              attackerCardId === 'matazathezapper' ||
                              attackerName === 'mataza the zapper' ||
                              attackerName === 'matazathezapper' ||
                              this.isExactCard(attacker, 'MatazaTheZapper');
    const isCyberTwinDragon = attackerCardId === 'CyberTwinDragon' ||
                              attackerCardId === 'cybertwindragon' ||
                              attackerCardId === 'Cyber-TwinDragon' ||
                              attackerCardId === 'CyberTwin-Dragon' ||
                              attackerName === 'cyber twin dragon' ||
                              attackerName === 'cyber-twin dragon' ||
                              attackerName === 'cybertwindragon' ||
                              this.isExactCard(attacker, 'CyberTwinDragon');
    const isBlackLusterSoldier = this.isExactCard(attacker, 'BlackLusterSoldierEnvoyOfTheBeginning') ||
      (typeof attackerName === 'string' && attackerName.includes('black luster soldier'));

    // Inicializar contador de ataques se não existir
    if (attacker.attacksThisTurn === undefined || attacker.attacksThisTurn === null) {
      attacker.attacksThisTurn = 0;
    }

    // Inicializar attackedThisTurn se não existir (para compatibilidade)
    if (attacker.attackedThisTurn === undefined || attacker.attackedThisTurn === null) {
      attacker.attackedThisTurn = false;
    }

    // Verificar se o monstro já atacou o máximo permitido neste turno
    // BLS: 2 ataques se destruiu um monstro em batalha este turno (canAttackAgainThisTurn)
    const maxAttacksBLS = (isBlackLusterSoldier && attacker.canAttackAgainThisTurn === true) ? 2 : 1;
    const maxAttacks = (isMatazaTheZapper || isCyberTwinDragon) ? 2 : maxAttacksBLS;
    logger.debug(`🔍 [attackMonster] Verificando ataques - ${attacker.name || attacker.cardName}, attacksThisTurn: ${attacker.attacksThisTurn}, maxAttacks: ${maxAttacks}`);

    if (attacker.attacksThisTurn >= maxAttacks) {
      const message = isMatazaTheZapper
        ? 'Mataza The Zapper já atacou 2 vezes neste turno!'
        : isCyberTwinDragon
        ? 'Cyber Twin Dragon já atacou 2 vezes neste turno!'
        : 'Este monstro já atacou neste turno. Cada monstro só pode atacar uma vez por turno!';
      logger.info(`❌ [attackMonster] Bloqueando ataque - ${message}`);
      return { success: false, message };
    }

    logger.debug(`✅ [attackMonster] Ataque permitido - ${attacker.name || attacker.cardName} (${attacker.attacksThisTurn}/${maxAttacks})`);

    // Re-obter referências
    attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se o atacante ainda existe e está em posição de ataque
    attacker = attackerField?.monsters?.[attackerZoneIndex];
    if (!attacker || attacker.position !== 'attack') {
      logger.info(`🪞 [attackMonster] Ataque cancelado - monstro atacante foi destruído ou banido`);
      return { success: false, message: 'Seu monstro atacante foi destruído ou banido.' };
    }

    // Calcular ATK total do atacante (base + equipamentos + efeitos que aumentam ATK)
    const attackerAtk = this.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase);

    // Verificar se há monstros no campo do oponente
    const opponentMonsters = defenderField.monsters || [];
    const hasOpponentMonsters = opponentMonsters.some((m: any) => m !== null && m !== undefined);

    // Ataque direto: se targetZoneIndex é null ou -1, atacar diretamente os LP do oponente
    // REGRA: Só é permitido se o oponente NÃO tiver monstros no campo
    if (targetZoneIndex === null || targetZoneIndex === -1) {
      // Verificar se o oponente tem monstros no campo
      if (hasOpponentMonsters) {
        return { success: false, message: 'Você não pode atacar diretamente enquanto o oponente tiver monstros no campo!' };
      }

      // Ataque direto: Negate Attack / Magic Cylinder primeiro, depois Mirror Force e Dimensional Prison
      const negateAttackDirect = await this.checkAndActivateNegateAttack(
        duelId,
        duel,
        isPlayer1,
        attackerZoneIndex,
        attacker,
      );
      if (negateAttackDirect) {
        logger.info(`🛡️ [attackMonster] Ataque direto negado - Negate Attack`);
        return {
          success: false,
          message: 'Negate Attack foi ativada! O ataque foi negado e a Battle Phase encerrou.',
        };
      }

      const heroBarrierDirect = await this.checkAndActivateHeroBarrier(
        duelId,
        duel,
        isPlayer1,
        attackerZoneIndex,
        attacker,
      );
      if (heroBarrierDirect) {
        logger.info(`🛡️ [attackMonster] Ataque direto negado - Hero Barrier`);
        return {
          success: false,
          message: 'Hero Barrier foi ativada! O ataque foi negado.',
        };
      }

      const magicCylinderActivated = await this.checkAndActivateMagicCylinder(duelId, duel, isPlayer1, attackerZoneIndex, attacker);
      if (magicCylinderActivated) {
        logger.info(`🪄 [attackMonster] Ataque direto negado - Magic Cylinder foi ativada`);
        return { success: false, message: 'Magic Cylinder foi ativada! O ataque foi negado e você recebeu dano igual ao ATK do monstro atacante.' };
      }

      const mirrorForceActivated = await this.checkAndActivateMirrorForce(duelId, duel, isPlayer1);
      if (mirrorForceActivated) {
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (duel) {
          const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
          if (!updatedAttacker || updatedAttacker.position !== 'attack') {
            logger.info(`🪞 [attackMonster] Ataque direto cancelado - Mirror Force destruiu o monstro atacante`);
            return { success: false, message: 'Mirror Force foi ativada! Todos os seus monstros em modo de ataque foram destruídos.' };
          }
        }
      }

      if (!duel) {
        return { success: false, message: 'Duelo não encontrado' };
      }
      const dimensionalPrisonActivated = await this.checkAndActivateDimensionalPrison(duelId, duel, isPlayer1, attackerZoneIndex);
      if (dimensionalPrisonActivated) {
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (duel) {
          const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
          if (!updatedAttacker) {
            logger.info(`🚪 [attackMonster] Ataque direto cancelado - Dimensional Prison baniu o monstro atacante`);
            return { success: false, message: 'Dimensional Prison foi ativada! Seu monstro atacante foi banido do jogo.' };
          }
        }
      }

      // Re-buscar o duelo após verificar traps
      duel = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duel) {
        return { success: false, message: 'Duelo não encontrado' };
      }
      attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      attacker = attackerField?.monsters?.[attackerZoneIndex];
      if (!attacker || attacker.position !== 'attack') {
        return { success: false, message: 'Seu monstro atacante foi destruído ou banido.' };
      }

      // Ring of Destruction: ataque direto = o defensor iria sofrer dano de batalha (sem Waboku)
      const defenderFieldForRingDirect = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
      const wabokuBlocksRingDirect = defenderFieldForRingDirect && defenderFieldForRingDirect.wabokuActiveThisTurn === true;
      if (!wabokuBlocksRingDirect) {
        const ringDirect = await this.checkAndActivateRingOfDestruction(
          duelId,
          duel,
          isPlayer1,
          attackerZoneIndex,
          attacker,
        );
        if (ringDirect) {
          const duelAfterRingDirect = await this.findDuelByIdFromDatabase(duelIdStr);
          if (duelAfterRingDirect?.status === DuelStatus.FINISHED) {
            return { success: true };
          }
          if (!duelAfterRingDirect) {
            return { success: false, message: 'Duelo não encontrado' };
          }
          const uf = isPlayer1 ? (duelAfterRingDirect as any).player1Field : (duelAfterRingDirect as any).player2Field;
          const ua = uf?.monsters?.[attackerZoneIndex];
          if (!ua || ua.position !== 'attack') {
            logger.info(`💍 [attackMonster] Ataque direto cancelado — Ring of Destruction`);
            return {
              success: false,
              message: 'Ring of Destruction foi ativada! O monstro atacante foi destruído e ambos sofreram dano.',
            };
          }
          duel = duelAfterRingDirect;
        }
      }

      // Verificar se Waboku está ativo no campo do defensor (oponente)
      const defenderFieldForWaboku = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
      const isWabokuActive = defenderFieldForWaboku && defenderFieldForWaboku.wabokuActiveThisTurn === true;

      let damageDealt = 0;

      if (isWabokuActive) {
        logger.info(`🛡️ [attackMonster] Waboku está ativo - prevenindo dano de batalha ao defensor`);
        // Waboku previne dano de batalha, então não aplicar dano
        damageDealt = 0;
      } else {
        // Ataque direto: reduzir LP do oponente pelo ATK do atacante (Kuriboh/Defense Draw podem prevenir)
        let directDamage = attackerAtk;
        directDamage = await this.applyBattleDamagePreventionForDefender(
          duelId,
          duel,
          isPlayer1,
          directDamage,
        );
        const defenderLifePoints = isPlayer1 ? duel.player2LifePoints : duel.player1LifePoints;
        const newLifePoints = Math.max(0, defenderLifePoints - directDamage);
        damageDealt = defenderLifePoints - newLifePoints;

        if (isPlayer1) {
          duel.player2LifePoints = newLifePoints;
        } else {
          duel.player1LifePoints = newLifePoints;
        }

        if (newLifePoints <= 0) {
          await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER1_WIN : DuelResult.PLAYER2_WIN, userId);
        }
      }

      // Processar efeito do WhiteMagicalHat se causou dano ao oponente (antes da atualização)
      if (damageDealt > 0) {
        await this.processWhiteMagicalHatEffect(duelIdStr, duel, isPlayer1, attacker);
        await this.processMaskedSorcererEffect(duelIdStr, duel, isPlayer1, attacker);
      }

      // Marcar que o monstro atacante já atacou neste turno (ataque direto)
      attacker.attackedThisTurn = true;
      attacker.attacksThisTurn = (attacker.attacksThisTurn || 0) + 1;
      logger.info(`✅ [attackMonster] Flag attackedThisTurn marcada para ${attacker.name} (ataque direto) - ataques neste turno: ${attacker.attacksThisTurn}`);

      // Processar efeito do AxeDragonute e GiantOrc: mudar para defesa no final da Etapa de Dano (ataque direto)
      attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      const attackerAfterDirectAttack = attackerField?.monsters?.[attackerZoneIndex];

      if (attackerAfterDirectAttack) {
        const attackerCardId = attackerAfterDirectAttack.idCarta || attackerAfterDirectAttack.id || attackerAfterDirectAttack.cardId;
        const attackerName = (attackerAfterDirectAttack.name || attackerAfterDirectAttack.cardName || '').toLowerCase();

        // Log para debug
        logger.info(`🔍 [attackMonster] Verificando AxeDragonute - cardId: ${attackerCardId}, name: ${attackerAfterDirectAttack.name || attackerAfterDirectAttack.cardName}, position: ${attackerAfterDirectAttack.position}`);

        const isAxeDragonute = attackerCardId === 'AxeDragonute' ||
                              attackerCardId === 'axedragonute' ||
                              attackerCardId === 'Axe-Dragonute' ||
                              attackerCardId === 'axe-dragonute' ||
                              attackerName === 'axe dragonute' ||
                              attackerName === 'axe-dragonute' ||
                              attackerName === 'axedragonute' ||
                              (typeof attackerCardId === 'string' && attackerCardId.toLowerCase().includes('axedragonute')) ||
                              (typeof attackerName === 'string' && attackerName.includes('axe') && attackerName.includes('dragonute')) ||
                              this.isExactCard(attackerAfterDirectAttack, 'AxeDragonute');

        logger.info(`🔍 [attackMonster] isAxeDragonute: ${isAxeDragonute}, position: ${attackerAfterDirectAttack.position}`);

        const isGiantOrc = attackerCardId === 'GiantOrc' ||
                           attackerCardId === 'giantorc' ||
                           attackerName === 'giant orc' ||
                           attackerName === 'giantorc' ||
                           this.isExactCard(attackerAfterDirectAttack, 'GiantOrc');

        if (isAxeDragonute && attackerAfterDirectAttack.position === 'attack') {
          logger.info(`🪓 [attackMonster] AxeDragonute atacou diretamente - mudando para posição de defesa no final da Etapa de Dano`);
          attackerAfterDirectAttack.position = 'defense';
          // Marcar que a posição foi alterada neste turno (não pode mudar novamente)
          attackerAfterDirectAttack.positionChangedThisTurn = true;
          logger.info(`✅ [attackMonster] AxeDragonute mudado para posição de defesa (ataque direto) - positionChangedThisTurn marcado`);

          // Garantir que a mudança seja refletida no objeto duel
          if (isPlayer1) {
            (duel as any).player1Field = attackerField;
          } else {
            (duel as any).player2Field = attackerField;
          }
        }

        if (isGiantOrc && attackerAfterDirectAttack.position === 'attack') {
          logger.info(`👹 [attackMonster] GiantOrc atacou diretamente - mudando para posição de defesa no final da Etapa de Dano`);
          attackerAfterDirectAttack.position = 'defense';
          // Marcar que a posição foi alterada neste turno (não pode mudar novamente)
          attackerAfterDirectAttack.positionChangedThisTurn = true;
          logger.info(`✅ [attackMonster] GiantOrc mudado para posição de defesa (ataque direto) - positionChangedThisTurn marcado`);

          // Garantir que a mudança seja refletida no objeto duel
          if (isPlayer1) {
            (duel as any).player1Field = attackerField;
          } else {
            (duel as any).player2Field = attackerField;
          }
        }
      }

      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
      } as any);

      this.activeDuels.set(duelIdStr, duel);

      return { success: true, damage: attackerAtk };
    }

    // Se targetZoneIndex foi especificado, deve ser um índice válido (0-4)
    logger.info(`🎯 [attackMonster] Verificando targetZoneIndex:`, {
      targetZoneIndex,
      targetZoneIndexType: typeof targetZoneIndex,
      isNull: targetZoneIndex === null,
      isValid: targetZoneIndex !== null && targetZoneIndex >= 0 && targetZoneIndex < 5
    });

    if (targetZoneIndex !== null && (targetZoneIndex < 0 || targetZoneIndex >= 5)) {
      logger.warn(`⚠️ [attackMonster] targetZoneIndex inválido: ${targetZoneIndex}`);
      return { success: false, message: 'Alvo inválido' };
    }

    if (targetZoneIndex === null) {
      logger.warn(`⚠️ [attackMonster] targetZoneIndex é null - isso não deveria acontecer em ataque a monstro`);
      return { success: false, message: 'Alvo inválido' };
    }

    let target = opponentMonsters[targetZoneIndex];
    if (!target) {
      logger.warn(`⚠️ [attackMonster] Não há monstro no alvo especificado: zona ${targetZoneIndex}`);
      return { success: false, message: 'Não há monstro no alvo especificado' };
    }

    logger.info(`✅ [attackMonster] Alvo encontrado:`, {
      targetName: target.name || target.cardName,
      targetPosition: target.position,
      targetBaseAtk: target.atk,
      targetTotalAtk: this.getTotalMonsterAtk(target, duel, !isPlayer1, duel.currentPhase),
      targetDef: target.def
    });

    let damage = 0;
    let destroyed = false;
    /** LP do atacante após sofrer dano por atacar monstro em defesa (DEF > ATK); usado para garantir que o re-fetch não perca o valor */
    let attackerLifePointsAfterDefenseDamage: number | null = null;
    const targetPosition = target.position;

    if (targetPosition === 'attack') {
      // Ataque vs Ataque: comparar ATK total do defensor (base + equipamentos + efeitos que aumentam ATK)
      const targetAtk = this.getTotalMonsterAtk(target, duel, !isPlayer1, duel.currentPhase);

      // Verificar se é Marshmallon (alvo ou atacante - Marshmallon não pode ser destruído em batalha)
      const targetCardId = target.idCarta || target.id || target.cardId;
      const targetName = (target.name || target.cardName || '').toLowerCase();
      const isMarshmallon = targetCardId === 'Marshmallon' ||
                           targetCardId === 'marshmallon' ||
                           targetName === 'marshmallon' ||
                           (typeof targetCardId === 'string' && targetCardId.toLowerCase().includes('marshmallon'));
      const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
      const attackerName = (attacker.name || attacker.cardName || '').toLowerCase();
      const isAttackerMarshmallon = attackerCardId === 'Marshmallon' ||
                                   attackerCardId === 'marshmallon' ||
                                   attackerName === 'marshmallon' ||
                                   (typeof attackerCardId === 'string' && attackerCardId.toLowerCase().includes('marshmallon'));
      const isReflectBounder = targetCardId === 'ReflectBounder' ||
                              (typeof targetCardId === 'string' && targetCardId.toLowerCase().includes('reflectbounder')) ||
                              targetName === 'reflect bounder' ||
                              (typeof targetName === 'string' && targetName.includes('reflect bounder'));

      // Reflect Bounder: antes do cálculo de dano, se este card está sendo atacado e estava face-up em Ataque: cause dano ao oponente = ATK do monstro atacante
      let reflectBounderEffectApplied = false;
      if (isReflectBounder && target.position === 'attack') {
        const reflectBounderDamage = attackerAtk;
        const attackerLifePoints = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
        const newAttackerLifePoints = Math.max(0, attackerLifePoints - reflectBounderDamage);
        if (isPlayer1) {
          duel.player1LifePoints = newAttackerLifePoints;
        } else {
          duel.player2LifePoints = newAttackerLifePoints;
        }
        reflectBounderEffectApplied = true;
        logger.info(`💥 [attackMonster] Reflect Bounder: dano de efeito ao atacante = ${reflectBounderDamage} (ATK do monstro atacante). LP atacante: ${attackerLifePoints} -> ${newAttackerLifePoints}`);
        if (newAttackerLifePoints <= 0) {
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
            player1LifePoints: duel.player1LifePoints,
            player2LifePoints: duel.player2LifePoints,
          } as any);
          await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN, isPlayer1 ? duel.player2Id : duel.player1Id);
          this.activeDuels.set(duelIdStr, duel);
          return { success: true };
        }
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
      }

      // Verificar se o ataque vai destruir o monstro do defensor (ATK > ATK ou ATK = ATK)
      // Em empate (ATK = ATK), ambos são destruídos, então a trap também ativa
      const willDestroyTarget = attackerAtk >= targetAtk;

      logger.info(`⚔️ [attackMonster] Ataque vs Ataque - Verificando traps:`, {
        attackerAtk,
        targetAtk,
        willDestroyTarget,
        attackerZoneIndex,
        targetZoneIndex
      });

      if (willDestroyTarget) {
        // Atacante vence ou empata: normalmente destruiria o alvo (ou ambos em empate)
        // Negate Attack / Magic Cylinder (nega ataque), depois Mirror Force e Dimensional Prison
        const negateAttackAtk = await this.checkAndActivateNegateAttack(
          duelId,
          duel,
          isPlayer1,
          attackerZoneIndex,
          attacker,
        );
        if (negateAttackAtk) {
          logger.info(`🛡️ [attackMonster] Ataque negado - Negate Attack`);
          return {
            success: false,
            message: 'Negate Attack foi ativada! O ataque foi negado e a Battle Phase encerrou.',
          };
        }

        const heroBarrierAtk = await this.checkAndActivateHeroBarrier(
          duelId,
          duel,
          isPlayer1,
          attackerZoneIndex,
          attacker,
        );
        if (heroBarrierAtk) {
          logger.info(`🛡️ [attackMonster] Ataque negado - Hero Barrier`);
          return {
            success: false,
            message: 'Hero Barrier foi ativada! O ataque foi negado.',
          };
        }

        logger.info(`🛡️ [attackMonster] Verificando Magic Cylinder...`);
        const magicCylinderActivated = await this.checkAndActivateMagicCylinder(duelId, duel, isPlayer1, attackerZoneIndex, attacker);
        if (magicCylinderActivated) {
          logger.info(`🪄 [attackMonster] Ataque negado - Magic Cylinder foi ativada`);
          return { success: false, message: 'Magic Cylinder foi ativada! O ataque foi negado e você recebeu dano igual ao ATK do monstro atacante.' };
        }

        logger.info(`🛡️ [attackMonster] Verificando Mirror Force...`);
        const mirrorForceActivated = await this.checkAndActivateMirrorForce(duelId, duel, isPlayer1);
        logger.info(`🛡️ [attackMonster] Mirror Force ativada: ${mirrorForceActivated}`);
        if (mirrorForceActivated) {
          duel = await this.findDuelByIdFromDatabase(duelIdStr);
          if (duel) {
            const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
            const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
            if (!updatedAttacker || updatedAttacker.position !== 'attack') {
              logger.info(`🪞 [attackMonster] Ataque cancelado - Mirror Force destruiu o monstro atacante`);
              return { success: false, message: 'Mirror Force foi ativada! Todos os seus monstros em modo de ataque foram destruídos.' };
            }
          }
        }

        if (!duel) {
          return { success: false, message: 'Duelo não encontrado' };
        }
        const dimensionalPrisonActivated = await this.checkAndActivateDimensionalPrison(duelId, duel, isPlayer1, attackerZoneIndex);
        if (dimensionalPrisonActivated) {
          duel = await this.findDuelByIdFromDatabase(duelIdStr);
          if (duel) {
            const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
            const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
            if (!updatedAttacker) {
              logger.info(`🚪 [attackMonster] Ataque cancelado - Dimensional Prison baniu o monstro atacante`);
              return { success: false, message: 'Dimensional Prison foi ativada! Seu monstro atacante foi banido do jogo.' };
            }
          }
        }

        // Verificar Sakuretsu Armor quando o ataque vai causar dano ou destruir o monstro defensor
        // Re-buscar o duelo antes de verificar Sakuretsu Armor
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (!duel) {
          return { success: false, message: 'Duelo não encontrado' };
        }
        attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        attacker = attackerField?.monsters?.[attackerZoneIndex];
        const targetBeforeSakuretsu = defenderField?.monsters?.[targetZoneIndex];

        if (!attacker || attacker.position !== 'attack' || !targetBeforeSakuretsu) {
          return { success: false, message: 'Seu monstro atacante foi destruído ou banido, ou o alvo não existe mais.' };
        }

        // Recalcular ATK após possíveis mudanças
        const attackerAtkForSakuretsu = this.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase);
        const targetAtkForSakuretsu = this.getTotalMonsterAtk(targetBeforeSakuretsu, duel, !isPlayer1, duel.currentPhase);

        // Ring of Destruction: defensor iria sofrer dano de batalha nos LP (ATK maior, sem Waboku)
        const wabokuRingAtk = defenderField && defenderField.wabokuActiveThisTurn === true;
        if (!wabokuRingAtk && attackerAtkForSakuretsu > targetAtkForSakuretsu) {
          const ringAtk = await this.checkAndActivateRingOfDestruction(
            duelId,
            duel,
            isPlayer1,
            attackerZoneIndex,
            attacker,
          );
          if (ringAtk) {
            const duelAfterRingAtk = await this.findDuelByIdFromDatabase(duelIdStr);
            if (duelAfterRingAtk?.status === DuelStatus.FINISHED) {
              return { success: true };
            }
            if (!duelAfterRingAtk) {
              return { success: false, message: 'Duelo não encontrado' };
            }
            const updatedAttackerField = isPlayer1
              ? (duelAfterRingAtk as any).player1Field
              : (duelAfterRingAtk as any).player2Field;
            const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
            if (!updatedAttacker || updatedAttacker.position !== 'attack') {
              logger.info(`💍 [attackMonster] Ataque cancelado — Ring of Destruction destruiu o monstro atacante`);
              return {
                success: false,
                message: 'Ring of Destruction foi ativada! O monstro atacante foi destruído e ambos sofreram dano.',
              };
            }
            duel = duelAfterRingAtk;
          }
        }

        // Sakuretsu Armor ativa quando o ataque vai causar dano (attackerAtk > targetAtk) ou destruir o monstro (attackerAtk >= targetAtk)
        const willCauseDamageOrDestroy = attackerAtkForSakuretsu >= targetAtkForSakuretsu;

        if (willCauseDamageOrDestroy) {
          const sakuretsuArmorActivated = await this.checkAndActivateSakuretsuArmor(duelId, duel, isPlayer1, attackerZoneIndex, attacker);
          if (sakuretsuArmorActivated) {
            duel = await this.findDuelByIdFromDatabase(duelIdStr);
            if (duel) {
              const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
              const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
              if (!updatedAttacker || updatedAttacker.position !== 'attack') {
                logger.info(`🛡️ [attackMonster] Ataque cancelado - Sakuretsu Armor destruiu o monstro atacante`);
                return { success: false, message: 'Sakuretsu Armor foi ativada! Seu monstro atacante foi destruído.' };
              }
            }
          }
        }

        // Re-buscar o duelo após verificar traps
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (!duel) {
          return { success: false, message: 'Duelo não encontrado' };
        }
        attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        attacker = attackerField?.monsters?.[attackerZoneIndex];
        const targetAfterTrap = defenderField?.monsters?.[targetZoneIndex];
        if (!attacker || attacker.position !== 'attack' || !targetAfterTrap) {
          return { success: false, message: 'Seu monstro atacante foi destruído ou banido, ou o alvo não existe mais.' };
        }
        // Recalcular ATK após possíveis mudanças
        const attackerAtk2 = this.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase);
        const targetAtk2 = this.getTotalMonsterAtk(targetAfterTrap, duel, !isPlayer1, duel.currentPhase);

        // Verificar se Waboku está ativo no campo do defensor
        const isWabokuActiveForDefenderAtk = defenderField && defenderField.wabokuActiveThisTurn === true;

        if (attackerAtk2 > targetAtk2) {
          // Atacante vence: normalmente destruiria o alvo
          // MAS: Waboku previne destruição de monstros em batalha e dano de batalha
          if (isWabokuActiveForDefenderAtk) {
            // Waboku previne destruição de monstros em batalha e dano de batalha
            destroyed = false;
            damage = 0;
            logger.info(`🛡️ [attackMonster] Waboku está ativo - monstro do defensor não pode ser destruído em batalha e dano de batalha prevenido`);
          } else if (isMarshmallon) {
            // Marshmallon não é destruído em batalha
            destroyed = false;
            damage = attackerAtk2 - targetAtk2;

            damage = await this.applyBattleDamagePreventionForDefender(
              duelId,
              duel,
              isPlayer1,
              damage,
            );

            // Aplicar dano ao oponente normalmente (pode ser 0 se Defense Draw/Kuriboh)
            const defenderLifePoints = isPlayer1 ? duel.player2LifePoints : duel.player1LifePoints;
            const newLifePoints = Math.max(0, defenderLifePoints - damage);

            if (isPlayer1) {
              duel.player2LifePoints = newLifePoints;
            } else {
              duel.player1LifePoints = newLifePoints;
            }

            if (newLifePoints <= 0) {
              await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER1_WIN : DuelResult.PLAYER2_WIN, userId);
            }
            // WhiteMagicalHat e MaskedSorcerer são processados no bloco comum abaixo (evita descartar 2 cartas)
            logger.info(`🛡️ [attackMonster] Marshmallon não pode ser destruído em batalha - permanece no campo`);
          } else {
            // Monstro normal: destruir alvo, diferença reduz LP do oponente
            destroyed = true;
            damage = attackerAtk2 - targetAtk2;

            // IMPORTANTE: Verificar se o monstro alvo tinha equipamento ANTES de remover do campo
            await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, targetAfterTrap);

            // Agora remover do campo e mover para GY/banished (DMoC: bane se destruiu em batalha / se ele próprio sair)
            defenderField.monsters[targetZoneIndex] = null;
            this.sendMonsterLeavingField(duel, targetAfterTrap, !isPlayer1, {
              destroyedByBattleBy: attacker,
            });

            // BLS - Envoy of the Beginning efeito 2: atacante venceu e destruiu o defensor - pode atacar novamente
            const isBLSWins = attacker && (this.isExactCard(attacker, 'BlackLusterSoldierEnvoyOfTheBeginning') || (typeof (attacker.name || attacker.cardName) === 'string' && (attacker.name || attacker.cardName).toLowerCase().includes('black luster soldier'))) && attacker.canAttackAgainIfDestroys === true;
            if (isBLSWins) {
              attacker.canAttackAgainThisTurn = true;
              logger.info(`✅ [attackMonster] BLS destruiu monstro em batalha (atacante venceu) - pode realizar segundo ataque`);
              await this.updateDuelInDatabase(duelId, {
                player1Field: (duel as any).player1Field,
                player2Field: (duel as any).player2Field,
              } as any);
            }

            damage = await this.applyBattleDamagePreventionForDefender(
              duelId,
              duel,
              isPlayer1,
              damage,
            );

            const defenderLifePoints = isPlayer1 ? duel.player2LifePoints : duel.player1LifePoints;
            const newLifePoints = Math.max(0, defenderLifePoints - damage);

            if (isPlayer1) {
              duel.player2LifePoints = newLifePoints;
            } else {
              duel.player1LifePoints = newLifePoints;
            }

            if (newLifePoints <= 0) {
              await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER1_WIN : DuelResult.PLAYER2_WIN, userId);
            }
          }

          // Processar efeito do WhiteMagicalHat se causou dano ao oponente
          if (damage > 0) {
            await this.processWhiteMagicalHatEffect(duelIdStr, duel, isPlayer1, attacker);
            await this.processMaskedSorcererEffect(duelIdStr, duel, isPlayer1, attacker);
          }
        } else if (attackerAtk2 === targetAtk2) {
          // Empate: normalmente ambos seriam destruídos
          // MAS: Waboku previne destruição de monstros em batalha
          if (isWabokuActiveForDefenderAtk) {
            // Waboku previne destruição do monstro do defensor em batalha
            // O atacante ainda é destruído normalmente (Waboku só protege os monstros do jogador que ativou)
            destroyed = true; // Apenas o atacante é destruído
            damage = 0;
            logger.info(`🛡️ [attackMonster] Waboku está ativo - monstro do defensor não pode ser destruído em batalha (empate), mas atacante é destruído`);

            // Destruir apenas o atacante — cemitério do DONO ORIGINAL
            await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
            attackerField.monsters[attackerZoneIndex] = null;
            const ownerFieldWabokuAtk = this.getOwnerFieldForMonster(duel, attacker, isPlayer1);
            if (!ownerFieldWabokuAtk.graveyard) ownerFieldWabokuAtk.graveyard = [];
            ownerFieldWabokuAtk.graveyard.push(attacker);
          } else {
            // Empate: ambos são destruídos
            destroyed = true;

            // Verificar se algum dos monstros é Fiber Jar que foi processado
            const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
            const targetCardId = targetAfterTrap.idCarta || targetAfterTrap.id || targetAfterTrap.cardId;
            const attackerIsFiberJar = this.isExactCard(attacker, 'FiberJar');
            const targetIsFiberJar = this.isExactCard(targetAfterTrap, 'FiberJar');

            // IMPORTANTE: Chamar handleEquipmentDestruction ANTES de remover os monstros do campo
            // Isso garante que ainda temos acesso aos dados completos dos monstros

            // Mover para os cemitérios do DONO ORIGINAL (exceto Fiber Jar se foi processado)
            const ownerFieldAtkTie = this.getOwnerFieldForMonster(duel, attacker, isPlayer1);
            const ownerFieldDefTie = this.getOwnerFieldForMonster(duel, targetAfterTrap, !isPlayer1);
            if (!ownerFieldAtkTie.graveyard) ownerFieldAtkTie.graveyard = [];
            if (!ownerFieldDefTie.graveyard) ownerFieldDefTie.graveyard = [];

            if (!attackerIsFiberJar || !fiberJarActivated) {
              await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
              attackerField.monsters[attackerZoneIndex] = null;
              ownerFieldAtkTie.graveyard.push(attacker);
            } else {
              logger.info(`✅ [attackMonster] Atacante Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
              attackerField.monsters[attackerZoneIndex] = null;
            }

            if (!targetIsFiberJar || !fiberJarActivated) {
              await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, targetAfterTrap);
              defenderField.monsters[targetZoneIndex] = null;
              ownerFieldDefTie.graveyard.push(targetAfterTrap);
            } else {
              logger.info(`✅ [attackMonster] Defensor Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
              defenderField.monsters[targetZoneIndex] = null;
            }

            // Nenhum dano em empate
            damage = 0;
          }
        }
      } else if (targetAtk > attackerAtk) {
        // Defensor vence: atacante destruído. Duelista com monstro de menor ATK perde LP = diferença (maior ATK - menor ATK).
        const attackerFieldForWaboku = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const isWabokuActiveForAttacker = attackerFieldForWaboku && attackerFieldForWaboku.wabokuActiveThisTurn === true;
        damage = targetAtk - attackerAtk;
        if (isWabokuActiveForAttacker) {
          damage = 0;
          logger.info(`🛡️ [attackMonster] Waboku está ativo no campo do atacante - prevenindo dano de batalha`);
        }
        if (isAttackerMarshmallon) {
          destroyed = false;
          logger.info(`🛡️ [attackMonster] Marshmallon (atacante) não pode ser destruído em batalha - permanece no campo`);
        } else {
          destroyed = true;
          await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
          attackerField.monsters[attackerZoneIndex] = null;
          this.sendMonsterLeavingField(duel, attacker, isPlayer1);
        }
        const attackerLifePoints = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
        const newLifePoints = Math.max(0, attackerLifePoints - damage);
        if (isPlayer1) {
          duel.player1LifePoints = newLifePoints;
        } else {
          duel.player2LifePoints = newLifePoints;
        }
        if (newLifePoints <= 0) {
          await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN, isPlayer1 ? duel.player2Id : duel.player1Id);
        }
        if (damage > 0) {
          await this.processWhiteMagicalHatEffect(duelIdStr, duel, isPlayer1, attacker, target);
          await this.processMaskedSorcererEffect(duelIdStr, duel, isPlayer1, attacker, target);
        }
      } else {
        // Empate: normalmente ambos seriam destruídos
        // MAS: Marshmallon não pode ser destruído em batalha (nem alvo nem atacante)
        if (isMarshmallon && isAttackerMarshmallon) {
          // Ambos são Marshmallon: nenhum é destruído
          destroyed = false;
          damage = 0;
          logger.info(`🛡️ [attackMonster] Ambos são Marshmallon - nenhum pode ser destruído em batalha`);
        } else if (isMarshmallon) {
          // Só o alvo é Marshmallon: atacante é destruído, Marshmallon (alvo) permanece
          destroyed = true;
          attackerField.monsters[attackerZoneIndex] = null;

          const attackerIsFiberJar = this.isExactCard(attacker, 'FiberJar');
          if (!attackerIsFiberJar || !fiberJarActivated) {
            await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
            const ownerFieldMarshAtk = this.getOwnerFieldForMonster(duel, attacker, isPlayer1);
            if (!ownerFieldMarshAtk.graveyard) ownerFieldMarshAtk.graveyard = [];
            ownerFieldMarshAtk.graveyard.push(attacker);
          } else {
            logger.info(`✅ [attackMonster] Atacante Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
          }
          logger.info(`🛡️ [attackMonster] Marshmallon (alvo) não pode ser destruído em batalha (empate) - permanece no campo`);
        } else if (isAttackerMarshmallon) {
          // Só o atacante é Marshmallon: alvo é destruído, Marshmallon (atacante) permanece
          destroyed = true;
          await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, target);
          defenderField.monsters[targetZoneIndex] = null;
          const ownerFieldMarshDef = this.getOwnerFieldForMonster(duel, target, !isPlayer1);
          if (!ownerFieldMarshDef.graveyard) ownerFieldMarshDef.graveyard = [];
          ownerFieldMarshDef.graveyard.push(target);
          logger.info(`🛡️ [attackMonster] Marshmallon (atacante) não pode ser destruído em batalha (empate) - permanece no campo`);
        } else {
          // Empate normal: ambos são destruídos
          destroyed = true;

          // Verificar se algum dos monstros é Fiber Jar que foi processado
          const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
          const targetCardId = target.idCarta || target.id || target.cardId;
          const attackerIsFiberJar = this.isExactCard(attacker, 'FiberJar');
          const targetIsFiberJar = this.isExactCard(target, 'FiberJar');

          // IMPORTANTE: Chamar handleEquipmentDestruction ANTES de remover os monstros do campo
          // Isso garante que ainda temos acesso aos dados completos dos monstros

          // Mover para os cemitérios do DONO ORIGINAL (exceto Fiber Jar se foi processado)
          const ownerFieldAtk2 = this.getOwnerFieldForMonster(duel, attacker, isPlayer1);
          const ownerFieldDef2 = this.getOwnerFieldForMonster(duel, target, !isPlayer1);
          if (!ownerFieldAtk2.graveyard) ownerFieldAtk2.graveyard = [];
          if (!ownerFieldDef2.graveyard) ownerFieldDef2.graveyard = [];

          if (!attackerIsFiberJar || !fiberJarActivated) {
            await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
            attackerField.monsters[attackerZoneIndex] = null;
            ownerFieldAtk2.graveyard.push(attacker);

            if (!attackerField.monsterDestroyedThisTurn) {
              attackerField.monsterDestroyedThisTurn = true;
              logger.info(`✅ [attackMonster] Monstro destruído no campo do atacante - Last Will pode ser ativada`);
            }
          } else {
            logger.info(`✅ [attackMonster] Atacante Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
            attackerField.monsters[attackerZoneIndex] = null;
          }

          if (!targetIsFiberJar || !fiberJarActivated) {
            await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, target);
            defenderField.monsters[targetZoneIndex] = null;
            ownerFieldDef2.graveyard.push(target);

            // Marcar que um monstro foi destruído no campo do defensor neste turno (para Last Will)
            if (!defenderField.monsterDestroyedThisTurn) {
              defenderField.monsterDestroyedThisTurn = true;
              logger.info(`✅ [attackMonster] Monstro destruído no campo do defensor - Last Will pode ser ativada`);
            }
            // BLS - Envoy of the Beginning efeito 2: se destruiu monstro em batalha e escolheu efeito 2, pode atacar novamente
            const isBLSHere = attacker && (this.isExactCard(attacker, 'BlackLusterSoldierEnvoyOfTheBeginning') || (typeof (attacker.name || attacker.cardName) === 'string' && (attacker.name || attacker.cardName).toLowerCase().includes('black luster soldier'))) && attacker.canAttackAgainIfDestroys === true;
            if (isBLSHere) {
              attacker.canAttackAgainThisTurn = true;
              logger.info(`✅ [attackMonster] BLS destruiu monstro em batalha - pode realizar segundo ataque`);
              // Persistir imediatamente para não perder a flag no re-fetch ao final do ataque
              await this.updateDuelInDatabase(duelId, {
                player1Field: (duel as any).player1Field,
                player2Field: (duel as any).player2Field,
              } as any);
            }
          } else {
            logger.info(`✅ [attackMonster] Defensor Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
            defenderField.monsters[targetZoneIndex] = null;
          }
        }
      }
      // Persistir estado do duelo após resolução do ataque vs ataque (monstros destruídos, cemitério, LP)
      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
      } as any);
      // Reflect Bounder: após o cálculo de dano, destruir este card (se ainda estiver no campo)
      if (reflectBounderEffectApplied) {
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (duel) {
          const defFieldRb = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
          const reflectBounderCard = defFieldRb?.monsters?.[targetZoneIndex];
          if (reflectBounderCard) {
            logger.info(`💥 [attackMonster] Reflect Bounder: destruindo este card após o cálculo de dano`);
            await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, reflectBounderCard);
            defFieldRb.monsters[targetZoneIndex] = null;
            const ownerFieldRb = this.getOwnerFieldForMonster(duel, reflectBounderCard, !isPlayer1);
            if (!ownerFieldRb.graveyard) ownerFieldRb.graveyard = [];
            ownerFieldRb.graveyard.push(reflectBounderCard);
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
            this.activeDuels.set(duelIdStr, duel);
          }
        }
      }
    } else {
      // Ataque vs Defesa: alvo não está em ataque (defense, set, ou qualquer outro). Comparar ATK do atacante vs DEF do defensor.
      // IMPORTANTE: Só viramos o monstro face-down para cima DEPOIS de verificar traps (Mirror Force, Dimensional Prison, Sakuretsu Armor).
      // Se o atacante for destruído/banido por uma trap antes de resolver o ataque, o monstro face-down NÃO vira.

      // Drillroid: antes do cálculo de dano, se este card atacar um monstro em Posição de Defesa: destrua esse monstro (sem aplicar dano).
      const attackerCardIdForDrill = attacker.idCarta || attacker.id || attacker.cardId;
      const attackerNameForDrill = (attacker.name || attacker.cardName || '').toLowerCase();
      const isDrillroid = attackerCardIdForDrill === 'Drillroid' ||
                         attackerCardIdForDrill === 'drillroid' ||
                         (typeof attackerCardIdForDrill === 'string' && attackerCardIdForDrill.toLowerCase().includes('drillroid')) ||
                         attackerNameForDrill.includes('drillroid') ||
                         (typeof attackerCardIdForDrill === 'string' && attackerCardIdForDrill.toLowerCase().includes('71218746'));
      if (isDrillroid) {
        logger.info(`🔩 [attackMonster] Drillroid atacou monstro em Posição de Defesa - destruindo o alvo antes do cálculo de dano`);
        await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, target);
        defenderField.monsters[targetZoneIndex] = null;
        const ownerFieldDrill = this.getOwnerFieldForMonster(duel, target, !isPlayer1);
        if (!ownerFieldDrill.graveyard) ownerFieldDrill.graveyard = [];
        ownerFieldDrill.graveyard.push(target);
        if (!defenderField.monsterDestroyedThisTurn) {
          defenderField.monsterDestroyedThisTurn = true;
          logger.info(`✅ [attackMonster] Monstro destruído no campo do defensor (Drillroid) - Last Will pode ser ativada`);
        }
        attacker.attackedThisTurn = true;
        attacker.attacksThisTurn = (attacker.attacksThisTurn || 0) + 1;
        if (isPlayer1) {
          (duel as any).player1Field = attackerField;
          (duel as any).player2Field = defenderField;
        } else {
          (duel as any).player1Field = defenderField;
          (duel as any).player2Field = attackerField;
        }
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
        logger.info(`✅ [attackMonster] Drillroid: monstro em defesa destruído (sem dano de batalha)`);
        return { success: true, damage: 0, destroyed: true };
      }

      const targetCardId = target.idCarta || target.id || target.cardId;
      const targetName = (target.name || target.cardName || '').toLowerCase();
      const isMarshmallon = targetCardId === 'Marshmallon' ||
                           targetCardId === 'marshmallon' ||
                           targetName === 'marshmallon' ||
                           (typeof targetCardId === 'string' && targetCardId.toLowerCase().includes('marshmallon'));
      const wasFaceDown = targetPosition === 'set';

      // Re-buscar referências atualizadas
      duel = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duel) {
        return { success: false, message: 'Duelo não encontrado' };
      }
      attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
      attacker = attackerField?.monsters?.[attackerZoneIndex];
      target = defenderField?.monsters?.[targetZoneIndex];

      if (!attacker || attacker.position !== 'attack' || !target) {
        return { success: false, message: 'Seu monstro atacante foi destruído ou banido, ou o alvo não existe mais.' };
      }

      // Recalcular ATK do atacante após possíveis mudanças
      const attackerAtkRecalc = this.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase);

      // Calcular DEF total incluindo bônus de equipamentos e spells; aceitar .def ou .defense
      const targetDef = this.getTotalMonsterDef(target, duel, !isPlayer1);

      // Verificar se o ataque vai destruir o monstro do defensor (ATK > DEF)
      // IMPORTANTE: Quando ATK == DEF, o monstro em defesa NÃO é destruído e não há dano, então as traps NÃO devem ativar
      // Traps só ativam quando há destruição ou dano (ATK > DEF)
      const willDestroyDefender = attackerAtkRecalc > targetDef;

      // AGORA: Verificar traps (MESMO FLUXO para face-down e face-up)
      // As traps são verificadas DEPOIS de virar (se face-down) e DEPOIS de calcular se vai destruir
      // IMPORTANTE: Traps só ativam quando ATK > DEF (monstro seria destruído)
      if (willDestroyDefender) {
        const negateAttackDef = await this.checkAndActivateNegateAttack(
          duelId,
          duel,
          isPlayer1,
          attackerZoneIndex,
          attacker,
        );
        if (negateAttackDef) {
          logger.info(`🛡️ [attackMonster] Ataque negado - Negate Attack (vs defesa)`);
          return {
            success: false,
            message: 'Negate Attack foi ativada! O ataque foi negado e a Battle Phase encerrou.',
          };
        }

        const heroBarrierDef = await this.checkAndActivateHeroBarrier(
          duelId,
          duel,
          isPlayer1,
          attackerZoneIndex,
          attacker,
        );
        if (heroBarrierDef) {
          logger.info(`🛡️ [attackMonster] Ataque negado - Hero Barrier (vs defesa)`);
          return {
            success: false,
            message: 'Hero Barrier foi ativada! O ataque foi negado.',
          };
        }

        // Verificar Magic Cylinder
        const magicCylinderActivated = await this.checkAndActivateMagicCylinder(duelId, duel, isPlayer1, attackerZoneIndex, attacker);
        if (magicCylinderActivated) {
          logger.info(`🪄 [attackMonster] Ataque negado - Magic Cylinder foi ativada (vs defesa)`);
          return { success: false, message: 'Magic Cylinder foi ativada! O ataque foi negado e você recebeu dano igual ao ATK do monstro atacante.' };
        }

        // Verificar Mirror Force
        const mirrorForceActivated = await this.checkAndActivateMirrorForce(duelId, duel, isPlayer1);
        if (mirrorForceActivated) {
          duel = await this.findDuelByIdFromDatabase(duelIdStr);
          if (duel) {
            const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
            const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
            if (!updatedAttacker || updatedAttacker.position !== 'attack') {
              logger.info(`🪞 [attackMonster] Ataque cancelado - Mirror Force destruiu o monstro atacante`);
              return { success: false, message: 'Mirror Force foi ativada! Todos os seus monstros em modo de ataque foram destruídos.' };
            }
          }
        }

        if (!duel) {
          return { success: false, message: 'Duelo não encontrado' };
        }

        // Verificar Dimensional Prison
        const dimensionalPrisonActivated = await this.checkAndActivateDimensionalPrison(duelId, duel, isPlayer1, attackerZoneIndex);
        if (dimensionalPrisonActivated) {
          duel = await this.findDuelByIdFromDatabase(duelIdStr);
          if (duel) {
            const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
            const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
            if (!updatedAttacker) {
              logger.info(`🚪 [attackMonster] Ataque cancelado - Dimensional Prison baniu o monstro atacante`);
              return { success: false, message: 'Dimensional Prison foi ativada! Seu monstro atacante foi banido do jogo.' };
            }
          }
        }

        // Verificar Sakuretsu Armor quando o ataque vai destruir o monstro defensor em defesa
        // Re-buscar o duelo antes de verificar Sakuretsu Armor
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (!duel) {
          return { success: false, message: 'Duelo não encontrado' };
        }
        attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        attacker = attackerField?.monsters?.[attackerZoneIndex];
        const targetBeforeSakuretsuDef = defenderField?.monsters?.[targetZoneIndex];

        if (!attacker || attacker.position !== 'attack' || !targetBeforeSakuretsuDef) {
          return { success: false, message: 'Seu monstro atacante foi destruído ou banido, ou o alvo não existe mais.' };
        }

        // Recalcular ATK do atacante (base + equipamentos + efeitos)
        const attackerAtkForSakuretsuDef = this.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase);

        // Calcular DEF total incluindo bônus de equipamentos e spells; aceitar .def ou .defense
        const targetDefForSakuretsu = this.getTotalMonsterDef(targetBeforeSakuretsuDef, duel, !isPlayer1);

        // Sakuretsu Armor ativa quando o ataque vai destruir o monstro (attackerAtk > targetDef)
        // IMPORTANTE: Quando ATK == DEF, o monstro não é destruído, então Sakuretsu Armor NÃO ativa
        const willDestroyDefenderForSakuretsu = attackerAtkForSakuretsuDef > targetDefForSakuretsu;

        if (willDestroyDefenderForSakuretsu) {
          const sakuretsuArmorActivated = await this.checkAndActivateSakuretsuArmor(duelId, duel, isPlayer1, attackerZoneIndex, attacker);
          if (sakuretsuArmorActivated) {
            duel = await this.findDuelByIdFromDatabase(duelIdStr);
            if (duel) {
              const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
              const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
              if (!updatedAttacker || updatedAttacker.position !== 'attack') {
                logger.info(`🛡️ [attackMonster] Ataque cancelado - Sakuretsu Armor destruiu o monstro atacante (vs defesa)`);
                return { success: false, message: 'Sakuretsu Armor foi ativada! Seu monstro atacante foi destruído.' };
              }
            }
          }
        }

        // Re-buscar o duelo após verificar traps
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (!duel) {
          return { success: false, message: 'Duelo não encontrado' };
        }
        attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        attacker = attackerField?.monsters?.[attackerZoneIndex];
        let targetAfterTrap2 = defenderField?.monsters?.[targetZoneIndex];
        if (!attacker || attacker.position !== 'attack' || !targetAfterTrap2) {
          return { success: false, message: 'Seu monstro atacante foi destruído ou banido, ou o alvo não existe mais.' };
        }
        // Só agora (após traps): se o alvo estava face-down, virar para face-up em defesa
        if (wasFaceDown && targetAfterTrap2.position === 'set') {
          defenderField.monsters[targetZoneIndex].position = 'defense';
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          duel = await this.findDuelByIdFromDatabase(duelIdStr);
          if (!duel) return { success: false, message: 'Duelo não encontrado' };
          defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
          const flippedCard = defenderField.monsters[targetZoneIndex];
          if (flippedCard) {
            const flippedCardId = flippedCard.idCarta || flippedCard.id || flippedCard.cardId;
            const flippedCardName = (flippedCard.name || flippedCard.cardName || '').toLowerCase();
            const isFiberJar = this.isExactCard(flippedCard, 'FiberJar');
            const isSnowmanEater = this.isExactCard(flippedCard, 'SnowmanEater');
            const isMorphingJar = this.isExactCard(flippedCard, 'MorphingJar');
            const isDekoichi = this.isExactCard(flippedCard, 'DekoichiTheBattlechantedLocomotive');
            if (isFiberJar || isSnowmanEater || isMorphingJar || isDekoichi) {
              logger.info(`🔄 [attackMonster] Processando efeito de flip da carta: ${flippedCardName || flippedCardId}`);
              await this.cardEffectsService.processFlipEffect(duelIdStr, duel, !isPlayer1, flippedCard, targetZoneIndex);
              if (isFiberJar) fiberJarActivated = true;
              duel = await this.findDuelByIdFromDatabase(duelIdStr);
              if (!duel) return { success: false, message: 'Duelo não encontrado' };
              defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
              const cardAfterFlip = defenderField.monsters[targetZoneIndex];
              if (!cardAfterFlip) {
                logger.info(`ℹ️ [attackMonster] Carta foi removida do campo pelo efeito de flip (ex: Fiber Jar)`);
                return { success: true, message: 'Efeito de flip processado. A carta foi removida do campo.' };
              }
            }
          }
          targetAfterTrap2 = defenderField.monsters[targetZoneIndex];
          if (!targetAfterTrap2) return { success: false, message: 'Alvo não encontrado após virar a carta' };
          attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          attacker = attackerField?.monsters?.[attackerZoneIndex];
        }
        // Recalcular ATK do atacante (base + equipamentos + efeitos que aumentam ATK)
        const attackerAtk3 = this.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase);

        const targetDef3 = this.getTotalMonsterDef(targetAfterTrap2, duel, !isPlayer1);

        logger.info(`⚔️ [attackMonster] Comparação ATK vs DEF:`, {
          attackerAtk: attackerAtk3,
          targetDef: targetDef3,
          willDestroy: attackerAtk3 > targetDef3
        });

        // Verificar se Waboku está ativo no campo do defensor
        const isWabokuActiveForDefender = defenderField && defenderField.wabokuActiveThisTurn === true;

        if (attackerAtk3 > targetDef3) {
          // ATK > DEF: Normalmente o monstro em defesa seria destruído
          // MAS: Waboku previne destruição de monstros em batalha
          if (isWabokuActiveForDefender) {
            // Waboku previne destruição de monstros em batalha
            destroyed = false;
            damage = 0;
            logger.info(`🛡️ [attackMonster] Waboku está ativo - monstro do defensor não pode ser destruído em batalha`);
          } else if (isMarshmallon) {
          // Marshmallon não é destruído em batalha
          destroyed = false;
          damage = 0;
          logger.info(`🛡️ [attackMonster] Marshmallon não pode ser destruído em batalha - permanece no campo`);
        } else {
          // Monstro normal: destruir
          destroyed = true;

          // Verificar se é Fiber Jar e se o efeito foi ativado
          const isFiberJar = this.isExactCard(targetAfterTrap2, 'FiberJar');

          // Se for Fiber Jar e o efeito foi ativado, não enviar para o cemitério (já está no deck)
          if (isFiberJar && fiberJarActivated) {
            // Fiber Jar foi processado e já está no deck, apenas limpar o campo
            defenderField.monsters[targetZoneIndex] = null;
            logger.info(`✅ [attackMonster] Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
          } else {
            // Monstro normal: enviar para o cemitério do DONO ORIGINAL
            await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, targetAfterTrap2);

            defenderField.monsters[targetZoneIndex] = null;
            const leaveDest = this.sendMonsterLeavingField(duel, targetAfterTrap2, !isPlayer1, {
              destroyedByBattleBy: attacker,
            });

            logger.info(`✅ [attackMonster] Monstro em defesa destruído (ATK ${attackerAtk3} > DEF ${targetDef3}) - enviado para ${leaveDest}`, {
              monsterName: targetAfterTrap2.name || targetAfterTrap2.cardName,
              targetZoneIndex,
              graveyardSize: defenderField.graveyard?.length || 0,
              monstersOnField: defenderField.monsters.filter((m: any) => m !== null && m !== undefined).length,
              defenderFieldMonstersBefore: defenderField.monsters.map((m: any, i: number) => ({ index: i, exists: m !== null && m !== undefined }))
            });

            // Marcar que um monstro foi destruído no campo do defensor neste turno (para Last Will)
            if (!defenderField.monsterDestroyedThisTurn) {
              defenderField.monsterDestroyedThisTurn = true;
              logger.info(`✅ [attackMonster] Monstro destruído no campo do defensor - Last Will pode ser ativada`);
            }
            // BLS - Envoy of the Beginning efeito 2: se destruiu monstro em batalha e escolheu efeito 2, pode atacar novamente
            const attackerAfterDestroyDef = attackerField.monsters[attackerZoneIndex];
            const isBLSDef = attackerAfterDestroyDef && (this.isExactCard(attackerAfterDestroyDef, 'BlackLusterSoldierEnvoyOfTheBeginning') || (typeof (attackerAfterDestroyDef.name || attackerAfterDestroyDef.cardName) === 'string' && (attackerAfterDestroyDef.name || attackerAfterDestroyDef.cardName).toLowerCase().includes('black luster soldier'))) && attackerAfterDestroyDef.canAttackAgainIfDestroys === true;
            if (isBLSDef) {
              attackerAfterDestroyDef.canAttackAgainThisTurn = true;
              logger.info(`✅ [attackMonster] BLS destruiu monstro em batalha (ataque vs defesa) - pode realizar segundo ataque`);
            }

            // IMPORTANTE: Atualizar o objeto duel com as mudanças do defenderField e attackerField ANTES de recalcular
            // Atualizar diretamente as referências no objeto duel
            if (isPlayer1) {
              (duel as any).player1Field = attackerField;
              (duel as any).player2Field = defenderField;
            } else {
              (duel as any).player1Field = defenderField;
              (duel as any).player2Field = attackerField;
            }

            // Recalcular UnitedWeStand para ambos os jogadores (número de monstros face-up mudou)
            // IMPORTANTE: Fazer isso DEPOIS de atualizar as referências no objeto duel
            await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);

            // Re-atualizar as referências após recalcular (caso tenha mudado algo)
            if (isPlayer1) {
              attackerField = (duel as any).player1Field;
              defenderField = (duel as any).player2Field;
            } else {
              attackerField = (duel as any).player2Field;
              defenderField = (duel as any).player1Field;
            }

            // Verificar ANTES de salvar
            logger.info(`🔍 [attackMonster] Estado ANTES de salvar no banco:`, {
              targetZoneIndex,
              monsterAtTargetZone: defenderField?.monsters?.[targetZoneIndex] === null ? 'null (correto)' : 'ainda existe (ERRO)',
              graveyardSize: defenderField?.graveyard?.length || 0,
              graveyardExists: !!defenderField?.graveyard,
              graveyardIsArray: Array.isArray(defenderField?.graveyard),
              destroyedMonsterInGraveyard: defenderField?.graveyard?.some((card: any) =>
                (card?.idCarta || card?.id || card?.cardId) === (targetAfterTrap2?.idCarta || targetAfterTrap2?.id || targetAfterTrap2?.cardId)
              ),
              allMonsters: defenderField?.monsters?.map((m: any, i: number) => ({ index: i, exists: m !== null && m !== undefined }))
            });

            // CRÍTICO: Garantir que o graveyard do dono existe e é um array antes de salvar
            const ownerFieldDefDefCheck = this.getOwnerFieldForMonster(duel, targetAfterTrap2, !isPlayer1);
            if (!ownerFieldDefDefCheck.graveyard || !Array.isArray(ownerFieldDefDefCheck.graveyard)) {
              logger.warn(`⚠️ [attackMonster] Graveyard do dono não existe ou não é array - recriando`);
              ownerFieldDefDefCheck.graveyard = [];
              ownerFieldDefDefCheck.graveyard.push(targetAfterTrap2);
            }

            // Garantir que as referências no objeto duel estão atualizadas antes de salvar
            if (isPlayer1) {
              (duel as any).player1Field = attackerField;
              (duel as any).player2Field = defenderField;
            } else {
              (duel as any).player1Field = defenderField;
              (duel as any).player2Field = attackerField;
            }

            // Verificar que o graveyard está no objeto duel antes de salvar
            const duelDefenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
            logger.info(`🔍 [attackMonster] Verificação FINAL antes de salvar:`, {
              graveyardInDuelObject: !!duelDefenderField?.graveyard,
              graveyardSizeInDuelObject: duelDefenderField?.graveyard?.length || 0,
              destroyedMonsterInDuelGraveyard: duelDefenderField?.graveyard?.some((card: any) =>
                (card?.idCarta || card?.id || card?.cardId) === (targetAfterTrap2?.idCarta || targetAfterTrap2?.id || targetAfterTrap2?.cardId)
              )
            });

            // Salvar no banco IMEDIATAMENTE após destruir o monstro
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
              player1LifePoints: duel.player1LifePoints,
              player2LifePoints: duel.player2LifePoints,
            } as any);

            // Atualizar cache local
            this.activeDuels.set(duelIdStr, duel);

            // Re-buscar o duelo do banco para garantir que está atualizado
            duel = await this.findDuelByIdFromDatabase(duelIdStr);
            if (duel) {
              attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
              defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

              // IMPORTANTE: Garantir que as referências no objeto duel estão atualizadas
              if (isPlayer1) {
                (duel as any).player1Field = attackerField;
                (duel as any).player2Field = defenderField;
              } else {
                (duel as any).player1Field = defenderField;
                (duel as any).player2Field = attackerField;
              }

              // Atualizar cache local novamente
              this.activeDuels.set(duelIdStr, duel);

              // Verificar DEPOIS de re-buscar
              logger.info(`🔍 [attackMonster] Estado DEPOIS de re-buscar do banco:`, {
                targetZoneIndex,
                monsterAtTargetZone: defenderField?.monsters?.[targetZoneIndex] === null ? 'null (correto)' : 'ainda existe (ERRO)',
                graveyardSize: defenderField?.graveyard?.length || 0,
                graveyardExists: !!defenderField?.graveyard,
                graveyardIsArray: Array.isArray(defenderField?.graveyard),
                destroyedMonsterInGraveyard: defenderField?.graveyard?.some((card: any) =>
                  (card?.idCarta || card?.id || card?.cardId) === (targetAfterTrap2?.idCarta || targetAfterTrap2?.id || targetAfterTrap2?.cardId)
                ),
                allMonsters: defenderField?.monsters?.map((m: any, i: number) => ({ index: i, exists: m !== null && m !== undefined }))
              });

              // Se o graveyard do dono não foi preservado, corrigir
              const ownerFieldRecovery = this.getOwnerFieldForMonster(duel, targetAfterTrap2, !isPlayer1);
              if (!ownerFieldRecovery.graveyard || !Array.isArray(ownerFieldRecovery.graveyard)) {
                logger.error(`❌ [attackMonster] Graveyard do dono não foi preservado após re-buscar do banco - recriando`);
                ownerFieldRecovery.graveyard = [];
                ownerFieldRecovery.graveyard.push(targetAfterTrap2);

                // Atualizar o objeto duel
                if (isPlayer1) {
                  (duel as any).player2Field = defenderField;
                } else {
                  (duel as any).player1Field = defenderField;
                }

                // Salvar novamente
                await this.updateDuelInDatabase(duelId, {
                  player1Field: (duel as any).player1Field,
                  player2Field: (duel as any).player2Field,
                } as any);

                logger.info(`✅ [attackMonster] Graveyard corrigido e salvo novamente`);
              }
            }

            logger.info(`💾 [attackMonster] Duelo atualizado no banco após destruir monstro em defesa`, {
              defenderFieldMonsters: defenderField?.monsters?.filter((m: any) => m !== null && m !== undefined).length || 0,
              defenderFieldGraveyard: defenderField?.graveyard?.length || 0,
              destroyedMonsterName: targetAfterTrap2?.name || targetAfterTrap2?.cardName || 'Desconhecido',
              destroyedMonsterInGraveyard: defenderField?.graveyard?.some((card: any) =>
                (card?.idCarta || card?.id || card?.cardId) === (targetAfterTrap2?.idCarta || targetAfterTrap2?.id || targetAfterTrap2?.cardId)
              )
            });
          }
        }
      } else {
        // willDestroyDefender é false: ATK <= DEF - Monstro em defesa NÃO é destruído
        // Se DEF > ATK: diferença (DEF - ATK) é descontada dos LP do atacante
        // Se DEF == ATK: nenhum dano
        destroyed = false;

        // Verificar se Waboku está ativo no campo do defensor
        const isWabokuActiveForDefender2 = defenderField && defenderField.wabokuActiveThisTurn === true;

        if (targetDef3 > attackerAtk3) {
          // DEF > ATK: diferença reduz LP do atacante
          // O atacante perde pontos de vida igual à diferença entre a defesa do defensor e o ataque do atacante
          // MAS: Waboku previne dano de batalha ao defensor
          if (isWabokuActiveForDefender2) {
            // Waboku previne dano de batalha, então não aplicar dano ao atacante
            damage = 0;
            logger.info(`🛡️ [attackMonster] Waboku está ativo - prevenindo dano de batalha ao defensor`);
          } else {
            // Calcular dano: DEF - ATK (diferença entre defesa do defensor e ataque do atacante)
            damage = targetDef3 - attackerAtk3;
            logger.info(`💥 [attackMonster] DEF (${targetDef3}) > ATK (${attackerAtk3}) - Atacante perde ${damage} LP`);
            const attackerLifePoints = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
            const newLifePoints = Math.max(0, attackerLifePoints - damage);
            attackerLifePointsAfterDefenseDamage = newLifePoints;

            if (isPlayer1) {
              duel.player1LifePoints = newLifePoints;
            } else {
              duel.player2LifePoints = newLifePoints;
            }

            logger.info(`💥 [attackMonster] LP do atacante: ${attackerLifePoints} -> ${newLifePoints} (dano: ${damage})`);

            // Salvar Life Points atualizados no banco imediatamente e garantir cache
            await this.updateDuelInDatabase(duelId, {
              player1LifePoints: duel.player1LifePoints,
              player2LifePoints: duel.player2LifePoints,
            } as any);
            this.activeDuels.set(duelIdStr, duel);

            if (newLifePoints <= 0) {
              await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN, isPlayer1 ? duel.player2Id : duel.player1Id);
            }

            // Processar efeito do WhiteMagicalHat e MaskedSorcerer se foi atacada em defesa e o oponente levou dano
            if (damage > 0) {
              await this.processWhiteMagicalHatEffect(duelIdStr, duel, isPlayer1, attacker, targetAfterTrap2);
              await this.processMaskedSorcererEffect(duelIdStr, duel, isPlayer1, attacker, targetAfterTrap2);
            }
          }
        } else if (targetDef3 === attackerAtk3) {
          // Empate (ATK == DEF): monstro em defesa NÃO é destruído, nenhum dano
          // O monstro permanece no campo e o atacante perde 0 LP (DEF - ATK = 0)
          destroyed = false;
          damage = 0;
          logger.info(`🛡️ [attackMonster] Empate (ATK == DEF): monstro em defesa permanece no campo, nenhum dano`);
        } else {
          // DEF < ATK (não deveria chegar aqui, mas por segurança)
          destroyed = false;
          damage = 0;
          logger.warn(`⚠️ [attackMonster] DEF (${targetDef3}) < ATK (${attackerAtk3}) - caso inesperado`);
        }

        // Big Shield Gardna: If attacked and survived, change to attack position
        const defenderMonster = defenderField?.monsters?.[targetZoneIndex];
        if (defenderMonster && BigShieldGardna.isBigShieldGardna(defenderMonster) && !destroyed) {
          logger.info(`🛡️ [Big Shield Gardna] Was attacked and survived - changing to attack position`);
          defenderMonster.position = 'attack';
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          this.activeDuels.set(duelIdStr, duel);
        }

        // O monstro permanece no campo em posição 'defense' (face-up em defesa) apenas se DEF > ATK
      }
      } else {
        // willDestroyDefender === false: ATK <= DEF. Monstro em defesa NÃO é destruído.
        // Virar alvo se face-down, calcular ATK/DEF e aplicar dano ao atacante (DEF - ATK).
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (!duel) {
          return { success: false, message: 'Duelo não encontrado' };
        }
        attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        attacker = attackerField?.monsters?.[attackerZoneIndex];
        let targetDefender = defenderField?.monsters?.[targetZoneIndex];
        if (!attacker || attacker.position !== 'attack' || !targetDefender) {
          return { success: false, message: 'Seu monstro atacante foi destruído ou banido, ou o alvo não existe mais.' };
        }
        if (wasFaceDown && targetDefender.position === 'set') {
          defenderField.monsters[targetZoneIndex].position = 'defense';
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          duel = await this.findDuelByIdFromDatabase(duelIdStr);
          if (!duel) return { success: false, message: 'Duelo não encontrado' };
          defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
          targetDefender = defenderField?.monsters?.[targetZoneIndex];
          if (!targetDefender) return { success: false, message: 'Alvo não encontrado após virar' };
        }
        const atkAttacker = this.getTotalMonsterAtk(attacker, duel, isPlayer1, duel.currentPhase);
        const targetDefTotal = this.getTotalMonsterDef(targetDefender, duel, !isPlayer1);
        destroyed = false;
        logger.info(`⚔️ [attackMonster] ATK <= DEF (não destruir): atacante ATK=${atkAttacker}, defensor DEF=${targetDefTotal}`);
        if (targetDefTotal > atkAttacker) {
          damage = targetDefTotal - atkAttacker;
          const isWabokuActiveDef = defenderField && defenderField.wabokuActiveThisTurn === true;
          if (isWabokuActiveDef) {
            damage = 0;
            logger.info(`🛡️ [attackMonster] Waboku ativo - dano ao atacante prevenido`);
          } else {
            const attackerLP = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
            const newLP = Math.max(0, attackerLP - damage);
            attackerLifePointsAfterDefenseDamage = newLP;
            if (isPlayer1) duel.player1LifePoints = newLP; else duel.player2LifePoints = newLP;
            logger.info(`💥 [attackMonster] DEF (${targetDefTotal}) > ATK (${atkAttacker}) - Atacante perde ${damage} LP. LP: ${attackerLP} -> ${newLP}`);
            await this.updateDuelInDatabase(duelId, {
              player1LifePoints: duel.player1LifePoints,
              player2LifePoints: duel.player2LifePoints,
            } as any);
            this.activeDuels.set(duelIdStr, duel);
            if (newLP <= 0) {
              await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN, isPlayer1 ? duel.player2Id : duel.player1Id);
            }
            // Processar efeito do White Magical Hat e Masked Sorcerer: quando atacado em defesa e o atacante leva dano
            if (damage > 0) {
              await this.processWhiteMagicalHatEffect(duelIdStr, duel, isPlayer1, attacker, targetDefender);
              await this.processMaskedSorcererEffect(duelIdStr, duel, isPlayer1, attacker, targetDefender);
            }
          }
        } else {
          damage = 0;
          logger.info(`🛡️ [attackMonster] ATK == DEF: monstro em defesa permanece, nenhum dano`);
        }
      }

      // Processar efeito do Marshmallon APÓS o cálculo de dano
      // Se o Marshmallon foi atacado e estava face-down no começo da Etapa de Dano, o atacante sofre 1000 de dano
      if (isMarshmallon && wasFaceDown) {
        // Re-buscar o duelo para garantir que temos o estado mais atualizado
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (!duel) {
          logger.error(`❌ [attackMonster] Duelo não encontrado ao processar efeito do Marshmallon`);
          return { success: false, message: 'Duelo não encontrado' };
        }

        logger.info(`💥 [attackMonster] Marshmallon estava face-down quando foi atacado - aplicando 1000 de dano ao atacante`);
        const attackerLifePoints = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
        const newLifePoints = Math.max(0, attackerLifePoints - 1000);

        if (isPlayer1) {
          duel.player1LifePoints = newLifePoints;
        } else {
          duel.player2LifePoints = newLifePoints;
        }

        logger.info(`💥 [attackMonster] Atacante sofreu 1000 de dano do efeito do Marshmallon. LP: ${attackerLifePoints} -> ${newLifePoints}`);

        if (newLifePoints <= 0) {
          await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN, isPlayer1 ? duel.player2Id : duel.player1Id);
        }
      }
    }

    // IMPORTANTE: Re-buscar o duelo do BANCO para garantir estado persistido (ex: BLS canAttackAgainThisTurn)
    try {
      duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
      if (!duel) {
        logger.error(`❌ [attackMonster] Duelo não encontrado após ataque - duelId: ${duelIdStr}`);
        return { success: false, message: 'Duelo não encontrado após ataque' };
      }

      // Garantir LP do atacante quando sofreu dano por atacar monstro em defesa (DEF > ATK) — re-fetch pode devolver valor antigo
      if (attackerLifePointsAfterDefenseDamage !== null) {
        if (isPlayer1) {
          duel.player1LifePoints = attackerLifePointsAfterDefenseDamage;
        } else {
          duel.player2LifePoints = attackerLifePointsAfterDefenseDamage;
        }
        logger.info(`💥 [attackMonster] LP do atacante reaplicados após re-fetch: ${attackerLifePointsAfterDefenseDamage}`);
      }

      // Re-obter referências atualizadas do campo
      attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

      // Verificar se os campos existem
      if (!attackerField || !defenderField) {
        logger.error(`❌ [attackMonster] Campos não encontrados após re-buscar duelo`, {
          hasAttackerField: !!attackerField,
          hasDefenderField: !!defenderField
        });
        return { success: false, message: 'Erro ao obter campos do duelo' };
      }

      // Atualizar referências no objeto duel
      if (isPlayer1) {
        (duel as any).player1Field = attackerField;
        (duel as any).player2Field = defenderField;
      } else {
        (duel as any).player1Field = defenderField;
        (duel as any).player2Field = attackerField;
      }

      // Marcar que o monstro atacante já atacou neste turno
      const attackerAfterRefresh = attackerField?.monsters?.[attackerZoneIndex];
      if (attackerAfterRefresh) {
        attackerAfterRefresh.attackedThisTurn = true;
        attackerAfterRefresh.attacksThisTurn = (attackerAfterRefresh.attacksThisTurn || 0) + 1;
        logger.info(`✅ [attackMonster] Flag attackedThisTurn marcada para ${attackerAfterRefresh.name || attackerAfterRefresh.cardName} - ataques neste turno: ${attackerAfterRefresh.attacksThisTurn}`);
        // BLS efeito 2: garantir canAttackAgainThisTurn após re-fetch (pode ter sido perdido por cache/serialização)
        if (destroyed && attackerAfterRefresh.canAttackAgainIfDestroys === true) {
          const an = (attackerAfterRefresh.name || attackerAfterRefresh.cardName || '').toLowerCase();
          const aid = String(attackerAfterRefresh.idCarta || attackerAfterRefresh.id || attackerAfterRefresh.cardId || '').toLowerCase();
          const isBLSAfter = an.includes('black luster soldier') || aid.includes('blacklustersoldier') || this.isExactCard(attackerAfterRefresh, 'BlackLusterSoldierEnvoyOfTheBeginning');
          if (isBLSAfter) {
            attackerAfterRefresh.canAttackAgainThisTurn = true;
            logger.info(`✅ [attackMonster] BLS canAttackAgainThisTurn reaplicado após re-fetch (ataques: ${attackerAfterRefresh.attacksThisTurn})`);
          }
        }
      }

      // Processar efeito do AxeDragonute e GiantOrc: mudar para defesa no final da Etapa de Dano
      if (attackerAfterRefresh) {
        const attackerCardId = attackerAfterRefresh.idCarta || attackerAfterRefresh.id || attackerAfterRefresh.cardId;
        const attackerName = (attackerAfterRefresh.name || attackerAfterRefresh.cardName || '').toLowerCase();

        // Log para debug
        logger.info(`🔍 [attackMonster] Verificando AxeDragonute (ataque a monstro) - cardId: ${attackerCardId}, name: ${attackerAfterRefresh.name || attackerAfterRefresh.cardName}, position: ${attackerAfterRefresh.position}`);

        const isAxeDragonute = attackerCardId === 'AxeDragonute' ||
                              attackerCardId === 'axedragonute' ||
                              attackerCardId === 'Axe-Dragonute' ||
                              attackerCardId === 'axe-dragonute' ||
                              attackerName === 'axe dragonute' ||
                              attackerName === 'axe-dragonute' ||
                              attackerName === 'axedragonute' ||
                              (typeof attackerCardId === 'string' && attackerCardId.toLowerCase().includes('axedragonute')) ||
                              (typeof attackerName === 'string' && attackerName.includes('axe') && attackerName.includes('dragonute')) ||
                              this.isExactCard(attackerAfterRefresh, 'AxeDragonute');

        logger.info(`🔍 [attackMonster] isAxeDragonute: ${isAxeDragonute}, position: ${attackerAfterRefresh.position}`);

        const isGiantOrc = attackerCardId === 'GiantOrc' ||
                           attackerCardId === 'giantorc' ||
                           attackerName === 'giant orc' ||
                           attackerName === 'giantorc' ||
                           this.isExactCard(attackerAfterRefresh, 'GiantOrc');

        if (isAxeDragonute && attackerAfterRefresh.position === 'attack') {
          logger.info(`🪓 [attackMonster] AxeDragonute atacou - mudando para posição de defesa no final da Etapa de Dano`);
          attackerAfterRefresh.position = 'defense';
          // Marcar que a posição foi alterada neste turno (não pode mudar novamente)
          attackerAfterRefresh.positionChangedThisTurn = true;
          logger.info(`✅ [attackMonster] AxeDragonute mudado para posição de defesa - positionChangedThisTurn marcado`);
        }

        if (isGiantOrc && attackerAfterRefresh.position === 'attack') {
          logger.info(`👹 [attackMonster] GiantOrc atacou - mudando para posição de defesa no final da Etapa de Dano`);
          attackerAfterRefresh.position = 'defense';
          // Marcar que a posição foi alterada neste turno (não pode mudar novamente)
          attackerAfterRefresh.positionChangedThisTurn = true;
          logger.info(`✅ [attackMonster] GiantOrc mudado para posição de defesa - positionChangedThisTurn marcado`);
        }
      }

      // Garantir que as referências no objeto duel estão atualizadas antes de salvar
      if (isPlayer1) {
        (duel as any).player1Field = attackerField;
        (duel as any).player2Field = defenderField;
      } else {
        (duel as any).player1Field = defenderField;
        (duel as any).player2Field = attackerField;
      }

      // Atualizar no banco - SALVAMENTO FINAL com estado completo
      await this.updateDuelInDatabase(duelId, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
      } as any);

      // Atualizar cache local
      this.activeDuels.set(duelIdStr, duel);

      logger.info(`⚔️ [attackMonster] Player ${isPlayer1 ? 1 : 2} atacou - Estado final salvo no banco`, {
        destroyed,
        damage,
        defenderFieldMonsters: defenderField?.monsters?.filter((m: any) => m !== null && m !== undefined).length || 0,
        defenderFieldGraveyard: defenderField?.graveyard?.length || 0
      });

      return { success: true, damage, destroyed };
    } catch (error) {
      logger.error(`❌ [attackMonster] Erro ao finalizar ataque:`, error);
      logger.error(`❌ [attackMonster] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
      return { success: false, message: `Erro ao finalizar ataque: ${error instanceof Error ? error.message : 'Erro desconhecido'}` };
    }
  }

  /**
   * Processa o efeito do MaskedSorcerer: quando causa dano ao oponente OU quando é atacado em defesa e o oponente leva dano,
   * o dono do Masked Sorcerer compra uma carta.
   * @param target - Carta defensor (opcional; quando Masked Sorcerer é atacado em defesa)
   */
  private async processMaskedSorcererEffect(
    duelId: string | number,
    duel: Duel,
    isAttackerPlayer1: boolean,
    attacker: any,
    target?: any
  ): Promise<void> {
    return this.cardEffectsService.executeAction('processMaskedSorcererEffect', this, [duelId, duel, isAttackerPlayer1, attacker, target]);
  }

  /**
   * Processa o efeito do WhiteMagicalHat: quando causa dano ao oponente OU quando é atacada e o oponente leva dano,
   * o oponente descarta uma carta aleatória da mão
   * @param duelId - ID do duelo
   * @param duel - Duelo atual
   * @param isAttackerPlayer1 - Se o atacante é o player1 (ou defensor quando target é WhiteMagicalHat)
   * @param attacker - Carta atacante (ou defensor quando target é WhiteMagicalHat)
   * @param target - Carta defensor (opcional, usado quando WhiteMagicalHat é atacada)
   */
  private async processWhiteMagicalHatEffect(duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, attacker: any, target?: any): Promise<void> {
    return this.cardEffectsService.executeAction('processWhiteMagicalHatEffect', this, [duelId, duel, isAttackerPlayer1, attacker, target]);
  }

  /**
   * Verifica se uma carta é uma carta Chaos que requer invocação especial (banir 1 LIGHT e 1 DARK)
   * Aceita variações de nome/id para Chaos Sorcerer, Chaos Emperor Dragon e BLS
   */
  private isChaosSpecialSummonCard(card: any): { isChaos: boolean; cardName: string } {
    if (!card) return { isChaos: false, cardName: '' };
    const cardNameOrId = (card.name || card.cardName || card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
    const isChaosSorcerer = this.isExactCard(card, 'ChaosSorcerer') ||
      cardNameOrId.includes('chaos sorcerer') || cardNameOrId.includes('chaossorcerer');
    const isChaosEmperorDragon = this.isExactCard(card, 'ChaosEmperorDragon') ||
      cardNameOrId.includes('chaos emperor dragon') || cardNameOrId.includes('chaosemperordragon');
    const isBlackLusterSoldier = this.isExactCard(card, 'BlackLusterSoldierEnvoyOfTheBeginning') ||
      cardNameOrId.includes('black luster soldier') || cardNameOrId.includes('blacklustersoldier');

    if (isChaosSorcerer) return { isChaos: true, cardName: 'ChaosSorcerer' };
    if (isChaosEmperorDragon) return { isChaos: true, cardName: 'ChaosEmperorDragon' };
    if (isBlackLusterSoldier) return { isChaos: true, cardName: 'BlackLusterSoldierEnvoyOfTheBeginning' };

    return { isChaos: false, cardName: '' };
  }

  /**
   * Verifica se uma carta é Red-Eyes Darkness Metal Dragon
   */
  private isRedEyesDarknessMetalDragon(card: any): boolean {
    if (!card) return false;

    const cardId = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase().trim();
    const cardName = (card.name || card.cardName || '').toLowerCase().trim();

    // Verificar por ID
    const redEyesIds = [
      'redeyesdarknessmetaldragon',
      'red-eyesdarknessmetaldragon',
      'redeyesdarknessmetaldragon',
      'red-eyes darkness metal dragon',
      'red eyes darkness metal dragon',
    ];

    // Verificar por nome
    const redEyesNames = [
      'red-eyes darkness metal dragon',
      'red eyes darkness metal dragon',
      'red-eyesdarknessmetaldragon',
      'redeyesdarknessmetaldragon',
    ];

    // Normalizar strings removendo espaços e hífens para comparação
    const normalizeString = (str: string) => str.replace(/[\s-]/g, '').toLowerCase();
    const normalizedCardId = normalizeString(cardId);
    const normalizedCardName = normalizeString(cardName);

    // Verificar se corresponde a algum ID ou nome conhecido
    const matchesId = redEyesIds.some(id => {
      const normalizedId = normalizeString(id);
      return normalizedCardId === normalizedId || normalizedCardId.includes(normalizedId);
    });

    const matchesName = redEyesNames.some(name => {
      const normalizedName = normalizeString(name);
      return normalizedCardName === normalizedName || normalizedCardName.includes(normalizedName);
    });

    return matchesId || matchesName;
  }

  /**
   * Inicia a invocação especial de cartas Chaos (ChaosSorcerer, ChaosEmperorDragon, BlackLusterSoldierEnvoyOfTheBeginning)
   * Cria pendingChoice para o jogador escolher 1 monstro LIGHT e 1 monstro DARK do cemitério
   */
  async startChaosSorcererSpecialSummon(duelId: string | number, userId: number, cardId: string): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startChaosSorcererSpecialSummon', this, [duelId, userId, cardId]);
  }

  /**
   * Invoca ChaosSorcerer por invocação especial
   * Requer: banir 1 monstro LIGHT e 1 monstro DARK do cemitério
   */
  async specialSummonChaosSorcerer(
    duelId: string | number,
    userId: number,
    cardId: string,
    lightMonsterIndex: number,
    darkMonsterIndex: number,
    zoneIndex: number,
    position: 'attack' | 'defense',
    lightMonsterInstanceId?: string,
    darkMonsterInstanceId?: string,
    lightMonsterGraveyardIndex?: number,
    darkMonsterGraveyardIndex?: number
  ): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    logger.info(`🔍 [specialSummonChaosSorcerer] Iniciando invocação especial do ChaosSorcerer:`, {
      duelId: duelIdStr,
      userId,
      cardId,
      lightMonsterIndex,
      darkMonsterIndex,
      zoneIndex,
      position
    });

    // Buscar duelo do banco
    let duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    if (!duel) {
      logger.error(`❌ [specialSummonChaosSorcerer] Duelo não encontrado: ${duelIdStr}`);
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    if (!isCurrentTurn) {
      logger.warn(`⚠️ [specialSummonChaosSorcerer] Não é o turno do jogador`);
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser invocada em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      logger.warn(`⚠️ [specialSummonChaosSorcerer] Não está na fase principal. Fase atual: ${duel.currentPhase}`);
      return { success: false, message: 'Você só pode invocar ChaosSorcerer nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.hand) {
      logger.error(`❌ [specialSummonChaosSorcerer] Campo do jogador não encontrado`);
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    logger.info(`🔍 [specialSummonChaosSorcerer] Buscando ChaosSorcerer na mão com cardId: ${cardId}`);
    logger.info(`🔍 [specialSummonChaosSorcerer] Cartas na mão (${playerField.hand.length}):`, playerField.hand.map((c: any, idx: number) => ({
      index: idx,
      idCarta: c.idCarta,
      id: c.id,
      cardId: c.cardId,
      name: c.name || c.cardName,
    })));

    const cardIdStr = String(cardId).trim();
    const cardIdLower = cardIdStr.toLowerCase();

    // Buscar a carta na mão (pode ser qualquer uma das cartas Chaos)
    // Primeiro, tentar encontrar por ID exato (instanceId tem prioridade, depois idCarta, id, cardId)
    let cardIndex = playerField.hand.findIndex((c: any) => {
      // Verificar instanceId primeiro (mais confiável)
      if (c.instanceId && String(c.instanceId).trim() === cardIdStr) {
        return true;
      }

      // Verificar idCarta
      if (c.idCarta) {
        const cIdCarta = String(c.idCarta).trim();
        if (cIdCarta === cardIdStr || cIdCarta.toLowerCase() === cardIdLower) {
          return true;
        }
      }

      // Verificar id
      if (c.id) {
        const cId = String(c.id).trim();
        if (cId === cardIdStr || cId.toLowerCase() === cardIdLower) {
          return true;
        }
      }

      // Verificar cardId
      if (c.cardId) {
        const cCardId = String(c.cardId).trim();
        if (cCardId === cardIdStr || cCardId.toLowerCase() === cardIdLower) {
          return true;
        }
      }

      // Verificar se algum contém o outro (fallback)
      const cIdCarta = c.idCarta ? String(c.idCarta).toLowerCase().trim() : '';
      const cId = c.id ? String(c.id).toLowerCase().trim() : '';
      const cCardId = c.cardId ? String(c.cardId).toLowerCase().trim() : '';
      const cInstanceId = c.instanceId ? String(c.instanceId).toLowerCase().trim() : '';

      if ((cIdCarta && (cardIdLower.includes(cIdCarta) || cIdCarta.includes(cardIdLower))) ||
          (cId && (cardIdLower.includes(cId) || cId.includes(cardIdLower))) ||
          (cCardId && (cardIdLower.includes(cCardId) || cCardId.includes(cardIdLower))) ||
          (cInstanceId && (cardIdLower.includes(cInstanceId) || cInstanceId.includes(cardIdLower)))) {
        return true;
      }

      return false;
    });

    // Se não encontrou por ID, tentar encontrar por tipo de carta Chaos
    if (cardIndex === -1) {
      logger.info(`🔍 [specialSummonChaosSorcerer] Não encontrado por ID, tentando por tipo de carta Chaos...`);

      // Verificar se o cardId solicitado corresponde a uma carta Chaos
      const requestedIsChaosSorcerer = this.isExactCard({ idCarta: cardId, name: cardId }, 'ChaosSorcerer');
      const requestedIsChaosEmperorDragon = this.isExactCard({ idCarta: cardId, name: cardId }, 'ChaosEmperorDragon');
      const requestedIsBlackLusterSoldier = this.isExactCard({ idCarta: cardId, name: cardId }, 'BlackLusterSoldierEnvoyOfTheBeginning');

      logger.info(`🔍 [specialSummonChaosSorcerer] Tipo solicitado:`, {
        requestedIsChaosSorcerer,
        requestedIsChaosEmperorDragon,
        requestedIsBlackLusterSoldier,
      });

      // Se o cardId solicitado é uma carta Chaos, buscar qualquer carta Chaos do mesmo tipo na mão
      if (requestedIsChaosSorcerer || requestedIsChaosEmperorDragon || requestedIsBlackLusterSoldier) {
        cardIndex = playerField.hand.findIndex((c: any) => {
          const isChaosSorcerer = this.isExactCard(c, 'ChaosSorcerer');
          const isChaosEmperorDragon = this.isExactCard(c, 'ChaosEmperorDragon');
          const isBlackLusterSoldier = this.isExactCard(c, 'BlackLusterSoldierEnvoyOfTheBeginning');

          // Se o tipo solicitado corresponde ao tipo da carta na mão
          if (requestedIsChaosSorcerer && isChaosSorcerer) return true;
          if (requestedIsChaosEmperorDragon && isChaosEmperorDragon) return true;
          if (requestedIsBlackLusterSoldier && isBlackLusterSoldier) return true;

          return false;
        });
      }
    }

    if (cardIndex === -1) {
      logger.error(`❌ [specialSummonChaosSorcerer] Carta Chaos não encontrada na mão!`, {
        cardIdProcurado: cardId,
        cartasNaMao: playerField.hand.map((c: any) => ({
          idCarta: c.idCarta,
          id: c.id,
          cardId: c.cardId,
          instanceId: c.instanceId,
          name: c.name || c.cardName,
        })),
      });
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const c = playerField.hand[cardIndex];
    logger.info(`✅ [specialSummonChaosSorcerer] Carta encontrada na mão no índice ${cardIndex}:`, {
      idCarta: c.idCarta,
      id: c.id,
      cardId: c.cardId,
      instanceId: c.instanceId,
      name: c.name || c.cardName,
    });

    logger.info(`✅ [specialSummonChaosSorcerer] Carta encontrada na mão no índice ${cardIndex}`);

    const card = playerField.hand[cardIndex];

    // Verificar se é uma carta Chaos válida
    const chaosCheck2 = this.isChaosSpecialSummonCard(card);
    if (!chaosCheck2.isChaos) {
      logger.error(`❌ [specialSummonChaosSorcerer] Carta encontrada não é uma carta Chaos válida!`, {
        name: card.name || card.cardName,
        idCarta: card.idCarta,
        id: card.id,
        cardId: card.cardId,
      });
      return { success: false, message: `Esta carta não é ${chaosCheck2.cardName || 'uma carta Chaos válida'}` };
    }

    const cardDisplayName2 = chaosCheck2.cardName;

    // Verificar se o cemitério tem monstros
    if (!playerField.graveyard || !Array.isArray(playerField.graveyard)) {
      return { success: false, message: 'Cemitério não encontrado ou vazio' };
    }

    // Buscar monstros LIGHT e DARK do cemitério
    const graveyard = playerField.graveyard || [];
    const lightMonsters = graveyard
      .map((c: any, index: number) => ({ card: c, originalIndex: index }))
      .filter((item: any) => {
        if (!item.card) return false;
        const cardType = (item.card.type || item.card.cardType || '').toString().toUpperCase().trim();
        const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
        if (!isMonster) return false;
        const attributeRaw = item.card.attribute || item.card.cardAttribute || '';
        const attribute = String(attributeRaw).toUpperCase().trim();
        return attribute === 'LIGHT' || attribute === 'LUZ' || (typeof attribute === 'string' && attribute.includes('LIGHT'));
      });

    const darkMonsters = graveyard
      .map((c: any, index: number) => ({ card: c, originalIndex: index }))
      .filter((item: any) => {
        if (!item.card) return false;
        const cardType = (item.card.type || item.card.cardType || '').toString().toUpperCase().trim();
        const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
        if (!isMonster) return false;
        const attributeRaw = item.card.attribute || item.card.cardAttribute || '';
        const attribute = String(attributeRaw).toUpperCase().trim();
        return attribute === 'DARK' || attribute === 'TREVAS' || (typeof attribute === 'string' && attribute.includes('DARK'));
      });

    // Encontrar os monstros escolhidos pelos índices fornecidos
    if (lightMonsterIndex < 0 || lightMonsterIndex >= lightMonsters.length) {
      return { success: false, message: 'Índice de monstro LIGHT inválido' };
    }

    if (darkMonsterIndex < 0 || darkMonsterIndex >= darkMonsters.length) {
      return { success: false, message: 'Índice de monstro DARK inválido' };
    }

    const selectedLightMonsterItem = lightMonsters[lightMonsterIndex];
    const selectedDarkMonsterItem = darkMonsters[darkMonsterIndex];

    if (!selectedLightMonsterItem || !selectedDarkMonsterItem || !selectedLightMonsterItem.card || !selectedDarkMonsterItem.card) {
      logger.error(`❌ [specialSummonChaosSorcerer] Monstros selecionados inválidos:`, {
        lightMonsterIndex,
        darkMonsterIndex,
        lightMonstersLength: lightMonsters.length,
        darkMonstersLength: darkMonsters.length,
        selectedLightMonsterItem,
        selectedDarkMonsterItem,
      });
      return { success: false, message: 'Monstros selecionados inválidos' };
    }

    const selectedLightMonster = selectedLightMonsterItem.card;
    const selectedDarkMonster = selectedDarkMonsterItem.card;

    logger.info(`🔍 [specialSummonChaosSorcerer] Monstros selecionados:`, {
      lightMonster: {
        name: selectedLightMonster.name || selectedLightMonster.cardName,
        idCarta: selectedLightMonster.idCarta,
        id: selectedLightMonster.id,
        cardId: selectedLightMonster.cardId,
        instanceId: selectedLightMonster.instanceId,
        graveyardIndex: selectedLightMonsterItem.originalIndex,
      },
      darkMonster: {
        name: selectedDarkMonster.name || selectedDarkMonster.cardName,
        idCarta: selectedDarkMonster.idCarta,
        id: selectedDarkMonster.id,
        cardId: selectedDarkMonster.cardId,
        instanceId: selectedDarkMonster.instanceId,
        graveyardIndex: selectedDarkMonsterItem.originalIndex,
      },
    });

    // Buscar os monstros no cemitério usando instanceId ou graveyardIndex quando disponível
    // Isso garante que cada carta seja tratada de forma única, mesmo com mesmo nome
    let lightMonsterIndexInGraveyard = -1;
    let darkMonsterIndexInGraveyard = -1;

    // Se temos instanceId ou graveyardIndex fornecido, usar eles (mais preciso)
    if (lightMonsterInstanceId) {
      lightMonsterIndexInGraveyard = playerField.graveyard.findIndex((c: any) => c && c.instanceId === lightMonsterInstanceId);
    } else if (lightMonsterGraveyardIndex !== undefined && lightMonsterGraveyardIndex >= 0) {
      lightMonsterIndexInGraveyard = lightMonsterGraveyardIndex;
    } else {
      // Fallback para índice original
      lightMonsterIndexInGraveyard = selectedLightMonsterItem.originalIndex;
    }

    if (darkMonsterInstanceId) {
      darkMonsterIndexInGraveyard = playerField.graveyard.findIndex((c: any) => c && c.instanceId === darkMonsterInstanceId);
    } else if (darkMonsterGraveyardIndex !== undefined && darkMonsterGraveyardIndex >= 0) {
      darkMonsterIndexInGraveyard = darkMonsterGraveyardIndex;
    } else {
      // Fallback para índice original
      darkMonsterIndexInGraveyard = selectedDarkMonsterItem.originalIndex;
    }

    if (lightMonsterIndexInGraveyard < 0 || lightMonsterIndexInGraveyard >= graveyard.length) {
      logger.error(`❌ [specialSummonChaosSorcerer] Monstro LIGHT não encontrado no cemitério:`, {
        lightMonsterInstanceId,
        lightMonsterGraveyardIndex,
        originalIndex: selectedLightMonsterItem.originalIndex,
        graveyardLength: graveyard.length
      });
      return { success: false, message: 'Monstro LIGHT não encontrado no cemitério' };
    }

    if (darkMonsterIndexInGraveyard < 0 || darkMonsterIndexInGraveyard >= graveyard.length) {
      logger.error(`❌ [specialSummonChaosSorcerer] Monstro DARK não encontrado no cemitério:`, {
        darkMonsterInstanceId,
        darkMonsterGraveyardIndex,
        originalIndex: selectedDarkMonsterItem.originalIndex,
        graveyardLength: graveyard.length
      });
      return { success: false, message: 'Monstro DARK não encontrado no cemitério' };
    }

    const lightMonsterResult = { monster: graveyard[lightMonsterIndexInGraveyard], index: lightMonsterIndexInGraveyard };
    const darkMonsterResult = { monster: graveyard[darkMonsterIndexInGraveyard], index: darkMonsterIndexInGraveyard };

    if (!lightMonsterResult) {
      logger.error(`❌ [specialSummonChaosSorcerer] Monstro LIGHT não encontrado no cemitério:`, {
        selectedLightMonster,
        graveyardLength: playerField.graveyard.length,
        graveyard: playerField.graveyard.map((c: any, idx: number) => ({
          index: idx,
          name: c.name || c.cardName,
          idCarta: c.idCarta,
          id: c.id,
          cardId: c.cardId,
          instanceId: c.instanceId,
        })),
      });
      return { success: false, message: 'Monstro LIGHT não encontrado no cemitério' };
    }

    if (!darkMonsterResult) {
      logger.error(`❌ [specialSummonChaosSorcerer] Monstro DARK não encontrado no cemitério:`, {
        selectedDarkMonster,
        graveyardLength: playerField.graveyard.length,
      });
      return { success: false, message: 'Monstro DARK não encontrado no cemitério' };
    }

    const lightMonster = lightMonsterResult.monster;
    const darkMonster = darkMonsterResult.monster;
    const lightGraveyardIndex = lightMonsterResult.index;
    const darkGraveyardIndex = darkMonsterResult.index;

    // Verificar se são monstros diferentes
    if (lightGraveyardIndex === darkGraveyardIndex) {
      return { success: false, message: 'Você deve banir 2 monstros diferentes (1 LIGHT e 1 DARK)' };
    }

    // Verificar se são monstros
    const lightIsMonster = (lightMonster.type || lightMonster.cardType) === 'Monster';
    const darkIsMonster = (darkMonster.type || darkMonster.cardType) === 'Monster';

    if (!lightIsMonster || !darkIsMonster) {
      return { success: false, message: 'Ambas as cartas devem ser monstros' };
    }

    // Verificar atributos (validação final antes de invocar)
    // IMPORTANTE: Tentar múltiplas formas de acessar o atributo (pode estar em vários campos)
    const lightAttributeRaw = lightMonster?.attribute ||
                             lightMonster?.cardAttribute ||
                             lightMonster?.card?.attribute ||
                             lightMonster?.card?.cardAttribute || '';
    const lightAttribute = String(lightAttributeRaw).toUpperCase().trim();
    const darkAttributeRaw = darkMonster?.attribute ||
                            darkMonster?.cardAttribute ||
                            darkMonster?.card?.attribute ||
                            darkMonster?.card?.cardAttribute || '';
    const darkAttribute = String(darkAttributeRaw).toUpperCase().trim();

    // Verificação exata: enum CardAttribute.LIGHT = 'LIGHT' e CardAttribute.DARK = 'DARK'
    // Também aceitar variações
    const isLight = lightAttribute === 'LIGHT' ||
                   lightAttribute === 'LUZ' ||
                   (typeof lightAttribute === 'string' && lightAttribute.includes('LIGHT'));
    const isDark = darkAttribute === 'DARK' ||
                  darkAttribute === 'TREVAS' ||
                  (typeof darkAttribute === 'string' && darkAttribute.includes('DARK'));

    logger.info(`🔍 [specialSummonChaosSorcerer] Validando atributos:`, {
      lightMonsterName: lightMonster?.name || lightMonster?.cardName,
      lightMonsterKeys: lightMonster ? Object.keys(lightMonster) : [],
      lightAttributeRaw: lightAttributeRaw,
      lightAttribute: lightAttribute,
      isLight: isLight,
      hasCardRelation: !!lightMonster?.card,
      darkMonsterName: darkMonster?.name || darkMonster?.cardName,
      darkMonsterKeys: darkMonster ? Object.keys(darkMonster) : [],
      darkAttributeRaw: darkAttributeRaw,
      darkAttribute: darkAttribute,
      isDark: isDark,
      hasCardRelationDark: !!darkMonster?.card,
    });

    if (!isLight) {
      return { success: false, message: `A primeira carta selecionada deve ser um monstro LIGHT (atributo atual: "${lightAttributeRaw}")` };
    }

    if (!isDark) {
      return { success: false, message: `A segunda carta selecionada deve ser um monstro DARK (atributo atual: "${darkAttributeRaw}")` };
    }

    // Verificar se a zona está ocupada
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
      return { success: false, message: 'Esta zona de monstro já está ocupada' };
    }

    // Inicializar banished se não existir
    if (!playerField.banished) {
      playerField.banished = [];
    }

    // Banir os monstros (remover do cemitério e adicionar ao banished)
    // Remover do maior índice primeiro para não afetar os índices
    const indicesToRemove = [lightGraveyardIndex, darkGraveyardIndex].sort((a, b) => b - a);
    const banishedMonsters = [];

    for (const index of indicesToRemove) {
      const monster = playerField.graveyard.splice(index, 1)[0];
      playerField.banished.push(monster);
      banishedMonsters.push(monster);
    }

    logger.info(`✨ [specialSummonChaosSorcerer] Monstros banidos:`, {
      light: banishedMonsters.find(m => (m.attribute || '').toUpperCase() === 'LIGHT')?.name,
      dark: banishedMonsters.find(m => (m.attribute || '').toUpperCase() === 'DARK')?.name,
    });

    // Remover carta da mão e colocar no campo
    const cardToSummon = playerField.hand.splice(cardIndex, 1)[0];
    const finalPosition = position === 'defense' ? 'defense' : 'attack';

    // Obter turnCounter
    const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

    playerField.monsters[zoneIndex] = {
      ...cardToSummon,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true, // Marcar como invocação especial
      effectUsedThisTurn: false, // Para rastrear se o efeito foi usado neste turno
    };

    const placedChaos = playerField.monsters[zoneIndex];
    if (placedChaos) {
      const destroyed = await this.checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, zoneIndex, placedChaos, finalPosition as 'attack' | 'defense');
      if (destroyed) {
        this.activeDuels.set(duelIdStr, duel);
        return { success: true };
      }
    }

    const chaosCheckForLog = this.isChaosSpecialSummonCard(cardToSummon);
    const cardDisplayNameForLog = chaosCheckForLog.isChaos ? chaosCheckForLog.cardName : 'Carta Chaos';

    logger.info(`✅ [specialSummonChaosSorcerer] ${cardDisplayNameForLog} invocado por invocação especial:`, {
      name: cardToSummon.name,
      position: finalPosition,
      zoneIndex: zoneIndex,
      banishedLight: banishedMonsters.find(m => (m.attribute || '').toUpperCase() === 'LIGHT')?.name,
      banishedDark: banishedMonsters.find(m => (m.attribute || '').toUpperCase() === 'DARK')?.name,
    });

    logger.info(`💾 [specialSummonChaosSorcerer] Salvando no banco de dados...`);

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    logger.info(`✅ [specialSummonChaosSorcerer] Duelo salvo no banco. Atualizando cache...`);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [specialSummonChaosSorcerer] Cache atualizado. Verificando se o monstro está no campo...`);

    // Verificar se o monstro foi realmente colocado no campo
    const verifyMonster = playerField.monsters[zoneIndex];
    logger.info(`🔍 [specialSummonChaosSorcerer] Verificação final:`, {
      zoneIndex,
      hasMonster: !!verifyMonster,
      monsterName: verifyMonster?.name || verifyMonster?.cardName,
      monsterPosition: verifyMonster?.position,
      monstersArray: playerField.monsters.map((m: any, idx: number) => ({
        index: idx,
        hasMonster: !!m,
        name: m?.name || m?.cardName
      }))
    });

    return { success: true };
  }

  /**
   * Inicia o efeito do ChaosSorcerer (banir monstro face-up)
   * Cria pendingChoice para o jogador escolher o alvo
   */
  async startChaosSorcererEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startChaosSorcererEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  /**
   * Inicia o efeito do Exiled Force: tributar este monstro e destruir 1 monstro no campo
   */
  async startExiledForceEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startExiledForceEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  /**
   * Processa o efeito do ChaosSorcerer: banir 1 monstro face-up do campo
   */
  async processChaosSorcererEffect(duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processChaosSorcererEffect', this, [duelId, userId, monsterZoneIndex, targetPlayer, targetZoneIndex]);
  }

  /**
   * Inicia o efeito do Black Luster Soldier - Envoy of the Beginning (uma vez por turno).
   * Efeito 1: Banir 1 monstro no campo (BLS não pode atacar este turno).
   * Efeito 2: Se BLS destruir um monstro do oponente em batalha, pode atacar novamente.
   * Retorna availableMonsters para o frontend mostrar modal de escolha (efeito 1 = escolher alvo para banir).
   */
  async startBlackLusterSoldierEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startBlackLusterSoldierEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  /**
   * Processa a escolha do efeito do BLS.
   * effectNumber 1: banir targetPlayer/targetZoneIndex e marcar BLS effectUsedThisTurn + cannotAttackThisTurn.
   * effectNumber 2: marcar BLS canAttackAgainIfDestroys = true (segundo ataque se destruir monstro em batalha).
   */
  async processBlackLusterSoldierEffect(
    duelId: string | number,
    userId: number,
    monsterZoneIndex: number,
    effectNumber: 1 | 2,
    targetPlayer?: 'player' | 'opponent',
    targetZoneIndex?: number,
  ): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processBlackLusterSoldierEffect', this, [duelId, userId, monsterZoneIndex, effectNumber, targetPlayer, targetZoneIndex]);
  }

  /**
   * Processa o efeito do Chaos Emperor Dragon: paga 1000 LP, descarta todas as cartas do campo e da mão de ambos os duelistas,
   * e o oponente perde 300 LP por cada carta enviada para o cemitério
   */
  async processChaosEmperorDragonEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; damage?: number }> {
    return this.cardEffectsService.executeAction('processChaosEmperorDragonEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  /**
   * Processa o efeito do Exiled Force: tributar este monstro e destruir 1 monstro no campo
   */
  async processExiledForceChoice(duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processExiledForceChoice', this, [duelId, userId, monsterZoneIndex, targetPlayer, targetZoneIndex]);
  }

  /**
   * Inicia a invocação especial de Red-Eyes Darkness Metal Dragon
   * Requer banir 1 monstro do Tipo Dragão com a face para cima que você controla
   */
  async startRedEyesDarknessMetalDragonSpecialSummon(duelId: string | number, userId: number, cardId: string): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startRedEyesDarknessMetalDragonSpecialSummon', this, [duelId, userId, cardId]);
  }

  /**
   * Invoca Red-Eyes Darkness Metal Dragon por invocação especial
   * Banindo 1 monstro do Tipo Dragão face-up do campo
   */
  async specialSummonRedEyesDarknessMetalDragon(duelId: string | number, userId: number, cardId: string, dragonZoneIndex: number, zoneIndex: number, position: 'attack' | 'defense'): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Iniciando invocação especial:`, {
      duelId: duelIdStr,
      userId,
      cardId,
      dragonZoneIndex,
      zoneIndex,
      position,
    });

    // Buscar duelo do banco
    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      logger.error(`❌ [specialSummonRedEyesDarknessMetalDragon] Duelo não encontrado: ${duelIdStr}`);
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    if (!isCurrentTurn) {
      logger.warn(`⚠️ [specialSummonRedEyesDarknessMetalDragon] Não é o turno do jogador`);
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser invocada em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      logger.warn(`⚠️ [specialSummonRedEyesDarknessMetalDragon] Não está na fase principal. Fase atual: ${duel.currentPhase}`);
      return { success: false, message: 'Você só pode invocar esta carta nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.hand) {
      logger.error(`❌ [specialSummonRedEyesDarknessMetalDragon] Campo do jogador não encontrado`);
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Buscar a carta na mão
    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Procurando carta na mão - cardId recebido: ${cardId}`);
    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Cartas na mão:`, playerField.hand.map((c: any, idx: number) => ({
      index: idx,
      name: c.name || c.cardName,
      idCarta: c.idCarta,
      id: c.id,
      cardId: c.cardId,
      instanceId: c.instanceId
    })));

    const cardIndex = playerField.hand.findIndex((c: any, idx: number) => {
      // Tentar todas as possibilidades de ID
      const cIdCarta = c.idCarta;
      const cId = c.id;
      const cCardId = c.cardId;
      const cInstanceId = c.instanceId;

      // Comparar com o cardId recebido
      const matches = cIdCarta === cardId ||
                     String(cIdCarta) === String(cardId) ||
                     cId === cardId ||
                     String(cId) === String(cardId) ||
                     cCardId === cardId ||
                     String(cCardId) === String(cardId) ||
                     cInstanceId === cardId ||
                     String(cInstanceId) === String(cardId);

      if (matches) {
        logger.info(`✅ [specialSummonRedEyesDarknessMetalDragon] Carta encontrada na mão no índice ${idx}:`, {
          name: c.name || c.cardName,
          idCarta: cIdCarta,
          id: cId,
          cardId: cCardId,
          instanceId: cInstanceId
        });
      }

      return matches;
    });

    if (cardIndex === -1) {
      logger.error(`❌ [specialSummonRedEyesDarknessMetalDragon] Carta não encontrada na mão! cardId procurado: ${cardId}`);
      logger.error(`❌ [specialSummonRedEyesDarknessMetalDragon] IDs disponíveis na mão:`, playerField.hand.map((c: any) => ({
        idCarta: c.idCarta,
        id: c.id,
        cardId: c.cardId,
        instanceId: c.instanceId
      })));
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const card = playerField.hand[cardIndex];

    // Verificar se é Red-Eyes Darkness Metal Dragon
    if (!this.isRedEyesDarknessMetalDragon(card)) {
      logger.error(`❌ [specialSummonRedEyesDarknessMetalDragon] Carta encontrada não é Red-Eyes Darkness Metal Dragon!`);
      return { success: false, message: 'Carta inválida' };
    }

    // Verificar se a própria carta é do Tipo Dragão
    const cardRace = (card.race || card.cardRace || '').toString().toUpperCase().trim();
    const isDragonType = cardRace === 'DRAGON' || cardRace === 'DRAGÃO' || cardRace.includes('DRAGON');

    if (!isDragonType) {
      logger.warn(`⚠️ [specialSummonRedEyesDarknessMetalDragon] Carta não é do tipo Dragon. Race: ${cardRace}`);
      return { success: false, message: 'Red-Eyes Darkness Metal Dragon deve ser do Tipo Dragão para ser invocado por invocação especial' };
    }

    // Verificar se a zona do dragão é válida
    if (dragonZoneIndex < 0 || dragonZoneIndex >= 5) {
      return { success: false, message: 'Zona do dragão inválida' };
    }

    // Verificar se há um dragão na zona especificada
    const dragonToBanish = playerField.monsters[dragonZoneIndex];
    if (!dragonToBanish || dragonToBanish === null) {
      return { success: false, message: 'Não há monstro na zona especificada' };
    }

    // Verificar se é do Tipo Dragão e está face-up
    const race = (dragonToBanish.race || dragonToBanish.cardRace || '').toString().toUpperCase().trim();
    const isDragon = race === 'DRAGON' || race === 'DRAGÃO' || race.includes('DRAGON');

    if (!isDragon) {
      return { success: false, message: 'O monstro selecionado não é do Tipo Dragão' };
    }

    if (dragonToBanish.position !== 'attack' && dragonToBanish.position !== 'defense') {
      return { success: false, message: 'O monstro deve estar face-up (ataque ou defesa)' };
    }

    // Verificar se a zona de invocação é válida
    if (zoneIndex < 0 || zoneIndex >= 5) {
      return { success: false, message: 'Zona de invocação inválida' };
    }

    // Verificar se a zona está vazia
    if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
      return { success: false, message: 'A zona de invocação já está ocupada' };
    }

    // Inicializar banished se não existir
    if (!playerField.banished) {
      playerField.banished = [];
    }

    // Banir o dragão
    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Antes de banir - dragonZoneIndex: ${dragonZoneIndex}, banished length: ${playerField.banished?.length || 0}`);
    playerField.monsters[dragonZoneIndex] = null;
    playerField.banished.push(dragonToBanish);
    logger.info(`✨ [specialSummonRedEyesDarknessMetalDragon] Dragão banido: ${dragonToBanish.name || dragonToBanish.cardName}, banished length após: ${playerField.banished.length}`);
    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Monstros após banimento:`, playerField.monsters.map((m: any, i: number) => ({
      index: i,
      name: m?.name || 'null',
      position: m?.position || 'null'
    })));

    // Remover carta da mão e colocar no campo
    const cardToSummon = playerField.hand.splice(cardIndex, 1)[0];
    const finalPosition = position === 'defense' ? 'defense' : 'attack';

    // Obter turnCounter
    const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Antes de invocar - zoneIndex: ${zoneIndex}, cardToSummon: ${cardToSummon.name || cardToSummon.cardName}`);
    playerField.monsters[zoneIndex] = {
      ...cardToSummon,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true,
      effectUsedThisTurn: false, // Para rastrear se o efeito foi usado neste turno
    };

    const placedRedEyes = playerField.monsters[zoneIndex];
    if (placedRedEyes) {
      const destroyed = await this.checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, zoneIndex, placedRedEyes, finalPosition as 'attack' | 'defense');
      if (destroyed) {
        duel.pendingChoice = null;
        this.activeDuels.set(duelIdStr, duel);
        return { success: true };
      }
    }

    logger.info(`✅ [specialSummonRedEyesDarknessMetalDragon] Red-Eyes Darkness Metal Dragon invocado por invocação especial:`, {
      name: cardToSummon.name,
      position: finalPosition,
      zoneIndex: zoneIndex,
      banishedDragon: dragonToBanish.name || dragonToBanish.cardName,
    });

    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Monstros após invocação:`, playerField.monsters.map((m: any, i: number) => ({
      index: i,
      name: m?.name || 'null',
      position: m?.position || 'null',
      specialSummoned: m?.specialSummoned
    })));

    // Limpar pendingChoice ANTES de atualizar no banco
    logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Limpando pendingChoice - antes: ${duel.pendingChoice ? duel.pendingChoice.type : 'null'}`);
    duel.pendingChoice = null;

    // Atualizar no banco
    await this.updateDuelInDatabase(duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache - buscar do banco para garantir dados atualizados
    const finalDuel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    if (finalDuel) {
      this.activeDuels.set(duelIdStr, finalDuel);
      logger.info(`✅ [specialSummonRedEyesDarknessMetalDragon] Cache atualizado após invocação especial`);

      // Verificar se o monstro está realmente no campo
      const playerFieldAfter = isPlayer1 ? (finalDuel as any).player1Field : (finalDuel as any).player2Field;
      const summonedMonster = playerFieldAfter?.monsters?.[zoneIndex];
      logger.info(`🔍 [specialSummonRedEyesDarknessMetalDragon] Verificação pós-invocação:`, {
        zoneIndex,
        hasMonster: !!summonedMonster,
        monsterName: summonedMonster?.name || summonedMonster?.cardName,
        position: summonedMonster?.position,
        specialSummoned: summonedMonster?.specialSummoned
      });
    }

    return { success: true };
  }

  /**
   * Inicia o efeito do Red-Eyes Darkness Metal Dragon
   * Uma vez por turno: invocar por invocação especial 1 monstro do Tipo Dragão da mão ou cemitério
   */
  async startRedEyesDarknessMetalDragonEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
    return this.cardEffectsService.executeAction('startRedEyesDarknessMetalDragonEffect', this, [duelId, userId, monsterZoneIndex]);
  }

  /**
   * Processa o efeito do Red-Eyes Darkness Metal Dragon: invocar 1 dragão da mão ou cemitério
   */
  async processRedEyesDarknessMetalDragonEffect(duelId: string | number, userId: number, monsterZoneIndex: number, source: 'hand' | 'graveyard', cardIndex: number, zoneIndex: number, position: 'attack' | 'defense'): Promise<{ success: boolean; message?: string }> {
    return this.cardEffectsService.executeAction('processRedEyesDarknessMetalDragonEffect', this, [duelId, userId, monsterZoneIndex, source, cardIndex, zoneIndex, position]);
  }

  /**
   * Vira um monstro de face-down para face-up manualmente
   */
  async flipMonster(duelId: string | number, userId: number, zoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Buscar duelo do banco (forçar do banco para ter turnCounter atualizado)
    let duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    // CRÍTICO: Sincronizar turnCounter do JSON com o banco
    const p1Counter = (duel as any).player1Field?.turnCounter || 0;
    const p2Counter = (duel as any).player2Field?.turnCounter || 0;
    const dbCounter = duel.turnCounter || 0;
    const maxCounter = Math.max(p1Counter, p2Counter, dbCounter, 1);

    // Sincronizar todos para o maior valor
    if ((duel as any).player1Field) {
      (duel as any).player1Field.turnCounter = maxCounter;
    }
    if ((duel as any).player2Field) {
      (duel as any).player2Field.turnCounter = maxCounter;
    }
    duel.turnCounter = maxCounter;

    logger.info(`🔄 [flipMonster] Sincronizado turnCounter: ${maxCounter} (p1=${p1Counter}, p2=${p2Counter}, db=${dbCounter})`);

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);

    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode virar monstros nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.monsters) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Garantir que monsters seja um array de 5 elementos
    if (!Array.isArray(playerField.monsters)) {
      playerField.monsters = [null, null, null, null, null];
    }
    while (playerField.monsters.length < 5) {
      playerField.monsters.push(null);
    }
    playerField.monsters = playerField.monsters.slice(0, 5);

    if (zoneIndex < 0 || zoneIndex >= 5) {
      return { success: false, message: 'Zona inválida' };
    }

    const monster = playerField.monsters[zoneIndex];
    if (!monster) {
      return { success: false, message: 'Não há monstro nesta zona' };
    }

    // Verificar se está em posição 'set' (face-down)
    if (monster.position !== 'set') {
      return { success: false, message: 'Este monstro já está virado para cima' };
    }

    // Obter contador global de turnos do JSON (prioridade) ou do banco (fallback)
    const playerFieldForCounter = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const currentTurnCounter = playerFieldForCounter?.turnCounter || duel.turnCounter || 1;

    // Verificar se o monstro foi invocado no turno atual DO MESMO JOGADOR
    // Regra: Um monstro só pode ser virado no PRÓXIMO turno do mesmo jogador que o invocou
    const summonedTurnNumber = monster.summonedTurnNumber;
    const summonedByPlayer = monster.summonedByPlayer;

    logger.info(`🔍 [flipMonster] Verificando turno de invocação:`);
    logger.info(`   - summonedTurnNumber: ${summonedTurnNumber} (tipo: ${typeof summonedTurnNumber})`);
    logger.info(`   - summonedByPlayer: ${summonedByPlayer} (tipo: ${typeof summonedByPlayer})`);
    logger.info(`   - currentTurnCounter: ${currentTurnCounter} (tipo: ${typeof currentTurnCounter})`);
    logger.info(`   - currentTurn (jogador atual): ${duel.currentTurn}`);
    logger.info(`   - isPlayer1: ${isPlayer1}`);

    // Verificar se foi invocado no turno atual DO MESMO JOGADOR
    if (summonedTurnNumber != null && summonedByPlayer != null) {
      const isSamePlayer = (isPlayer1 && summonedByPlayer === 1) || (!isPlayer1 && summonedByPlayer === 2);
      const isSameTurn = summonedTurnNumber === currentTurnCounter;

      logger.info(`   - É o mesmo jogador? ${isSamePlayer}`);
      logger.info(`   - É o mesmo turno global? ${isSameTurn}`);

      if (isSamePlayer && isSameTurn) {
        logger.info(`❌ [flipMonster] Bloqueado: monstro foi invocado no turno ${summonedTurnNumber} pelo mesmo jogador (${summonedByPlayer}), turno atual: ${currentTurnCounter}`);
        return { success: false, message: 'Você não pode virar um monstro no mesmo turno em que foi invocado' };
      }

      const diff = currentTurnCounter - summonedTurnNumber;
      logger.info(`✅ [flipMonster] Monstro foi invocado no turno ${summonedTurnNumber} pelo jogador ${summonedByPlayer}, turno atual é ${currentTurnCounter} (diferença: ${diff}). PERMITINDO flip.`);
    } else if (summonedTurnNumber == null) {
      logger.info(`⚠️ [flipMonster] summonedTurnNumber não definido para ${monster.name}, permitindo flip`);
    }

    // Verificar se ESTE monstro já mudou posição neste turno (flipar também conta como mudança de posição)
    if (monster.positionChangedThisTurn === undefined || monster.positionChangedThisTurn === null) {
      monster.positionChangedThisTurn = false;
    }
    if (monster.positionChangedThisTurn === true) {
      return { success: false, message: 'Este monstro já teve sua posição alterada neste turno. Cada monstro só pode mudar de posição uma vez por turno.' };
    }

    // Virar para 'defense' (face-up em defesa)
    monster.position = 'defense';

    // Marcar que ESTE monstro já mudou posição neste turno (flipar conta como mudança)
    monster.positionChangedThisTurn = true;

    // Verificar se é Fiber Jar, SnowmanEater, MorphingJar ou Dekoichi e processar efeito de flip (Dekoichi compra 1 quando flipa)
    const isFiberJar = this.isExactCard(monster, 'FiberJar');
    const isSnowmanEater = this.isExactCard(monster, 'SnowmanEater');
    const isMorphingJar = this.isExactCard(monster, 'MorphingJar');
    const monsterNameOrIdFlip = (monster.name || monster.cardName || monster.idCarta || monster.id || monster.cardId || '').toString().toLowerCase();
    const isDekoichi = this.isExactCard(monster, 'DekoichiTheBattlechantedLocomotive') || monsterNameOrIdFlip.includes('dekoichi');

    if (isFiberJar || isSnowmanEater || isMorphingJar || isDekoichi) {
      await this.cardEffectsService.processFlipEffect(duelIdStr, duel, isPlayer1, monster, zoneIndex);
    }

    // Berfomet: When Flip Summoned
    if (Berfomet.isBerfomet(monster) && !(duel as any).pendingChoice) {
      await this.tryStartBerfometSearch(duelId, duel, isPlayer1, zoneIndex);
      // Persistir pendingChoice se criado
      if ((duel as any).pendingChoice?.type === 'BERFOMET_SEARCH') {
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          pendingChoice: (duel as any).pendingChoice,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
        // Retornar antecipadamente para não sobrescrever o pendingChoice
        return { success: true };
      }
    }

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Recalcular UnitedWeStand para ambos os jogadores (monstro foi virado face-up)
    await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return { success: true };
  }

  async updateLifePoints(duelId: string | number, player: 1 | 2, newLifePoints: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;

    if (player === 1) {
      duel.player1LifePoints = newLifePoints;
        } else {
      duel.player2LifePoints = newLifePoints;
    }

    // Código de salvamento removido - apenas atualizar em memória
  }

  /**
   * Vai diretamente para uma fase específica, respeitando as regras:
   * - Não pode voltar para fases passadas
   * - Não pode pular BATTLE no primeiro turno do primeiro jogador
   * - Se já está na fase alvo, não faz nada
   */
  async goToPhase(duelId: string | number, targetPhase: TurnPhase): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    // Se não encontrou em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) return null;
      duel = duelFromDb;
    }

    const phases = [TurnPhase.DRAW, TurnPhase.STANDBY, TurnPhase.MAIN1, TurnPhase.BATTLE, TurnPhase.MAIN2, TurnPhase.END];
    const currentIndex = phases.indexOf(duel.currentPhase);
    const targetIndex = phases.indexOf(targetPhase);

    // Se a fase alvo não é válida, retornar null
    if (targetIndex === -1) {
      logger.warn(`⚠️ [goToPhase] Fase alvo inválida: ${targetPhase}`);
      return null;
    }

    // Se já está na fase alvo: em END ainda tentar DMoC (caso chegou sem o gancho)
    if (currentIndex === targetIndex) {
      if (targetPhase === TurnPhase.END && !(duel as any).pendingChoice) {
        const dmocRetry = await this.tryStartDarkMagicianOfChaosEndPhase(duelId, duel);
        if (dmocRetry) {
          await this.updateDuelInDatabase(duelId, {
            currentPhase: TurnPhase.END,
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
            pendingChoice: (duel as any).pendingChoice,
          } as any);
          this.activeDuels.set(duelIdStr, duel);
          logger.info(`🌑 [goToPhase] Já em END — escolha DMoC iniciada`);
          return duel;
        }
      }
      logger.info(`ℹ️ [goToPhase] Já está na fase ${targetPhase}, não fazendo nada`);
      return duel;
    }

    // Não pode voltar para fases passadas
    if (targetIndex < currentIndex) {
      logger.warn(`⚠️ [goToPhase] Não é possível voltar para fases passadas. Fase atual: ${duel.currentPhase}, Fase alvo: ${targetPhase}`);
      return null;
    }

    // Verificar se é o primeiro turno de quem começou o duelo (não confundir com “sempre player 1”)
    const currentTurnCounter = duel.turnCounter || 1;
    const isFirstTurn = currentTurnCounter === 1;
    const isPlayer1Turn = duel.currentTurn === 1;
    const firstSeat = this.getFirstTurnPlayerSeat(duel);
    const voidedGt = this.hasStarterFirstTurnRulesVoided(duel);
    const isFirstTurnOfStartingPlayer =
      !voidedGt &&
      isFirstTurn &&
      (firstSeat != null ? duel.currentTurn === firstSeat : isPlayer1Turn);

    // Se é o primeiro turno de quem começou e está tentando ir para BATTLE, ir para MAIN2
    if (isFirstTurnOfStartingPlayer && targetPhase === TurnPhase.BATTLE) {
      logger.info(`⏭️ [goToPhase] Primeiro turno de quem começou - redirecionando BATTLE para MAIN2`);
      return this.goToPhase(duelId, TurnPhase.MAIN2);
    }

    // Se é o primeiro turno de quem começou e está tentando ir para uma fase após BATTLE, pular BATTLE
    if (isFirstTurnOfStartingPlayer && targetIndex > phases.indexOf(TurnPhase.BATTLE) && currentIndex < phases.indexOf(TurnPhase.BATTLE)) {
      // Se está antes de BATTLE e quer ir para MAIN2 ou END, pode ir direto
      if (targetPhase === TurnPhase.MAIN2 || targetPhase === TurnPhase.END) {
        logger.info(`⏭️ [goToPhase] Primeiro turno do primeiro jogador - pulando BATTLE para ir para ${targetPhase}`);
        duel.currentPhase = targetPhase;
      } else {
        logger.warn(`⚠️ [goToPhase] Não é possível ir para ${targetPhase} no primeiro turno de quem começou`);
        return null;
      }
    } else {
      // Caso normal: ir diretamente para a fase alvo
      duel.currentPhase = targetPhase;
    }

    // Se foi para END, descartar automaticamente se necessário e avançar turno
    if (duel.currentPhase === TurnPhase.END) {
      const currentPlayer = duel.currentTurn;
      const playerField = currentPlayer === 1 ? (duel as any).player1Field : (duel as any).player2Field;
      const hand = playerField?.hand || [];

      // Se tem mais de 6 cartas, descartar automaticamente de forma aleatória
      if (hand.length > 6) {
        logger.info(`🔄 [goToPhase] Player ${currentPlayer} tem ${hand.length} cartas na mão. Descartando automaticamente até ficar com 6.`);
        const updatedDuel = await this.discardCards(duelId, currentPlayer as 1 | 2, undefined, true);
        if (updatedDuel) {
          duel = updatedDuel;
          logger.info(`✅ [goToPhase] Descartadas ${hand.length - 6} cartas aleatoriamente. Mão: ${hand.length} -> ${(updatedDuel as any).player1Field?.hand?.length || (updatedDuel as any).player2Field?.hand?.length || 0}`);
        }
      }

      // Verificar SwordsOfRevealingLight antes de mudar turno (usar duelo fresco do banco para turnCounter e dados das cartas)
      const duelForSwordsCheck = await this.findDuelByIdFromDatabase(duelIdStr) || duel;
      await this.checkAndDestroySwordsOfRevealingLight(duelId, duelForSwordsCheck);
      const updatedDuel = await this.findDuelByIdFromDatabase(duelIdStr);
      if (updatedDuel) {
        duel = updatedDuel;
      }

      // Verificar novamente se precisa descartar (caso algo tenha mudado)
      const handAfterCheck = (duel.currentTurn === 1 ? (duel as any).player1Field : (duel as any).player2Field)?.hand || [];
      if (handAfterCheck.length > 6) {
        logger.info(`🔄 [goToPhase] Player ${duel.currentTurn} ainda tem ${handAfterCheck.length} cartas na mão. Descartando automaticamente.`);
        const player = duel.currentTurn as 1 | 2;
        const finalDuel = await this.discardCards(duelId, player, undefined, true);
        if (finalDuel) {
          duel = finalDuel;
        }
      }

      // Dark Magician of Chaos — End Phase (goToPhase END é o caminho mais usado no frontend)
      const dmocStarted = await this.tryStartDarkMagicianOfChaosEndPhase(duelId, duel);
      if (dmocStarted) {
        await this.updateDuelInDatabase(duelId, {
          currentPhase: TurnPhase.END,
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          pendingChoice: (duel as any).pendingChoice,
        } as any);
        this.activeDuels.set(duelIdStr, duel);
        logger.info(`🌑 [goToPhase] End Phase pausada — aguardando escolha Dark Magician of Chaos`);
        return duel;
      }

      // Avançar turno automaticamente após descartar (se necessário)
      logger.info(`🔄 [goToPhase] END detectado, chamando advanceToNextTurn para incrementar turnCounter`);
      const advanceResult = await this.advanceToNextTurn(duelId);
      if (advanceResult.duel) {
        return advanceResult.duel;
      }
    }

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      currentPhase: duel.currentPhase,
    } as any);
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [goToPhase] Duelo ${duelIdStr} mudou para fase ${duel.currentPhase}`);
    return duel;
  }

  async nextPhase(duelId: string | number): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) return null;
      duel = duelFromDb;
    }

    // DRAW é sempre processada por processDrawPhase (nunca avançar por nextPhase)
    if (duel.currentPhase === TurnPhase.DRAW) {
      logger.debug(`⚠️ [nextPhase] Ignorando nextPhase em DRAW - use processDrawPhase`);
      return null;
    }

    const phases = [TurnPhase.DRAW, TurnPhase.STANDBY, TurnPhase.MAIN1, TurnPhase.BATTLE, TurnPhase.MAIN2, TurnPhase.END];
    const currentIndex = phases.indexOf(duel.currentPhase);

    // Verificar se é o primeiro turno de quem começou o duelo
    const currentTurnCounter = duel.turnCounter || 1;
    const isFirstTurn = currentTurnCounter === 1;
    const isPlayer1Turn = duel.currentTurn === 1;
    const firstSeatNp = this.getFirstTurnPlayerSeat(duel);
    const voidedNp = this.hasStarterFirstTurnRulesVoided(duel);
    const isFirstTurnOfStartingPlayer =
      !voidedNp &&
      isFirstTurn &&
      (firstSeatNp != null ? duel.currentTurn === firstSeatNp : isPlayer1Turn);

    // Se está em MAIN2 ou antes, avançar normalmente
    // Quando chegar em END, verificar se precisa descartar antes de avançar turno
    if (currentIndex < phases.length - 2) {
      // Se está em BATTLE no primeiro turno de quem começou, pular direto para MAIN2
      // (porque não pode atacar nesse primeiro turno)
      if (isFirstTurnOfStartingPlayer && duel.currentPhase === TurnPhase.BATTLE) {
        logger.info(`⏭️ [nextPhase] Primeiro turno de quem começou em BATTLE - pulando para MAIN2 (não pode atacar)`);
        duel.currentPhase = TurnPhase.MAIN2;
      } else {
        // Avançar para a próxima fase normalmente
        // IMPORTANTE: No primeiro turno, o jogador pode passar por MAIN1 normalmente
        // Apenas quando tentar avançar de BATTLE é que pula para MAIN2
        duel.currentPhase = phases[currentIndex + 1];
      }
    } else {
      // Se está em MAIN2, descartar automaticamente se necessário ao ir para END
      if (duel.currentPhase === TurnPhase.MAIN2) {
        // Verificar quantas cartas o jogador atual tem na mão
        const currentPlayer = duel.currentTurn;
        const playerField = currentPlayer === 1 ? (duel as any).player1Field : (duel as any).player2Field;
        const hand = playerField?.hand || [];

        // Mudar para END
          duel.currentPhase = TurnPhase.END;

        // Se tem mais de 6 cartas, descartar automaticamente de forma aleatória
        if (hand.length > 6) {
          logger.info(`🔄 [nextPhase] Player ${currentPlayer} tem ${hand.length} cartas na mão. Descartando automaticamente até ficar com 6.`);
          const updatedDuel = await this.discardCards(duelId, currentPlayer as 1 | 2, undefined, true);
          if (updatedDuel) {
            duel = updatedDuel;
            logger.info(`✅ [nextPhase] Descartadas ${hand.length - 6} cartas aleatoriamente. Mão: ${hand.length} -> ${(updatedDuel as any).player1Field?.hand?.length || (updatedDuel as any).player2Field?.hand?.length || 0}`);
          }
        } else {
          logger.info(`✅ [nextPhase] Player ${currentPlayer} tem ${hand.length} cartas (≤6). Avançando para END.`);
        }

        // Dark Magician of Chaos — efeito opcional de End Phase (interrompe avanço de turno)
        const dmocStarted = await this.tryStartDarkMagicianOfChaosEndPhase(duelId, duel);
        if (dmocStarted) {
          await this.updateDuelInDatabase(duelId, {
            currentPhase: TurnPhase.END,
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
            pendingChoice: (duel as any).pendingChoice,
          } as any);
          this.activeDuels.set(duelIdStr, duel);
          logger.info(`🌑 [nextPhase] End Phase pausada — aguardando escolha Dark Magician of Chaos`);
          return duel;
        }
      }

      // Se está em END, verificar SwordsOfRevealingLight antes de mudar turno
      if (duel.currentPhase === TurnPhase.END) {
        // Caso chegou em END sem passar por MAIN2 (ex.: goToPhase antigo) — ainda oferecer DMoC
        if (!(duel as any).pendingChoice) {
          const dmocOnEnd = await this.tryStartDarkMagicianOfChaosEndPhase(duelId, duel);
          if (dmocOnEnd) {
            await this.updateDuelInDatabase(duelId, {
              currentPhase: TurnPhase.END,
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
              pendingChoice: (duel as any).pendingChoice,
            } as any);
            this.activeDuels.set(duelIdStr, duel);
            logger.info(`🌑 [nextPhase] End Phase pausada (já em END) — aguardando DMoC`);
            return duel;
          }
        }

        // Buscar duelo fresco do banco para ter turnCounter e dados das cartas (ex: activationTurnCounter da Swords) corretos
        const duelForCheck = await this.findDuelByIdFromDatabase(duelIdStr) || duel;
        await this.checkAndDestroySwordsOfRevealingLight(duelId, duelForCheck);
        // Re-buscar duelo após verificar SwordsOfRevealingLight
        const updatedDuel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (updatedDuel) {
          duel = updatedDuel;
        }

        // Verificar novamente se precisa descartar (pode ter mudado após verificar SwordsOfRevealingLight)
        const currentPlayer = duel.currentTurn;
        const playerField = currentPlayer === 1 ? (duel as any).player1Field : (duel as any).player2Field;
        const hand = playerField?.hand || [];

        // Se ainda tem mais de 6 cartas, descartar automaticamente
        if (hand.length > 6) {
          logger.info(`🔄 [nextPhase] Player ${currentPlayer} ainda tem ${hand.length} cartas na mão. Descartando automaticamente.`);
          const updatedDuel = await this.discardCards(duelId, currentPlayer as 1 | 2, undefined, true);
          if (updatedDuel) {
            duel = updatedDuel;
            logger.info(`✅ [nextPhase] Descartadas ${hand.length - 6} cartas aleatoriamente. Mão: ${hand.length} -> ${(updatedDuel as any).player1Field?.hand?.length || (updatedDuel as any).player2Field?.hand?.length || 0}`);
          }
        }
      }

      // Se está em MAIN2 ou END e não precisa descartar, mudar turno automaticamente
      // CRÍTICO: Chamar advanceToNextTurn para incrementar turnCounter corretamente
      logger.info(`🔄 [nextPhase] MAIN2/END detectado, chamando advanceToNextTurn para incrementar turnCounter`);
      const advanceResult = await this.advanceToNextTurn(duelId);
      if (advanceResult.duel) {
        return advanceResult.duel;
      }

      // Se advanceToNextTurn não retornou duelo, fazer mudança manual (fallback)
      logger.info(`⚠️ [nextPhase] advanceToNextTurn não retornou duelo, fazendo mudança manual`);
      if ((duel as any).player1Field) {
        (duel as any).player1Field.normalSummonUsed = false;
        (duel as any).player1Field.bonusNormalSummonsRemaining = 0;
        (duel as any).player1Field.monsterDestroyedThisTurn = false; // Resetar flag para Last Will
        if ((duel as any).player1Field.monsters && Array.isArray((duel as any).player1Field.monsters)) {
          (duel as any).player1Field.monsters.forEach((monster: any) => {
            if (monster) {
              monster.positionChangedThisTurn = false;
              monster.effectUsedThisTurn = false;
              monster.cannotAttackThisTurn = false;
            }
          });
        }
      }
      if ((duel as any).player2Field) {
        (duel as any).player2Field.normalSummonUsed = false;
        (duel as any).player2Field.bonusNormalSummonsRemaining = 0;
        if ((duel as any).player2Field.monsters && Array.isArray((duel as any).player2Field.monsters)) {
          (duel as any).player2Field.monsters.forEach((monster: any) => {
            if (monster) {
              monster.positionChangedThisTurn = false;
              monster.effectUsedThisTurn = false;
              monster.cannotAttackThisTurn = false;
            }
          });
        }
      }

      // Incrementar turnCounter manualmente se advanceToNextTurn falhou
      const p1Counter = (duel as any).player1Field?.turnCounter || 0;
      const p2Counter = (duel as any).player2Field?.turnCounter || 0;
      const dbCounter = duel.turnCounter || 0;
      const currentTurnCounter = Math.max(p1Counter, p2Counter, dbCounter, 1);
      const newTurnCounter = currentTurnCounter + 1;

      if ((duel as any).player1Field) {
        (duel as any).player1Field.turnCounter = newTurnCounter;
      }
      if ((duel as any).player2Field) {
        (duel as any).player2Field.turnCounter = newTurnCounter;
      }
      duel.turnCounter = newTurnCounter;

      duel.currentTurn = duel.currentTurn === 1 ? 2 : 1;
      duel.currentPhase = TurnPhase.DRAW;
      (duel as any).turnTime = 90;
      (duel as any).turnStartedAt = new Date();

      logger.info(`🔄 [nextPhase] Mudança automática de turno - MAIN2 → próximo jogador (Turno ${duel.currentTurn}), turnCounter: ${newTurnCounter}`);

      // Atualizar no banco - o gateway vai processar a DRAW e emitir as atualizações
      await this.updateDuelInDatabase(duelId, {
        currentTurn: duel.currentTurn,
        currentPhase: TurnPhase.DRAW,
        turnTime: 90,
        turnStartedAt: new Date(),
        turnCounter: duel.turnCounter,
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      } as any);

      // Garantir que o duelo está no cache
      this.activeDuels.set(duelIdStr, duel);
    }

    // NUNCA processar DRAW automaticamente quando não é mudança de turno
    // A fase DRAW só deve ser processada automaticamente quando o turno muda

    setImmediate(async () => {
      const updates: any = {
        currentPhase: duel.currentPhase,
        currentTurn: duel.currentTurn,
      };
      // Se mudou de turno (currentPhase === DRAW), adicionar tempo e timestamp
      if (duel.currentPhase === TurnPhase.DRAW) {
        updates.turnTime = 90;
        updates.turnStartedAt = new Date();
      }
      await this.updateDuelInDatabase(duelId, updates);
    });

      return duel;
  }

  /**
   * Calcula o tempo restante do turno baseado no timestamp de quando o turno começou
   * @param duel - O duelo para calcular o tempo
   * @returns Tempo restante em segundos (0 se expirado)
   */
  calculateTurnTimeRemaining(duel: Duel): number {
    const turnTimeLimit = (duel as any).turnTime || 90;
    const turnStartedAt = (duel as any).turnStartedAt;

    // Se não há timestamp, assumir que o turno começou agora
    if (!turnStartedAt) {
      return turnTimeLimit;
    }

    const now = new Date();
    const startedAt = turnStartedAt instanceof Date ? turnStartedAt : new Date(turnStartedAt);
    const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
    const remaining = Math.max(0, turnTimeLimit - elapsedSeconds);

    return remaining;
  }

  async updateDuelTime(duelId: string | number, timeInSeconds: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) return;

    (duel as any).duelTime = timeInSeconds;

    setImmediate(async () => {
      await this.updateDuelInDatabase(duelId, {
        duelTime: timeInSeconds,
      } as any);
    });
  }

  /**
   * Descarta cartas da mão para o cemitério
   * @param duelId - ID do duelo
   * @param player - 1 ou 2 (qual jogador)
   * @param cardIds - IDs das cartas a descartar (se não fornecido, descarta aleatoriamente até ficar com 6)
   * @param random - Se true, descarta aleatoriamente (usado quando oponente rouba turno)
   */
  /**
   * Descarta uma carta individualmente da mão para o cemitério
   * @param duelId - ID do duelo
   * @param player - 1 ou 2 (qual jogador)
   * @param cardId - ID da carta a descartar
   */
  async discardSingleCard(duelId: string | number, player: 1 | 2, cardId: string): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    // Se não encontrou em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) return null;
      duel = duelFromDb;
    }

    const playerField = player === 1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField || !playerField.hand) return null;

    const hand = [...(playerField.hand || [])]; // Criar cópia para não modificar diretamente
    const graveyard = [...(playerField.graveyard || [])]; // Criar cópia

    // Verificar se tem mais de 6 cartas antes de permitir descartar
    if (hand.length <= 6) {
      logger.warn(`⚠️ [discardSingleCard] Player ${player} tem ${hand.length} cartas (máximo 6), não precisa descartar`);
      return duel;
    }

    // Encontrar a carta na mão (apenas a primeira ocorrência)
    const cardIndex = hand.findIndex((card: any) => {
      const cardIdValue = card.id || card.cardId || card.idCarta;
      return cardIdValue?.toString() === cardId.toString();
    });

    if (cardIndex === -1) {
      logger.warn(`⚠️ [discardSingleCard] Carta ${cardId} não encontrada na mão do player ${player}`);
      return null;
    }

    // Remover APENAS UMA carta da mão (a primeira encontrada)
    const cardToDiscard = hand[cardIndex];
    const newHand = hand.filter((_, index) => index !== cardIndex); // Remove apenas no índice encontrado
    const newGraveyard = [...graveyard, cardToDiscard];

    logger.info(`🔄 [discardSingleCard] Player ${player} - Antes: ${hand.length} cartas na mão, ${graveyard.length} no cemitério`);
    logger.info(`🔄 [discardSingleCard] Player ${player} - Descartando carta ID: ${cardId}, índice: ${cardIndex}`);
    logger.info(`🔄 [discardSingleCard] Player ${player} - Depois: ${newHand.length} cartas na mão, ${newGraveyard.length} no cemitério`);

    // Atualizar o campo do jogador
    if (player === 1) {
      (duel as any).player1Field = {
        ...playerField,
        hand: newHand,
        graveyard: newGraveyard,
      };
    } else {
      (duel as any).player2Field = {
        ...playerField,
        hand: newHand,
        graveyard: newGraveyard,
      };
    }

    // Salvar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    logger.info(`✅ [discardSingleCard] Player ${player} descartou 1 carta. Mão: ${hand.length} -> ${newHand.length}, Cemitério: ${graveyard.length} -> ${newGraveyard.length}`);

    return duel;
  }

  async discardCards(duelId: string | number, player: 1 | 2, cardIds?: string[], random: boolean = false): Promise<Duel | null> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    // Se não encontrou em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) return null;
      duel = duelFromDb;
    }

    const playerField = player === 1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField || !playerField.hand) return null;

    const hand = playerField.hand || [];
    const graveyard = playerField.graveyard || [];

    // Se tem 6 ou menos cartas, não precisa descartar
    if (hand.length <= 6) {
      return duel;
    }

    // Quantas cartas precisa descartar
    const cardsToDiscard = hand.length - 6;
    let cardsToRemove: any[] = [];

    if (random || !cardIds || cardIds.length === 0) {
      // Descarte aleatório: embaralhar e pegar as primeiras
      // IMPORTANTE: Trabalha com objetos completos das cartas, então cada carta
      // (mesmo que tenha o mesmo nome) é tratada como única devido ao instanceId
      const shuffled = [...hand].sort(() => Math.random() - 0.5);
      cardsToRemove = shuffled.slice(0, cardsToDiscard);
    } else {
      // Descarte selecionado: pegar as cartas especificadas
      cardsToRemove = hand.filter((card: any) => {
        const cardId = card.id || card.cardId || card.idCarta;
        return cardIds.includes(cardId?.toString());
      });

      // Validar que tem a quantidade correta
      if (cardsToRemove.length !== cardsToDiscard) {
        logger.warn(`⚠️ [discardCards] Quantidade de cartas a descartar incorreta. Esperado: ${cardsToDiscard}, Recebido: ${cardsToRemove.length}`);
        // Se não tem a quantidade correta, descartar aleatoriamente
        const shuffled = [...hand].sort(() => Math.random() - 0.5);
        cardsToRemove = shuffled.slice(0, cardsToDiscard);
      }
    }

    // Remover cartas da mão e adicionar ao cemitério
    // Usar instanceId quando disponível para tratar cartas com mesmo nome como diferentes
    const newHand = hand.filter((card: any) => {
      // Se ambas as cartas têm instanceId, comparar por instanceId (mais preciso)
      return !cardsToRemove.some((removed: any) => {
        // Priorizar instanceId se ambas as cartas tiverem
        if (card.instanceId && removed.instanceId) {
          return card.instanceId === removed.instanceId;
        }
        // Se não tem instanceId, comparar por referência do objeto (garante unicidade)
        if (card === removed) {
          return true;
        }
        // Fallback: comparar por id/cardId/idCarta (menos preciso, mas funciona se não houver instanceId)
        const cardId = card.id || card.cardId || card.idCarta;
        const removedId = removed.id || removed.cardId || removed.idCarta;
        return cardId?.toString() === removedId?.toString();
      });
    });

    const newGraveyard = [...graveyard, ...cardsToRemove];

    // Atualizar o campo do jogador
    if (player === 1) {
      (duel as any).player1Field = {
        ...playerField,
        hand: newHand,
        graveyard: newGraveyard,
      };
    } else {
      (duel as any).player2Field = {
        ...playerField,
        hand: newHand,
        graveyard: newGraveyard,
      };
    }

    // Salvar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [discardCards] Player ${player} descartou ${cardsToRemove.length} cartas. Mão: ${hand.length} -> ${newHand.length}`);

    return duel;
  }

  /**
   * Finaliza o turno do jogador, descartando automaticamente cartas se necessário
   * @param duelId - ID do duelo
   * @param userId - ID do usuário que está finalizando o turno
   * @param cardIdsToDiscard - Parâmetro obsoleto (mantido para compatibilidade, não é mais usado)
   */
  async endTurn(duelId: string | number, userId: number, cardIdsToDiscard?: string[]): Promise<{ needsDiscard: boolean; cardsToDiscard?: number; duel?: Duel }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    // Flush campo pendente antes de ler mão/avançar turno
    await this.ensureFieldStateBeforeReload(duelIdStr);
    const duel = this.activeDuels.get(duelIdStr);
    if (!duel) {
      return { needsDiscard: false };
    }

    const isPlayer1 = duel.player1Id === userId;
    const player = isPlayer1 ? 1 : 2;
    const playerField = player === 1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.hand) {
      return { needsDiscard: false };
    }

    const hand = playerField.hand || [];

    // Se tem mais de 6 cartas, descartar automaticamente de forma aleatória
    if (hand.length > 6) {
      // Descartar aleatoriamente até ficar com 6 cartas
      const updatedDuel = await this.discardCards(duelId, player, undefined, true);
        if (updatedDuel) {
        logger.info(`✅ [endTurn] Descartadas ${hand.length - 6} cartas aleatoriamente. Mão: ${hand.length} -> ${(updatedDuel as any).player1Field?.hand?.length || (updatedDuel as any).player2Field?.hand?.length || 0}`);
          // Após descartar, avançar para o próximo turno
          return await this.advanceToNextTurn(duelId);
        }
    }

    // Se não precisa descartar, avançar para o próximo turno
    logger.info(`🔄 [endTurn] Chamando advanceToNextTurn para duelo ${duelIdStr}`);
    const result = await this.advanceToNextTurn(duelId);
    logger.info(`✅ [endTurn] advanceToNextTurn concluído. turnCounter após: ${result.duel?.turnCounter || 'N/A'}`);
    return result;
  }

  /**
   * Avança para o próximo turno
   */
  async advanceToNextTurn(duelId: string | number): Promise<{ needsDiscard: boolean; duel?: Duel }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // CRÍTICO: flush do debounce de campo ANTES de qualquer reload do Postgres.
    // Sem isso, cartas colocadas há <~2.5s somem (DB antigo sobrescreve memória) ao passar o turno.
    await this.ensureFieldStateBeforeReload(duelIdStr);

    // Preferir memória (já flushada) — fonte da verdade do campo
    let duel = this.activeDuels.get(duelIdStr) || null;
    if (!duel) {
      duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    }

    if (!duel) {
      logger.error(`❌ [advanceToNextTurn] Duelo ${duelIdStr} não encontrado`);
      return { needsDiscard: false };
    }

    this.activeDuels.set(duelIdStr, duel);

    // Resetar flag de invocação normal, mudança de posição e ataque para ambos os jogadores ao mudar de turno
    // Também devolver monstros controlados por ChangeOfHeart ao oponente quando o turno do jogador que controla acaba
    const currentTurnBeforeChange = duel.currentTurn; // Turno que está terminando

    logger.info(`🔄 [advanceToNextTurn] Iniciando devolução de monstros controlados por ChangeOfHeart`);
    logger.info(`   - currentTurnBeforeChange: ${currentTurnBeforeChange}`);
    logger.info(`   - player1Field.monsters: ${(duel as any).player1Field?.monsters?.length || 0} slots`);
    logger.info(`   - player2Field.monsters: ${(duel as any).player2Field?.monsters?.length || 0} slots`);

    // Verificar e mover Change Of Heart e Brain Control para o cemitério quando o turno acaba
    // IMPORTANTE: Só mover se estiverem face-up (ativadas), não se estiverem setadas (face-down)
    const isChangeOfHeartOrBrainControl = (card: any) =>
      this.isExactCard(card, 'ChangeOfHeart') || this.isExactCard(card, 'BrainControl');
    if (currentTurnBeforeChange === 1 && (duel as any).player1Field) {
      const player1Field = (duel as any).player1Field;
      if (player1Field.spellTrap && Array.isArray(player1Field.spellTrap)) {
        for (let i = 0; i < player1Field.spellTrap.length; i++) {
          const card = player1Field.spellTrap[i];
          if (card && isChangeOfHeartOrBrainControl(card)) {
            const cardPosition = card.position || 'set';
            const isFaceUp = cardPosition === 'face-up';
            if (isFaceUp) {
              logger.info(`🔄 [advanceToNextTurn] Movendo carta ativada (Change Of Heart/Brain Control) do Player 1 para o cemitério`);
              await this.onSpellTrapRemovedFromField(duelIdStr, duel, true, i);
              if (player1Field.spellTrap[i]) {
                if (!player1Field.graveyard) player1Field.graveyard = [];
                player1Field.graveyard.push(player1Field.spellTrap[i]);
                player1Field.spellTrap[i] = null;
              }
            } else {
              logger.info(`ℹ️ [advanceToNextTurn] Change Of Heart/Brain Control do Player 1 está setada (face-down) - permanece no campo`);
            }
          }
        }
      }
    }
    if (currentTurnBeforeChange === 2 && (duel as any).player2Field) {
      const player2Field = (duel as any).player2Field;
      if (player2Field.spellTrap && Array.isArray(player2Field.spellTrap)) {
        for (let i = 0; i < player2Field.spellTrap.length; i++) {
          const card = player2Field.spellTrap[i];
          if (card && isChangeOfHeartOrBrainControl(card)) {
            const cardPosition = card.position || 'set';
            const isFaceUp = cardPosition === 'face-up';
            if (isFaceUp) {
              logger.info(`🔄 [advanceToNextTurn] Movendo carta ativada (Change Of Heart/Brain Control) do Player 2 para o cemitério`);
              await this.onSpellTrapRemovedFromField(duelIdStr, duel, false, i);
              if (player2Field.spellTrap[i]) {
                if (!player2Field.graveyard) player2Field.graveyard = [];
                player2Field.graveyard.push(player2Field.spellTrap[i]);
                player2Field.spellTrap[i] = null;
              }
            } else {
              logger.info(`ℹ️ [advanceToNextTurn] Change Of Heart/Brain Control do Player 2 está setada (face-down) - permanece no campo`);
            }
          }
        }
      }
    }

    if ((duel as any).player1Field) {
      (duel as any).player1Field.normalSummonUsed = false;
      (duel as any).player1Field.bonusNormalSummonsRemaining = 0;
      // Limpar efeito do Waboku no final do turno
      if ((duel as any).player1Field.wabokuActiveThisTurn === true) {
        (duel as any).player1Field.wabokuActiveThisTurn = false;
        (duel as any).player1Field.wabokuActivatedTurn = undefined;
        logger.info(`🔄 [advanceToNextTurn] Efeito do Waboku do Player 1 limpo no final do turno`);
      }
      // Resetar flags de mudança de posição e ataque de cada monstro
      // E devolver monstros controlados ao oponente
      if ((duel as any).player1Field.monsters && Array.isArray((duel as any).player1Field.monsters)) {
        let resetPositionCount = 0;
        let resetAttackCount = 0;
        let returnedMonstersCount = 0;
        const player2Field = (duel as any).player2Field;

        (duel as any).player1Field.monsters.forEach((monster: any, index: number) => {
          if (monster) {
            // Resetar flags normalmente (monstros controlados serão devolvidos pela função auxiliar)
            if (monster.positionChangedThisTurn === true) {
              resetPositionCount++;
            }
            monster.positionChangedThisTurn = false;
            monster.effectUsedThisTurn = false;
            monster.cannotAttackThisTurn = false;
            monster.canAttackAgainThisTurn = false;
            monster.canAttackAgainIfDestroys = false;
            if (monster.attackedThisTurn === true) {
              resetAttackCount++;
            }
            monster.attackedThisTurn = false;
            monster.attacksThisTurn = 0;
          }
        });
        if (resetPositionCount > 0 || resetAttackCount > 0) {
          logger.info(`🔄 [advanceToNextTurn] Resetando positionChangedThisTurn para ${resetPositionCount} monstro(s) e attackedThisTurn para ${resetAttackCount} monstro(s) do Player 1`);
        }
        // Limiter Removal: destroy machines marked by Limiter Removal at end of turn
        if (currentTurnBeforeChange === 1) {
          let limiterRemovalDestroyed = 0;
          if (!((duel as any).player1Field.graveyard)) {
            (duel as any).player1Field.graveyard = [];
          }
          for (let i = 0; i < (duel as any).player1Field.monsters.length; i++) {
            const monster = (duel as any).player1Field.monsters[i];
            if (monster && monster.limiterRemovalDoubled) {
              await this.handleEquipmentDestruction(duelIdStr, duel, true, monster);
              (duel as any).player1Field.graveyard.push(monster);
              (duel as any).player1Field.monsters[i] = null;
              limiterRemovalDestroyed++;
            }
          }
          if (limiterRemovalDestroyed > 0) {
            logger.info(`💥 [LimiterRemoval] Destruiu ${limiterRemovalDestroyed} Machine(s) do Player 1 no End Phase`);
          }
        }

        // Devolver monstros controlados por ChangeOfHeart quando o turno acaba
        if (currentTurnBeforeChange === 1) {
          returnedMonstersCount = await this.returnChangeOfHeartMonsters(duelIdStr, duel, true);
          if (returnedMonstersCount > 0) {
            logger.info(`🔄 [advanceToNextTurn] Devolvendo ${returnedMonstersCount} monstro(s) controlado(s) do Player 1 para Player 2`);
            // Atualizar imediatamente no banco após devolver monstros
            logger.info(`💾 [advanceToNextTurn] Atualizando banco imediatamente após devolver ${returnedMonstersCount} monstro(s)`);
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
            logger.info(`✅ [advanceToNextTurn] Banco atualizado após devolver monstros do Player 1`);
          }
        }
      }
    }
    if ((duel as any).player2Field) {
      (duel as any).player2Field.normalSummonUsed = false;
      (duel as any).player2Field.bonusNormalSummonsRemaining = 0;
      (duel as any).player2Field.monsterDestroyedThisTurn = false; // Resetar flag para Last Will
      // Limpar efeito do Waboku no final do turno
      if ((duel as any).player2Field.wabokuActiveThisTurn === true) {
        (duel as any).player2Field.wabokuActiveThisTurn = false;
        (duel as any).player2Field.wabokuActivatedTurn = undefined;
        logger.info(`🔄 [advanceToNextTurn] Efeito do Waboku do Player 2 limpo no final do turno`);
      }
      // Resetar flags de mudança de posição e ataque de cada monstro
      // E devolver monstros controlados ao oponente
      if ((duel as any).player2Field.monsters && Array.isArray((duel as any).player2Field.monsters)) {
        let resetPositionCount = 0;
        let resetAttackCount = 0;
        let returnedMonstersCount = 0;

        (duel as any).player2Field.monsters.forEach((monster: any, index: number) => {
          if (monster) {
            // Resetar flags normalmente (monstros controlados serão devolvidos pela função auxiliar)
            if (monster.positionChangedThisTurn === true) {
              resetPositionCount++;
            }
            monster.positionChangedThisTurn = false;
            monster.effectUsedThisTurn = false;
            monster.cannotAttackThisTurn = false;
            monster.canAttackAgainThisTurn = false;
            monster.canAttackAgainIfDestroys = false;
            if (monster.attackedThisTurn === true) {
              resetAttackCount++;
            }
            monster.attackedThisTurn = false;
            monster.attacksThisTurn = 0;

            // Clear Shrink effect at end of turn
            if (monster.shrinkAtkHalvedThisTurn) {
              monster.shrinkAtkHalvedThisTurn = false;
              monster.originalAtkBeforeShrink = undefined;
            }
          }
        });
        if (resetPositionCount > 0 || resetAttackCount > 0) {
          logger.info(`🔄 [advanceToNextTurn] Resetando positionChangedThisTurn para ${resetPositionCount} monstro(s) e attackedThisTurn para ${resetAttackCount} monstro(s) do Player 2`);
        }

        // Limiter Removal: destroy machines marked by Limiter Removal at end of turn
        if (currentTurnBeforeChange === 2) {
          let limiterRemovalDestroyed = 0;
          if (!((duel as any).player2Field.graveyard)) {
            (duel as any).player2Field.graveyard = [];
          }
          for (let i = 0; i < (duel as any).player2Field.monsters.length; i++) {
            const monster = (duel as any).player2Field.monsters[i];
            if (monster && monster.limiterRemovalDoubled) {
              await this.handleEquipmentDestruction(duelIdStr, duel, false, monster);
              (duel as any).player2Field.graveyard.push(monster);
              (duel as any).player2Field.monsters[i] = null;
              limiterRemovalDestroyed++;
            }
          }
          if (limiterRemovalDestroyed > 0) {
            logger.info(`💥 [LimiterRemoval] Destruiu ${limiterRemovalDestroyed} Machine(s) do Player 2 no End Phase`);
          }
        }

        // Devolver monstros controlados por ChangeOfHeart quando o turno acaba
        if (currentTurnBeforeChange === 2) {
          returnedMonstersCount = await this.returnChangeOfHeartMonsters(duelIdStr, duel, false);
          if (returnedMonstersCount > 0) {
            logger.info(`🔄 [advanceToNextTurn] Devolvendo ${returnedMonstersCount} monstro(s) controlado(s) do Player 2 para Player 1`);
            // Atualizar imediatamente no banco após devolver monstros
            logger.info(`💾 [advanceToNextTurn] Atualizando banco imediatamente após devolver ${returnedMonstersCount} monstro(s)`);
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
            logger.info(`✅ [advanceToNextTurn] Banco atualizado após devolver monstros do Player 2`);
          }
        }
      }
    }

    // Mudar turno
    duel.currentTurn = duel.currentTurn === 1 ? 2 : 1;
    duel.currentPhase = TurnPhase.DRAW;
    (duel as any).turnTime = 90;
    (duel as any).turnStartedAt = new Date();

    // Incrementar contador global de turnos no JSON de ambos os campos
    // Usar o maior valor entre os dois campos para garantir sincronização
    const p1Counter = (duel as any).player1Field?.turnCounter || 0;
    const p2Counter = (duel as any).player2Field?.turnCounter || 0;
    const dbCounter = duel.turnCounter || 0;
    const currentTurnCounter = Math.max(p1Counter, p2Counter, dbCounter, 1);
    const newTurnCounter = currentTurnCounter + 1;

    logger.info(`🔄 [advanceToNextTurn] ANTES do incremento:`);
    logger.info(`   - player1Field.turnCounter: ${p1Counter}`);
    logger.info(`   - player2Field.turnCounter: ${p2Counter}`);
    logger.info(`   - duel.turnCounter (banco): ${dbCounter}`);
    logger.info(`   - currentTurnCounter calculado: ${currentTurnCounter}`);
    logger.info(`   - newTurnCounter: ${newTurnCounter}`);

    // Atualizar no JSON de ambos os campos (sincronizar)
    if ((duel as any).player1Field) {
      (duel as any).player1Field.turnCounter = newTurnCounter;
      logger.info(`   ✅ player1Field.turnCounter atualizado para: ${(duel as any).player1Field.turnCounter}`);
    } else {
      (duel as any).player1Field = { turnCounter: newTurnCounter };
      logger.info(`   ⚠️ player1Field não existia, criado com turnCounter: ${newTurnCounter}`);
    }
    if ((duel as any).player2Field) {
      (duel as any).player2Field.turnCounter = newTurnCounter;
      logger.info(`   ✅ player2Field.turnCounter atualizado para: ${(duel as any).player2Field.turnCounter}`);
    } else {
      (duel as any).player2Field = { turnCounter: newTurnCounter };
      logger.info(`   ⚠️ player2Field não existia, criado com turnCounter: ${newTurnCounter}`);
    }

    // Atualizar também no banco (para compatibilidade)
    duel.turnCounter = newTurnCounter;

    logger.info(`🔄 [advanceToNextTurn] Turno incrementado: ${currentTurnCounter} -> ${newTurnCounter} (sincronizado em ambos os campos JSON e banco)`);

    // Atualizar no banco PRIMEIRO com DRAW phase - o gateway vai processar e emitir
    logger.info(`💾 [advanceToNextTurn] Salvando no banco - turnCounter: ${duel.turnCounter}, player1Field.turnCounter: ${(duel as any).player1Field?.turnCounter}, player2Field.turnCounter: ${(duel as any).player2Field?.turnCounter}`);
    await this.updateDuelInDatabase(duelId, {
      currentTurn: duel.currentTurn,
      currentPhase: TurnPhase.DRAW,
      turnTime: 90,
      turnStartedAt: new Date(),
      turnCounter: duel.turnCounter, // CRÍTICO: Salvar contador global de turnos
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any, { immediate: true });

    // Manter memória como fonte da verdade (já gravada acima) — não recarregar DB
    // pois um SELECT logo após UPDATE pode ainda devolver JSONB antigo em réplicas/cache.
    this.activeDuels.set(duelIdStr, duel);
    const updatedDuel = duel;
    logger.info(`✅ [advanceToNextTurn] Estado em memória preservado - turnCounter: ${duel.turnCounter}, currentTurn: ${duel.currentTurn}`);

    // Processar automaticamente a Draw Phase (comprar carta e avançar para próxima fase)
    // Isso garante que o turno do oponente comece normalmente, comprando carta automaticamente
    logger.info(`🔄 [advanceToNextTurn] Processando Draw Phase automaticamente para o novo turno...`);
    const finalDuel = await this.processDrawPhase(duelId);

    if (finalDuel) {
      logger.info(`✅ [advanceToNextTurn] Draw Phase processada automaticamente. Nova fase: ${finalDuel.currentPhase}`);
      return { needsDiscard: false, duel: finalDuel };
    } else {
      logger.warn(`⚠️ [advanceToNextTurn] processDrawPhase retornou null, retornando duelo em DRAW`);
    return { needsDiscard: false, duel: updatedDuel || duel };
    }
  }

  async finishDuel(duelId: string | number, result: DuelResult, winnerId: number | null): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);

    // Se não está em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) {
        logger.warn(`⚠️ [finishDuel] Duelo ${duelIdStr} não encontrado`);
        return;
      }
      duel = duelFromDb;
    }

    // Persistir o campo pendente antes de reivindicar a finalização.
    // A alteração atômica no banco impede que duas requisições contabilizem
    // vitórias, derrotas, recompensas e histórico para o mesmo duelo.
    await this.flushPendingDuelPersist(duelIdStr);
    const finishedAt = new Date();
    const claimed = await this.duelsRepository.createQueryBuilder()
      .update(Duel)
      .set({ status: DuelStatus.FINISHED, result, winnerId, finishedAt })
      .where('id = :duelId', { duelId: duelIdStr })
      .andWhere('status IN (:...activeStatuses)', {
        activeStatuses: [DuelStatus.WAITING, DuelStatus.IN_PROGRESS],
      })
      .execute();
    if (!claimed.affected) {
      logger.warn(`[finishDuel] Duelo ${duelIdStr} já encerrado; ignorando nova finalização.`);
      return;
    }
    duel.status = DuelStatus.FINISHED;
    duel.result = result;
    duel.winnerId = winnerId;
    duel.finishedAt = finishedAt;

    await this.updateDuelInDatabase(duelId, {
      status: DuelStatus.FINISHED,
      result: result,
      winnerId: winnerId,
      finishedAt: new Date(),
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any, { immediate: true });

    // Atualizar estatísticas dos jogadores (winsGeral/lossesGeral, score, histórico)
    try {
      const player1Id = Number(duel.player1Id);
      const player2Id = Number(duel.player2Id);

      // Buscar informações dos jogadores
      const [player1, player2] = await Promise.all([
        this.usersRepository.findOne({
          where: { id: player1Id },
          select: ['id', 'nickname', 'username', 'clanTag']
        }),
        this.usersRepository.findOne({
          where: { id: player2Id },
          select: ['id', 'nickname', 'username', 'clanTag']
        })
      ]);

      // Calcular score baseado na origem do duelo (configurável no admin)
      let scoreEarned = 0;
      if (result !== DuelResult.DRAW && result !== DuelResult.CANCELLED && winnerId) {
        try {
          const scoreSettings = await this.adminService.getDuelScoreSettings();
          scoreEarned = scoreSettings[duel.origin] ?? scoreSettings[DuelOrigin.OTHER] ?? 1;
        } catch (err: any) {
          logger.warn(`⚠️ [finishDuel] Erro ao obter configuração de score, usando 1.0: ${err?.message}`);
          scoreEarned = 1;
        }
        logger.info(`📊 [finishDuel] Score calculado: ${scoreEarned} para origem ${duel.origin}`);
      } else {
        logger.info(`📊 [finishDuel] Sem score (result: ${result}, winnerId: ${winnerId})`);
      }

      // Converter origem do duelo para origem do histórico
      let historyOrigin: DuelHistoryOrigin = DuelHistoryOrigin.OTHER;
      if (duel.origin === DuelOrigin.RANDOM) {
        historyOrigin = DuelHistoryOrigin.RANDOM;
      } else if (duel.origin === DuelOrigin.RANDOM_ANIME) {
        historyOrigin = DuelHistoryOrigin.RANDOM_ANIME;
      } else if (duel.origin === DuelOrigin.RANKED) {
        historyOrigin = DuelHistoryOrigin.RANKED;
      } else if (duel.origin === DuelOrigin.ARENA) {
        historyOrigin = DuelHistoryOrigin.ARENA;
      } else if (duel.origin === DuelOrigin.TOURNAMENT) {
        historyOrigin = DuelHistoryOrigin.TOURNAMENT;
      } else if (duel.origin === DuelOrigin.CHAT) {
        historyOrigin = DuelHistoryOrigin.CHAT;
      }

      const player1LP = duel.player1LifePoints || 0;
      const player2LP = duel.player2LifePoints || 0;
      const turns = duel.currentTurn || 0;
      const duration = duel.duelTime || 0;

      if (result === DuelResult.DRAW) {
        // Empate: ambos perdem
        await this.usersRepository.increment({ id: player1Id }, 'lossesGeral', 1);
        await this.usersRepository.increment({ id: player2Id }, 'lossesGeral', 1);

        // Salvar histórico para ambos
        const history1 = this.duelHistoryRepository.create({
          playerId: player1Id,
          opponentId: player2Id,
          opponentNickname: player2?.nickname || null,
          opponentUsername: player2?.username || null,
          opponentClanTag: player2?.clanTag || null,
          result: DuelHistoryResult.DRAW,
          origin: historyOrigin,
          playerLifePoints: player1LP,
          opponentLifePoints: player2LP,
          scoreEarned: 0,
          turns: turns,
          duration: duration,
          originalDuelId: duelIdStr,
        });

        const history2 = this.duelHistoryRepository.create({
          playerId: player2Id,
          opponentId: player1Id,
          opponentNickname: player1?.nickname || null,
          opponentUsername: player1?.username || null,
          opponentClanTag: player1?.clanTag || null,
          result: DuelHistoryResult.DRAW,
          origin: historyOrigin,
          playerLifePoints: player2LP,
          opponentLifePoints: player1LP,
          scoreEarned: 0,
          turns: turns,
          duration: duration,
          originalDuelId: duelIdStr,
        });

        await this.duelHistoryRepository.save([history1, history2]);
        logger.info(`📊 [finishDuel] Empate: ambos os jogadores receberam derrota`);
        if (duel.origin === DuelOrigin.ARENA) {
          try {
            await this.shopService.consumeTalismanChargeForArenaDuel(player1Id);
            await this.shopService.consumeTalismanChargeForArenaDuel(player2Id);
          } catch (talismanErr: any) {
            logger.warn(`⚠️ [finishDuel] Erro ao consumir carga do talismã (empate):`, talismanErr?.message || talismanErr);
          }
        }
      } else if (result === DuelResult.CANCELLED) {
        // Cancelado: salvar histórico mas não atualizar estatísticas
        const history1 = this.duelHistoryRepository.create({
          playerId: player1Id,
          opponentId: player2Id,
          opponentNickname: player2?.nickname || null,
          opponentUsername: player2?.username || null,
          opponentClanTag: player2?.clanTag || null,
          result: DuelHistoryResult.CANCELLED,
          origin: historyOrigin,
          playerLifePoints: player1LP,
          opponentLifePoints: player2LP,
          scoreEarned: 0,
          turns: turns,
          duration: duration,
          originalDuelId: duelIdStr,
        });

        const history2 = this.duelHistoryRepository.create({
          playerId: player2Id,
          opponentId: player1Id,
          opponentNickname: player1?.nickname || null,
          opponentUsername: player1?.username || null,
          opponentClanTag: player1?.clanTag || null,
          result: DuelHistoryResult.CANCELLED,
          origin: historyOrigin,
          playerLifePoints: player2LP,
          opponentLifePoints: player1LP,
          scoreEarned: 0,
          turns: turns,
          duration: duration,
          originalDuelId: duelIdStr,
        });

        await this.duelHistoryRepository.save([history1, history2]);
        logger.info(`📊 [finishDuel] Duelo cancelado: histórico salvo`);
      } else if (winnerId) {
        const winnerIdNum = Number(winnerId);
        const loserId = winnerIdNum === player1Id ? player2Id : player1Id;
        const winner = winnerIdNum === player1Id ? player1 : player2;
        const loser = winnerIdNum === player1Id ? player2 : player1;
        const winnerLP = winnerIdNum === player1Id ? player1LP : player2LP;
        const loserLP = winnerIdNum === player1Id ? player2LP : player1LP;

        // Vencedor ganha vitória e score
        await this.usersRepository.increment({ id: winnerIdNum }, 'winsGeral', 1);
        await this.usersRepository.increment({ id: winnerIdNum }, 'winsSeason', 1);

        // ========== ATUALIZAR SCORE DO DUELISTA E DO CLÃ (GRUPO) ==========
        // REGRA CRÍTICA: Quando o duelista ganha score, o clã recebe EXATAMENTE o mesmo score
        // 1. O duelista ganha scoreEarned no seu totalScore (EXCETO para Arena - score da arena é separado)
        // 2. IMEDIATAMENTE APÓS, se o duelista estiver em um clã ativo, o clã também ganha o mesmo scoreEarned
        // 3. O score é adicionado ao member.totalScore e depois o group.totalScore é recalculado

        // Score ganho na arena também soma ao total_score geral do duelista
        const shouldAddToTotalScore = true;

        // Atualizar score do duelista (usar query direta para garantir precisão decimal)
        logger.info(`📊 [finishDuel] ========== ATUALIZANDO SCORE DO DUELISTA ==========`);
        logger.info(`📊 [finishDuel] Adicionando ${scoreEarned} score para jogador ${winnerIdNum} (origem: ${duel.origin}, adicionar ao total: ${shouldAddToTotalScore})`);
        let newUserTotalScore = 0;

        if (shouldAddToTotalScore) {
          try {
            // Usar snake_case que é o padrão do PostgreSQL
            const result = await this.usersRepository.query(
              `UPDATE users SET total_score = COALESCE(total_score, 0) + $1 WHERE id = $2 RETURNING total_score`,
              [scoreEarned, winnerIdNum]
            );

            if (result && result.length > 0) {
              newUserTotalScore = parseFloat(result[0].total_score) || 0;
              logger.info(`✅ [finishDuel] Score do duelista atualizado. Novo totalScore: ${newUserTotalScore}`);

              // Atualizar nível do usuário baseado no novo totalScore
              try {
                await this.usersService.updateUserLevel(winnerIdNum, newUserTotalScore);
              } catch (levelError: any) {
                logger.warn(`⚠️ [finishDuel] Erro ao atualizar nível do usuário: ${levelError.message}`);
              }
            } else {
              logger.warn(`⚠️ [finishDuel] Nenhuma linha foi atualizada para o jogador ${winnerIdNum}`);
              // Buscar o score atual do usuário
              const user = await this.usersRepository.findOne({ where: { id: winnerIdNum }, select: ['id', 'totalScore'] });
              newUserTotalScore = user?.totalScore ? parseFloat(String(user.totalScore)) : 0;
            }
        } catch (error: any) {
          logger.error(`❌ [finishDuel] Erro ao atualizar score:`, error.message || error);
          // Tentar usar increment do TypeORM como fallback
          try {
            const user = await this.usersRepository.findOne({ where: { id: winnerIdNum } });
            if (user) {
              user.totalScore = (user.totalScore || 0) + scoreEarned;
              await this.usersRepository.save(user);
              newUserTotalScore = parseFloat(String(user.totalScore)) || 0;
              logger.info(`✅ [finishDuel] Score atualizado usando save(). Novo totalScore: ${newUserTotalScore}`);

              // Atualizar nível do usuário baseado no novo totalScore
              try {
                await this.usersService.updateUserLevel(winnerIdNum, newUserTotalScore);
              } catch (levelError: any) {
                logger.warn(`⚠️ [finishDuel] Erro ao atualizar nível do usuário: ${levelError.message}`);
              }
            }
          } catch (error2: any) {
            logger.error(`❌ [finishDuel] Erro ao atualizar score (fallback):`, error2.message || error2);
          }
        }
        }

        // Perdedor ganha derrota (antes da season e do clã para manter ordem lógica)
        await this.usersRepository.increment({ id: loserId }, 'lossesGeral', 1);
        await this.usersRepository.increment({ id: loserId }, 'lossesSeason', 1);

        // ========== ATUALIZAR SCORE DA SEASON (ANTES DO CLÃ) ==========
        // getActiveSeason() obtém ou cria a season ativa. Assim, quando o clã for atualizado,
        // getActiveSeasonOrNull() já encontra a season e o score do clã conta na season ativa.
        try {
          await this.seasonsService.updateUserRanking(winnerIdNum, scoreEarned, true);
          await this.seasonsService.updateUserRanking(loserId, 0, false);
          logger.info(`📊 [finishDuel] Season score atualizado para vencedor ${winnerIdNum} (+${scoreEarned}) e perdedor ${loserId}`);
        } catch (error: any) {
          logger.error(`⚠️ [finishDuel] Erro ao atualizar season score:`, error.message || error);
        }

        // ========== ATUALIZAR SCORE DO CLÃ (GRUPO) IMEDIATAMENTE APÓS ==========
        // Clã recebe score apenas de duelos que não são de arena (arena não soma ao clã)
        if (duel.origin !== DuelOrigin.ARENA) {
          // CRÍTICO: Atualizar o score do clã no mesmo momento que o score do duelista
          logger.info(`👥 [finishDuel] ========== ATUALIZANDO SCORE DO CLÃ (GRUPO) ==========`);
          logger.info(`👥 [finishDuel] Vencedor: ${winnerIdNum}, Score a adicionar ao clã: ${scoreEarned}, Tipo: ${typeof scoreEarned}`);

          // Verificar se groupsService está disponível
          if (!this.groupsService) {
            logger.error(`❌ [finishDuel] CRÍTICO: groupsService não está disponível! Score do clã NÃO será atualizado!`);
            logger.error(`❌ [finishDuel] Verifique se GroupsModule está importado corretamente no DuelsModule`);
          } else if (!scoreEarned || scoreEarned <= 0 || isNaN(scoreEarned)) {
            logger.warn(`⚠️ [finishDuel] Score inválido (${scoreEarned}), não atualizando clã`);
          } else {
            logger.info(`✅ [finishDuel] groupsService disponível e score válido. Iniciando atualização do clã...`);

            try {
              // SEMPRE tentar adicionar score ao clã
              // O updateMemberScore verifica internamente se o usuário está em um clã ativo
              // Se estiver, adiciona o score ao member.totalScore e recalcula o group.totalScore
              // Se não estiver, simplesmente retorna sem erro
              logger.info(`👥 [finishDuel] ===> Chamando updateMemberScore(${winnerIdNum}, ${scoreEarned}) para adicionar score ao clã <===`);
              logger.info(`👥 [finishDuel] Tipo de scoreEarned: ${typeof scoreEarned}, Valor: ${scoreEarned}`);
              const startTime = Date.now();

              // Garantir que scoreEarned é um número válido
              const scoreToAdd = parseFloat(String(scoreEarned)) || 0;
              if (scoreToAdd <= 0 || isNaN(scoreToAdd)) {
                logger.error(`❌ [finishDuel] Score inválido após conversão: ${scoreToAdd} (original: ${scoreEarned})`);
              } else {
                logger.info(`👥 [finishDuel] Score validado: ${scoreToAdd}`);
                await this.groupsService.updateMemberScore(winnerIdNum, scoreToAdd);
              }

              const duration = Date.now() - startTime;
              logger.info(`✅ [finishDuel] updateMemberScore concluído em ${duration}ms - score ${scoreEarned} adicionado ao clã (se o vencedor estiver em um clã)`);

              // Adicionar vitória ao clã
              logger.info(`👥 [finishDuel] ===> Chamando updateMemberWin(${winnerIdNum}) para adicionar vitória ao clã <===`);
              await this.groupsService.updateMemberWin(winnerIdNum);
              logger.info(`✅ [finishDuel] updateMemberWin concluído - vitória adicionada ao clã (se o vencedor estiver em um clã)`);

              logger.info(`👥 [finishDuel] ✅✅✅ Processo de atualização do clã CONCLUÍDO para vencedor ${winnerIdNum} ✅✅✅`);
            } catch (error: any) {
              logger.error(`❌ [finishDuel] ERRO CRÍTICO ao atualizar estatísticas do clã:`, error);
              logger.error(`❌ [finishDuel] Mensagem: ${error?.message || 'Sem mensagem'}`);
              logger.error(`❌ [finishDuel] Stack:`, error?.stack || 'Sem stack');
              logger.error(`❌ [finishDuel] userId: ${winnerIdNum}, scoreEarned: ${scoreEarned}`);
              // Não falhar o duelo se houver erro no clã, mas logar o erro detalhadamente
              // IMPORTANTE: O erro não deve ser silenciado - precisa ser investigado
            }
          }
        }

        // Atualizar estatísticas do clã do perdedor (derrotas)
        try {
          await this.groupsService.updateMemberLoss(loserId);
          logger.info(`👥 [finishDuel] Estatísticas do clã atualizadas para perdedor ${loserId} (+1 derrota)`);
        } catch (error: any) {
          logger.error(`⚠️ [finishDuel] Erro ao atualizar estatísticas do clã do perdedor:`, error.message || error);
          // Não falhar o duelo se houver erro no clã
        }

        // Salvar histórico para o vencedor
        logger.info(`📊 [finishDuel] Criando histórico para vencedor ${winnerIdNum} e perdedor ${loserId}`);
        logger.info(`📊 [finishDuel] Dados do histórico - Origin: ${historyOrigin}, WinnerLP: ${winnerLP}, LoserLP: ${loserLP}, Turns: ${turns}, Duration: ${duration}`);

        const winnerHistory = this.duelHistoryRepository.create({
          playerId: winnerIdNum,
          opponentId: loserId,
          opponentNickname: loser?.nickname || null,
          opponentUsername: loser?.username || null,
          opponentClanTag: loser?.clanTag || null,
          result: DuelHistoryResult.WIN,
          origin: historyOrigin,
          playerLifePoints: winnerLP,
          opponentLifePoints: loserLP,
          scoreEarned: scoreEarned,
          turns: turns,
          duration: duration,
          originalDuelId: duelIdStr,
        });

        // Salvar histórico para o perdedor
        const loserHistory = this.duelHistoryRepository.create({
          playerId: loserId,
          opponentId: winnerIdNum,
          opponentNickname: winner?.nickname || null,
          opponentUsername: winner?.username || null,
          opponentClanTag: winner?.clanTag || null,
          result: DuelHistoryResult.LOSS,
          origin: historyOrigin,
          playerLifePoints: loserLP,
          opponentLifePoints: winnerLP,
          scoreEarned: 0,
          turns: turns,
          duration: duration,
          originalDuelId: duelIdStr,
        });

        try {
          const savedHistory = await this.duelHistoryRepository.save([winnerHistory, loserHistory]);
          logger.info(`✅ [finishDuel] Histórico salvo com sucesso! ${savedHistory.length} registros salvos`);
          logger.info(`📊 [finishDuel] IDs dos registros salvos:`, savedHistory.map((h: any) => h.id));
        } catch (saveError: any) {
          logger.error(`❌ [finishDuel] Erro ao salvar histórico:`, saveError);
          logger.error(`❌ [finishDuel] Stack do erro:`, saveError.stack);
          logger.error(`❌ [finishDuel] Dados que tentaram ser salvos:`, {
            winnerHistory: winnerHistory,
            loserHistory: loserHistory
          });
        }

        // ========== CONSUMIR CARGA DO TALISMÃ (ARENA) ==========
        if (duel.origin === DuelOrigin.ARENA) {
          try {
            await this.shopService.consumeTalismanChargeForArenaDuel(player1Id);
            await this.shopService.consumeTalismanChargeForArenaDuel(player2Id);
          } catch (talismanErr: any) {
            logger.warn(`⚠️ [finishDuel] Erro ao consumir carga do talismã:`, talismanErr?.message || talismanErr);
          }
        }

        // ========== DISTRIBUIR CASH BASEADO NA FAIXA DE NÍVEL (RANDOM DUEL) ==========
        if (duel.origin === DuelOrigin.RANDOM || duel.origin === DuelOrigin.RANDOM_ANIME) {
          try {
            // Buscar nível dos jogadores para determinar a faixa
            const [winnerUser, loserUser] = await Promise.all([
              this.usersRepository.findOne({ where: { id: winnerIdNum }, select: ['id', 'level'] }),
              this.usersRepository.findOne({ where: { id: loserId }, select: ['id', 'level'] }),
            ]);

            if (winnerUser && loserUser) {
              // Buscar faixa de nível do vencedor
              const winnerRange = this.randomDuelLevelRangesService.getRangeForLevel(winnerUser.level);
              // Buscar faixa de nível do perdedor
              const loserRange = this.randomDuelLevelRangesService.getRangeForLevel(loserUser.level);

              // Dar cash ao vencedor baseado na sua faixa
              if (winnerRange && winnerRange.cashOnWin > 0) {
                try {
                  await this.economyService.addCurrency(
                    winnerIdNum,
                    CurrencyType.CASH,
                    winnerRange.cashOnWin,
                    TransactionType.REWARD,
                    `Cash por vitória no Random Duel (${winnerRange.name})`,
                    { rangeId: winnerRange.id, rangeName: winnerRange.name }
                  );
                  logger.info(`💰 [finishDuel] Vencedor ${winnerIdNum} recebeu ${winnerRange.cashOnWin} cash (faixa: ${winnerRange.name})`);

                  // Adicionar metade do cash ao grupo do vencedor
                  try {
                    await this.groupsService.addGroupCashFromDuel(winnerIdNum, winnerRange.cashOnWin);
                  } catch (groupCashError: any) {
                    logger.error(`❌ [finishDuel] Erro ao adicionar cash ao grupo do vencedor:`, groupCashError.message || groupCashError);
                  }
                } catch (cashError: any) {
                  logger.error(`❌ [finishDuel] Erro ao dar cash ao vencedor:`, cashError.message || cashError);
                }
              }

              // Dar cash ao perdedor baseado na sua faixa
              if (loserRange && loserRange.cashOnLoss > 0) {
                try {
                  await this.economyService.addCurrency(
                    loserId,
                    CurrencyType.CASH,
                    loserRange.cashOnLoss,
                    TransactionType.REWARD,
                    `Cash por derrota no Random Duel (${loserRange.name})`,
                    { rangeId: loserRange.id, rangeName: loserRange.name }
                  );
                  logger.info(`💰 [finishDuel] Perdedor ${loserId} recebeu ${loserRange.cashOnLoss} cash (faixa: ${loserRange.name})`);

                  // Adicionar metade do cash ao grupo do perdedor
                  try {
                    await this.groupsService.addGroupCashFromDuel(loserId, loserRange.cashOnLoss);
                  } catch (groupCashError: any) {
                    logger.error(`❌ [finishDuel] Erro ao adicionar cash ao grupo do perdedor:`, groupCashError.message || groupCashError);
                  }
                } catch (cashError: any) {
                  logger.error(`❌ [finishDuel] Erro ao dar cash ao perdedor:`, cashError.message || cashError);
                }
              }
            }
          } catch (cashError: any) {
            logger.error(`❌ [finishDuel] Erro ao processar cash do Random Duel:`, cashError.message || cashError);
            // Não falhar o duelo se houver erro no cash
          }
        }

        logger.info(`📊 [finishDuel] Estatísticas atualizadas: Jogador ${winnerIdNum} venceu (+${scoreEarned} score), Jogador ${loserId} perdeu`);

        // XP do Passe de Batalha (não falha o duelo se der erro)
        try {
          await Promise.all([
            this.battlePassService.addXpFromDuelResult(winnerIdNum, true),
            this.battlePassService.addXpFromDuelResult(loserId, false),
          ]);
        } catch (bpErr: any) {
          logger.warn(`⚠️ [finishDuel] Erro ao conceder XP do passe:`, bpErr?.message || bpErr);
        }

        // Pontos ranqueados (sobe/desce) — só em RANKED; totalScore continua só subindo
        if (duel.origin === DuelOrigin.RANKED) {
          try {
            const rankedCfg = await this.adminService.getRankedPointsSettings();
            const winPts = rankedCfg.onWin;
            const lossPts = rankedCfg.onLoss;
            if (winPts > 0) {
              await this.usersRepository.query(
                `UPDATE users SET ranked_points = COALESCE(ranked_points, 1000) + $1 WHERE id = $2`,
                [winPts, winnerIdNum],
              );
            }
            if (lossPts > 0) {
              await this.usersRepository.query(
                `UPDATE users SET ranked_points = GREATEST(0, COALESCE(ranked_points, 1000) - $1) WHERE id = $2`,
                [lossPts, loserId],
              );
            }
            logger.info(
              `🏆 [finishDuel] Ranked: +${winPts} para ${winnerIdNum}, -${lossPts} para ${loserId}`,
            );
          } catch (rankedErr: any) {
            logger.warn(
              `⚠️ [finishDuel] Erro ao atualizar ranked_points:`,
              rankedErr?.message || rankedErr,
            );
          }
        }

        // Progresso de missões (não falha o duelo se der erro)
        try {
          await Promise.all([
            this.missionsService.trackDuelResult(
              winnerIdNum,
              true,
              duel.origin,
              scoreEarned,
            ),
            this.missionsService.trackDuelResult(loserId, false, duel.origin, 0),
          ]);
        } catch (missionErr: any) {
          logger.warn(
            `⚠️ [finishDuel] Erro ao atualizar missões:`,
            missionErr?.message || missionErr,
          );
        }
      }
    } catch (error) {
      logger.error(`❌ [finishDuel] Erro ao atualizar estatísticas dos jogadores:`, error);
    }

    // Se o duelo é de um torneio, atualizar a partida do torneio
    if (duel.origin === DuelOrigin.TOURNAMENT && winnerId) {
      try {
        await this.tournamentsService.updateTournamentMatchFromDuel(duelIdStr, winnerId, result);
        logger.info(`🏆 [finishDuel] Partida do torneio atualizada para o duelo ${duelIdStr}`);
      } catch (error) {
        logger.error(`❌ [finishDuel] Erro ao atualizar partida do torneio:`, error);
      }
    }

    // Remover do cache em memória após 60 segundos
    setTimeout(() => {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      this.activeDuels.delete(duelIdStr);
      // Invalidar cache
      this.activeDuelsCountCache = this.activeDuels.size;
      this.lastCountUpdate = Date.now();
    }, 60000);
  }

  /**
   * Sincroniza o status online dos usuários baseado em atividade HTTP
   * Executa a cada 2 minutos para marcar usuários inativos como offline
   */
  @Cron('*/2 * * * *') // A cada 2 minutos
  async syncOnlineStatus(): Promise<void> {
    try {
      logger.debug('🔄 [syncOnlineStatus] Sincronizando status online baseado em atividade...');

      // Marcar como offline usuários que não tiveram atividade nos últimos 5 minutos
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Usar query SQL direta para maior eficiência e garantia
      // Marcar como offline todos os usuários que:
      // 1. Estão marcados como online (isOnline = true)
      // 2. Não estão banidos (isBanned = false)
      // 3. E (não têm lastLogin OU lastLogin é mais antigo que 5 minutos)
      const result = await this.usersRepository.query(`
        UPDATE users
        SET "isOnline" = false
        WHERE "isOnline" = true
          AND "isBanned" = false
          AND ("lastLogin" IS NULL OR "lastLogin" < $1)
        RETURNING id, "lastLogin"
      `, [fiveMinutesAgo]);

      if (result && result.length > 0) {
        logger.info(`✅ [syncOnlineStatus] ${result.length} usuário(s) marcado(s) como offline (sem atividade recente ou sem lastLogin)`);
        logger.debug(`📋 [syncOnlineStatus] IDs dos usuários marcados como offline: [${result.map((u: any) => `ID:${u.id} lastLogin:${u.last_login || 'null'}`).join(', ')}]`);
      } else {
        logger.debug('✅ [syncOnlineStatus] Nenhum usuário inativo encontrado');
      }
    } catch (error) {
      logger.error('❌ [syncOnlineStatus] Erro ao sincronizar status online:', error);
    }
  }

  /**
   * Encerra duelos que ficaram inativos por mais de 5 horas
   * Executa a cada hora para verificar duelos inativos
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkAndCloseInactiveDuels(): Promise<void> {
    logger.info('🕐 [checkAndCloseInactiveDuels] Verificando duelos inativos...');

    try {
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000); // 5 horas atrás

      // Buscar duelos em progresso que não foram atualizados há mais de 5 horas
      // Usando query otimizada com LessThan para buscar apenas duelos inativos
      const inactiveDuels = await this.duelsRepository.find({
        where: {
          status: DuelStatus.IN_PROGRESS,
          updatedAt: LessThan(fiveHoursAgo),
        },
      });

      let closedCount = 0;

      for (const duel of inactiveDuels) {
        logger.info(`⏰ [checkAndCloseInactiveDuels] Encerrando duelo ${duel.id} - inativo desde ${duel.updatedAt.toISOString()}`);

        // Encerrar como cancelado (CANCELLED) já que não houve movimento - não conta vitória nem derrota
        await this.finishDuel(duel.id, DuelResult.CANCELLED, null);

        // Remover do cache em memória imediatamente
        const duelIdStr = duel.id; // duel.id é sempre string (UUID)
        this.activeDuels.delete(duelIdStr);

        closedCount++;
      }

      if (closedCount > 0) {
        logger.info(`✅ [checkAndCloseInactiveDuels] ${closedCount} duelo(s) inativo(s) encerrado(s)`);
      } else {
        logger.info(`ℹ️ [checkAndCloseInactiveDuels] Nenhum duelo inativo encontrado`);
      }
    } catch (error) {
      logger.error('❌ [checkAndCloseInactiveDuels] Erro ao verificar duelos inativos:', error);
    }
  }

  async getDuelLogs(duelId: string | number): Promise<DuelLog[]> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    try {
      // Logs ficam na própria linha do duelo (action_logs JSONB), igual player1Field/player2Field
      const duel = this.activeDuels.get(duelIdStr) ?? await this.duelsRepository.findOne({
        where: { id: duelIdStr },
        select: ['id', 'actionLogs'],
      });
      const raw = (duel as any)?.actionLogs;
      const arr = Array.isArray(raw) ? raw : [];
      const logs: DuelLog[] = arr.slice(-500).map((entry: any) => {
        const log = new DuelLog();
        log.id = entry.id || `${Date.now()}_${Math.random()}`;
        (log as any).duelId = duelIdStr;
        log.actionType = (entry.actionType as DuelActionType) || DuelActionType.CARD_DESTROYED;
        log.message = entry.message || '';
        log.createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date();
        (log as any).user = {
          id: entry.userId,
          username: entry.username ?? 'Jogador',
          nickname: entry.username ?? 'Jogador',
          clanTag: entry.clanTag ?? null,
        };
        return log;
      });
      if (logs.length > 0) {
        logger.debug(`✅ [getDuelLogs] ${logs.length} logs encontrados para duelo ${duelIdStr}`);
      }
      return logs;
    } catch (error) {
      logger.error(`❌ [getDuelLogs] Erro ao buscar logs do duelo ${duelIdStr}:`, error);
      return [];
    }
  }

  /**
   * Salva um log de ação do duelo no banco de dados
   */
  async saveDuelLog(
    duelId: string | number,
    userId: number,
    actionType: string,
    message: string
  ): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    try {
      // Mesmo fluxo das cartas: ler duelo (cache ou banco), alterar e salvar com updateDuelInDatabase
      let duel = this.activeDuels.get(duelIdStr) ?? await this.duelsRepository.findOne({
        where: { id: duelIdStr },
        select: ['id', 'actionLogs'],
      });
      if (!duel) {
        logger.warn(`⚠️ [saveDuelLog] Duelo ${duelIdStr} não encontrado - log não salvo: ${actionType}`);
        return;
      }

      const user = await this.usersRepository.findOne({
        where: { id: userId },
        select: ['id', 'nickname', 'clanTag'],
      });
      const displayName = user?.nickname ?? 'Jogador';
      const clanTag = user?.clanTag ?? null;

      const validActionTypes = Object.values(DuelActionType);
      const actionTypeToSave = validActionTypes.includes(actionType as DuelActionType)
        ? actionType
        : DuelActionType.CARD_DESTROYED;

      const currentLogs = Array.isArray((duel as any).actionLogs) ? [...(duel as any).actionLogs] : [];
      currentLogs.push({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId,
        username: displayName,
        clanTag,
        actionType: actionTypeToSave,
        message,
        createdAt: new Date().toISOString(),
      });

      // Persistir no banco igual player1Field/player2Field
      await this.updateDuelInDatabase(duelIdStr, { actionLogs: currentLogs } as any);

      // Manter cache em memória alinhado
      const cached = this.activeDuels.get(duelIdStr);
      if (cached) {
        (cached as any).actionLogs = currentLogs;
      }
      logger.debug(`✅ [saveDuelLog] Log salvo no duelo (action_logs): ${actionTypeToSave}`);
    } catch (error) {
      logger.error(`❌ [saveDuelLog] Erro ao salvar log do duelo ${duelIdStr}:`, error);
      logger.error(`❌ [saveDuelLog] Detalhes:`, {
        message: error?.message,
        actionType: actionType,
        duelId: duelIdStr,
        userId,
      });
    }
  }

  async getUserDuels(userId: number, limit: number = 50): Promise<Duel[]> {
    try {
      const duels = await this.duelsRepository.find({
        where: [
          { player1Id: userId },
          { player2Id: userId }
        ],
        relations: ['player1', 'player2'],
        order: { createdAt: 'DESC' },
        take: limit,
        select: {
          id: true,
          player1Id: true,
          player2Id: true,
          status: true,
          result: true,
          winnerId: true,
          createdAt: true,
          finishedAt: true,
          player1LifePoints: true,
          player2LifePoints: true,
          player1: {
            id: true,
            nickname: true,
            username: true,
            clanTag: true,
            profileImage: true,
          },
          player2: {
            id: true,
            nickname: true,
            username: true,
            clanTag: true,
            profileImage: true,
          },
        },
      });
      return duels;
    } catch (error) {
      logger.error('❌ [getUserDuels] Erro ao buscar duelos do usuário:', error);
      return [];
    }
  }

  async getActiveDuels(userId: number): Promise<Duel[]> {
    const active: Duel[] = [];
    const duelIdsToValidate: string[] = [];

    // Primeiro, buscar em memória e coletar IDs para validação
    for (const duel of this.activeDuels.values()) {
      if ((duel.player1Id === userId || duel.player2Id === userId) && duel.status === DuelStatus.IN_PROGRESS) {
        duelIdsToValidate.push(String(duel.id));
      }
    }

    // Validar duelos do cache no banco
    if (duelIdsToValidate.length > 0) {
      try {
        const validDuels = await this.duelsRepository.find({
          where: {
            id: In(duelIdsToValidate),
            status: DuelStatus.IN_PROGRESS,
          },
          select: ['id', 'status'],
        });

        const validDuelIds = new Set(validDuels.map(d => String(d.id)));

        // Adicionar apenas duelos válidos e remover inválidos do cache
        for (const duelId of duelIdsToValidate) {
          if (validDuelIds.has(duelId)) {
            const duel = this.activeDuels.get(duelId);
            if (duel) {
              active.push(duel);
            }
          } else {
            logger.info(`🧹 [getActiveDuels] Removendo duelo ${duelId} do cache (não existe mais no banco ou status mudou)`);
            this.activeDuels.delete(duelId);
          }
        }
      } catch (error) {
        logger.error(`❌ [getActiveDuels] Erro ao validar duelos do cache no banco:`, error);
        // Em caso de erro, limpar cache por segurança
        for (const duelId of duelIdsToValidate) {
          this.activeDuels.delete(duelId);
        }
      }
    }

    // Também buscar do banco de dados para garantir que não perdemos nenhum
    try {
      const duelsFromDb = await this.duelsRepository.find({
        where: [
          { player1Id: userId, status: DuelStatus.IN_PROGRESS },
          { player2Id: userId, status: DuelStatus.IN_PROGRESS }
        ],
        order: { updatedAt: 'DESC' },
        take: 10,
      });

      // Adicionar duelos do banco que não estão em memória
      for (const duel of duelsFromDb) {
        const existsInMemory = active.some(d => d.id === duel.id);
        if (!existsInMemory) {
          // Carregar campos JSONB corretamente
          if (duel.player1Field && typeof duel.player1Field === 'string') {
            (duel as any).player1Field = JSON.parse(duel.player1Field);
          }
          if (duel.player2Field && typeof duel.player2Field === 'string') {
            (duel as any).player2Field = JSON.parse(duel.player2Field);
          }
          active.push(duel);
          // Adicionar ao cache
          this.activeDuels.set(duel.id, duel);
        }
      }
    } catch (error) {
      logger.error(`❌ [getActiveDuels] Erro ao buscar do banco:`, error);
    }

    return active;
  }

  /**
   * Retorna todos os duelos ativos (para painel admin - assistir duelos).
   */
  async getAllActiveDuelsForAdmin(): Promise<Duel[]> {
    const active: Duel[] = [];
    const seenIds = new Set<string>();

    for (const duel of this.activeDuels.values()) {
      if (duel.status === DuelStatus.IN_PROGRESS) {
        active.push(duel);
        seenIds.add(String(duel.id));
      }
    }

    try {
      const fromDb = await this.duelsRepository.find({
        where: { status: DuelStatus.IN_PROGRESS },
        order: { updatedAt: 'DESC' },
        take: 50,
      });
      for (const duel of fromDb) {
        if (seenIds.has(String(duel.id))) continue;
        if (duel.player1Field && typeof duel.player1Field === 'string') {
          (duel as any).player1Field = JSON.parse(duel.player1Field as any);
        }
        if (duel.player2Field && typeof duel.player2Field === 'string') {
          (duel as any).player2Field = JSON.parse(duel.player2Field as any);
        }
        active.push(duel);
        seenIds.add(String(duel.id));
      }
    } catch (error) {
      logger.error('❌ [getAllActiveDuelsForAdmin] Erro ao buscar do banco:', error);
    }

    return active.sort((a, b) => {
      const aTime = (a as any).updatedAt?.getTime?.() ?? 0;
      const bTime = (b as any).updatedAt?.getTime?.() ?? 0;
      return bTime - aTime;
    });
  }

  /**
   * Encerra um duelo ativo (apenas admin). Marca como CANCELLED e remove do cache.
   */
  async adminTerminateActiveDuel(duelId: string): Promise<{ success: boolean; message: string }> {
    const duelIdStr = duelId?.trim?.() || duelId;
    if (!duelIdStr) {
      return { success: false, message: 'ID do duelo inválido' };
    }
    try {
      let duel: Duel | null | undefined = this.activeDuels.get(duelIdStr);
      if (!duel) {
        duel = await this.findDuelByIdFromDatabase(duelIdStr);
      }
      if (!duel) {
        return { success: false, message: 'Duelo não encontrado' };
      }
      if (duel.status !== DuelStatus.IN_PROGRESS) {
        return { success: false, message: 'Duelo não está ativo (já finalizado ou cancelado)' };
      }
      await this.finishDuel(duelIdStr, DuelResult.CANCELLED, null);
      this.activeDuels.delete(duelIdStr);
      this.activeDuelsCountCache = this.activeDuels.size;
      this.lastCountUpdate = Date.now();
      return { success: true, message: 'Duelo encerrado com sucesso' };
    } catch (error: any) {
      logger.error('❌ [adminTerminateActiveDuel] Erro ao encerrar duelo:', error?.message || error);
      return { success: false, message: error?.message || 'Erro ao encerrar duelo' };
    }
  }

  async getActiveDuelForUser(userId: number): Promise<Duel | null> {
    // Buscar primeiro em memória
    let cachedDuel: Duel | null = null;
    for (const duel of this.activeDuels.values()) {
      if ((duel.player1Id === userId || duel.player2Id === userId) && duel.status === DuelStatus.IN_PROGRESS) {
        cachedDuel = duel;
        break;
      }
    }

    // Se encontrou no cache, validar no banco se ainda existe
    if (cachedDuel) {
      try {
        const duelInDb = await this.duelsRepository.findOne({
          where: { id: cachedDuel.id },
          select: ['id', 'status'],
        });

        // Se não existe no banco ou status mudou, remover do cache
        if (!duelInDb || duelInDb.status !== DuelStatus.IN_PROGRESS) {
          logger.info(`🧹 [getActiveDuelForUser] Removendo duelo ${cachedDuel.id} do cache (não existe mais no banco ou status mudou)`);
          this.activeDuels.delete(cachedDuel.id);
          cachedDuel = null;
        } else {
          // Duelo ainda existe e está ativo, retornar do cache
          return cachedDuel;
        }
      } catch (error) {
        logger.error(`❌ [getActiveDuelForUser] Erro ao validar duelo do cache no banco:`, error);
        // Em caso de erro, remover do cache por segurança
        if (cachedDuel) {
          this.activeDuels.delete(cachedDuel.id);
        }
        cachedDuel = null;
      }
    }

    // Se não encontrou em memória ou foi removido do cache, buscar do banco
    try {
      const duel = await this.duelsRepository.findOne({
        where: [
          { player1Id: userId, status: DuelStatus.IN_PROGRESS },
          { player2Id: userId, status: DuelStatus.IN_PROGRESS }
        ],
        order: { updatedAt: 'DESC' },
      });

      if (duel) {
        // Carregar campos JSONB corretamente
        if (duel.player1Field && typeof duel.player1Field === 'string') {
          (duel as any).player1Field = JSON.parse(duel.player1Field);
        }
        if (duel.player2Field && typeof duel.player2Field === 'string') {
          (duel as any).player2Field = JSON.parse(duel.player2Field);
        }
        // Adicionar ao cache
        this.activeDuels.set(duel.id, duel);
        return duel;
      }
    } catch (error: any) {
      // Se o erro for sobre coluna turn_counter não existir, tentar criar
      if (error?.message?.includes('turn_counter') || error?.message?.includes('does not exist')) {
        logger.info(`⚠️ [getActiveDuelForUser] Coluna turn_counter não existe. Tentando criar...`);
        try {
          await this.ensureTurnCounterColumn();
          // Tentar novamente após criar a coluna
          const duel = await this.duelsRepository.findOne({
            where: [
              { player1Id: userId, status: DuelStatus.IN_PROGRESS },
              { player2Id: userId, status: DuelStatus.IN_PROGRESS }
            ],
            order: { updatedAt: 'DESC' },
          });

          if (duel) {
            if (duel.player1Field && typeof duel.player1Field === 'string') {
              (duel as any).player1Field = JSON.parse(duel.player1Field);
            }
            if (duel.player2Field && typeof duel.player2Field === 'string') {
              (duel as any).player2Field = JSON.parse(duel.player2Field);
            }
            this.activeDuels.set(duel.id, duel);
            return duel;
          }
        } catch (migrationError) {
          logger.error(`❌ [getActiveDuelForUser] Erro ao criar coluna turn_counter:`, migrationError);
        }
      } else {
        logger.error(`❌ [getActiveDuelForUser] Erro ao buscar do banco:`, error);
      }
    }

    return null;
  }

  private async ensureTurnCounterColumn(): Promise<void> {
    const queryRunner = this.duelsRepository.manager.connection.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'duels'
        AND column_name = 'turn_counter'
      `);

      if (result.length === 0) {
        logger.info(`🔧 [ensureTurnCounterColumn] Criando coluna turn_counter...`);
        await queryRunner.query(`
          ALTER TABLE duels
          ADD COLUMN turn_counter INTEGER DEFAULT 1
        `);
        await queryRunner.query(`
          UPDATE duels
          SET turn_counter = 1
          WHERE turn_counter IS NULL
        `);
        logger.info(`✅ [ensureTurnCounterColumn] Coluna turn_counter criada!`);
      }
    } catch (error: any) {
      if (error?.message?.includes('already exists') || error?.code === '42701') {
        logger.info(`✅ [ensureTurnCounterColumn] Coluna turn_counter já existe.`);
      } else {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  async getFinishedDuels(userId: number): Promise<Duel[]> {
    try {
      const duels = await this.duelsRepository.find({
        where: [
          { player1Id: userId, status: DuelStatus.FINISHED },
          { player2Id: userId, status: DuelStatus.FINISHED }
        ],
        order: { finishedAt: 'DESC' },
        take: 50,
      });
      return duels;
    } catch (error) {
      return [];
    }
  }

  async deleteInactiveDuel(duelId: string | number, userId: number): Promise<{ success: boolean; message: string }> {
    try {
      // Garantir que duelId seja string (UUID)
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      const duel = await this.duelsRepository.findOne({
        where: { id: duelIdStr },
      });

      if (!duel) {
        return { success: false, message: 'Duelo não encontrado' };
      }

      if (duel.player1Id !== userId && duel.player2Id !== userId) {
        return { success: false, message: 'Você não tem permissão para deletar este duelo' };
      }

      if (duel.status === DuelStatus.IN_PROGRESS) {
        return { success: false, message: 'Não é possível deletar um duelo em andamento' };
      }

      await this.duelsRepository.delete(duelIdStr);
      return { success: true, message: 'Duelo deletado com sucesso' };
    } catch (error) {
      return { success: false, message: 'Erro ao deletar duelo' };
    }
  }

  async deleteMultipleInactiveDuels(userId: number, duelIds: (string | number)[]): Promise<{ success: boolean; message: string; deleted: number }> {
    try {
      let deleted = 0;
      for (const duelId of duelIds) {
        const result = await this.deleteInactiveDuel(duelId, userId);
        if (result.success) {
          deleted++;
        }
      }
      return { success: true, message: `${deleted} duelo(s) deletado(s)`, deleted };
    } catch (error) {
      return { success: false, message: 'Erro ao deletar duelos', deleted: 0 };
    }
  }

  private activeDuelsCountCache: number = 0;
  private lastCountUpdate: number = 0;
  private readonly COUNT_CACHE_MS = 1000;

  getActiveDuelsCount(): number {
    const now = Date.now();
    if (now - this.lastCountUpdate > this.COUNT_CACHE_MS) {
      this.activeDuelsCountCache = this.activeDuels.size;
      this.lastCountUpdate = now;
    }
    return this.activeDuelsCountCache;
  }

  /** True se algum dos jogadores já tem duelo de torneio WAITING/IN_PROGRESS. */
  async hasActiveTournamentDuelForPlayers(playerIds: number[]): Promise<boolean> {
    const ids = [...new Set(playerIds)].filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) return false;
    const count = await this.duelsRepository
      .createQueryBuilder('d')
      .where('d.status IN (:...statuses)', {
        statuses: [DuelStatus.WAITING, DuelStatus.IN_PROGRESS],
      })
      .andWhere('d.origin = :origin', { origin: DuelOrigin.TOURNAMENT })
      .andWhere('(d.player1Id IN (:...ids) OR d.player2Id IN (:...ids))', { ids })
      .getCount();
    return count > 0;
  }

  /**
   * Conflitos de agenda são resolvidos antes de iniciar um novo duelo.
   * Duelo comum nunca substitui um ativo.
   * Partida de torneio com horário vencido pode encerrar duelos NÃO-torneio
   * (random/arena/etc). Nunca encerra outro duelo de torneio — isso gerava
   * cascata infinita de createDuel → force-finish → avanço de chave.
   */
  private async enforceExclusiveDuel(player1Id: number, player2Id: number, origin: DuelOrigin): Promise<void> {
    const conflicts = await this.duelsRepository.createQueryBuilder('d')
      .where('d.status IN (:...statuses)', { statuses: [DuelStatus.WAITING, DuelStatus.IN_PROGRESS] })
      .andWhere('(d.player1Id IN (:...players) OR d.player2Id IN (:...players))',
        { players: [player1Id, player2Id] })
      .orderBy('d.createdAt', 'ASC')
      .getMany();
    if (!conflicts.length) return;

    const tournamentConflicts = conflicts.filter((c) => c.origin === DuelOrigin.TOURNAMENT);
    const otherConflicts = conflicts.filter((c) => c.origin !== DuelOrigin.TOURNAMENT);

    // Sempre bloquear se já existe duelo de torneio ativo (evita cascata)
    if (tournamentConflicts.length > 0) {
      throw new Error('Um dos duelistas já está em duelo de torneio. Aguarde o término.');
    }

    if (origin !== DuelOrigin.TOURNAMENT ||
        !(await this.tournamentsService.isScheduledMatchDue(player1Id, player2Id))) {
      throw new Error('Um dos duelistas já possui duelo ativo. Aguarde o término para iniciar outro.');
    }

    for (const conflict of otherConflicts) {
      // Só encerra random/arena/etc. — nunca torneio.
      const duel = await this.findDuelByIdFromDatabase(conflict.id) || conflict;
      if (duel.status === DuelStatus.FINISHED || duel.status === DuelStatus.CANCELLED) continue;
      if (duel.origin === DuelOrigin.TOURNAMENT) continue;
      const side = decideForcedWinner({
        player1LifePoints: duel.player1LifePoints,
        player2LifePoints: duel.player2LifePoints,
        player1Field: duel.player1Field,
        player2Field: duel.player2Field,
      });
      const winnerId = side === 1 ? duel.player1Id : duel.player2Id;
      await this.finishDuel(
        duel.id,
        side === 1 ? DuelResult.PLAYER1_WIN : DuelResult.PLAYER2_WIN,
        winnerId,
      );
      logger.info(`🏆 [exclusive-duel] ${duel.id} (não-torneio) encerrado por início de torneio; vencedor ${winnerId}`);
    }
  }

  async createDuel(
    player1Id: number,
    player2Id: number,
    origin: DuelOrigin = DuelOrigin.OTHER,
    options?: { player1AnimeDeckId?: string; player2AnimeDeckId?: string },
  ): Promise<Duel | null> {
    logger.info(`🎮 [createDuel] ==========================================`);
    logger.info(`🎮 [createDuel] Chamado para P1=${player1Id}, P2=${player2Id}, Origin=${origin}`);

    // Garantir que origin sempre tenha um valor válido
    if (!origin || !Object.values(DuelOrigin).includes(origin)) {
      logger.warn(`⚠️ [createDuel] Origin inválido ou não fornecido: ${origin}, usando OTHER como padrão`);
      origin = DuelOrigin.OTHER;
    }
    logger.info(`🎮 [createDuel] Origin final: ${origin}`);

    // Validação: não permitir duelo contra si mesmo
    if (player1Id === player2Id) {
      logger.error(`❌ [createDuel] Tentativa de criar duelo contra si mesmo! Player1Id=${player1Id}, Player2Id=${player2Id}`);
      throw new Error('Você não pode criar um duelo contra si mesmo!');
    }

    const isAnimeDuel = origin === DuelOrigin.RANDOM_ANIME && options?.player1AnimeDeckId && options?.player2AnimeDeckId;

    // Validação prévia: verificar deck equipado (exceto no modo Anime Deck, onde o deck é o pré-definido)
    if (!isAnimeDuel) {
      const player1HasDeck = await this.hasEquippedDeck(player1Id);
      const player2HasDeck = await this.hasEquippedDeck(player2Id);

      if (!player1HasDeck) {
        const player1 = await this.usersRepository.findOne({ where: { id: player1Id }, select: ['username'] });
        const username = player1?.username || `ID ${player1Id}`;
        logger.error(`❌ [createDuel] Player1 (${username}) não tem deck equipado!`);
        throw new Error(`Jogador ${username} não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.`);
      }

      if (!player2HasDeck) {
        const player2 = await this.usersRepository.findOne({ where: { id: player2Id }, select: ['username'] });
        const username = player2?.username || `ID ${player2Id}`;
        logger.error(`❌ [createDuel] Player2 (${username}) não tem deck equipado!`);
        throw new Error(`Jogador ${username} não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.`);
      }
    }

    const duelKey = `${Math.min(player1Id, player2Id)}_${Math.max(player1Id, player2Id)}`;
    logger.info(`🎮 [createDuel] DuelKey: ${duelKey}`);

    const existingCreation = this.creatingDuels.get(duelKey);
    if (existingCreation) {
      logger.info(`🎮 [createDuel] Já existe criação em andamento para este par, aguardando...`);
      return await existingCreation;
    }

    if (this.creatingDuelPlayers.has(player1Id) || this.creatingDuelPlayers.has(player2Id)) {
      throw new Error('Um dos duelistas já está iniciando outro duelo.');
    }
    this.creatingDuelPlayers.add(player1Id);
    this.creatingDuelPlayers.add(player2Id);
        logger.info(`🎮 [createDuel] Criando nova promise de criação...`);
    const creationPromise = (async (): Promise<Duel | null> => {
      try {
        logger.info(`🎮 [createDuel] Promise iniciada, chamando createDuelInternal...`);
        // Não liberar a reserva enquanto a criação continua em execução.
        // Um Promise.race com timeout abandonava a reserva, mas a operação
        // interna ainda podia salvar um duelo depois.
        const duel = await withDuelPlayerLocks(
          this.duelsRepository,
          [player1Id, player2Id],
          () => this.createDuelInternal(player1Id, player2Id, origin, options),
        ).catch((error) => {
          logger.error(`❌ [createDuel] Erro:`, error);
          // Propagar o erro para o cliente receber a mensagem real (ex.: deck vazio, timeout)
          const err = error instanceof Error ? error : new Error(String(error));
          throw err;
        });

        if (duel && duel.id) {
          logger.info(`✅ [createDuel] ==========================================`);
          logger.info(`✅ [createDuel] Duelo criado com sucesso!`);
          logger.info(`✅ [createDuel] ID: ${duel.id} (tipo: ${typeof duel.id})`);
          logger.info(`✅ [createDuel] Player1Id: ${duel.player1Id}, Player2Id: ${duel.player2Id}`);
          logger.info(`✅ [createDuel] Status: ${duel.status}, Origin: ${duel.origin}`);
          logger.info(`✅ [createDuel] ==========================================`);
        } else {
          logger.error(`❌ [createDuel] ==========================================`);
          logger.error(`❌ [createDuel] Duelo retornou null ou sem ID`);
          logger.error(`❌ [createDuel] Duel:`, duel);
          logger.error(`❌ [createDuel] ==========================================`);
          throw new Error('Falha ao criar duelo. Verifique se ambos os decks têm pelo menos 40 cartas e tente novamente.');
        }

        return duel;
      } catch (error) {
        logger.error(`❌ [createDuel] Erro ao criar duelo:`, error);
        throw error instanceof Error ? error : new Error(String(error));
      }
    })();

    this.creatingDuels.set(duelKey, creationPromise);
    try {
      return await creationPromise;
    } finally {
      this.creatingDuels.delete(duelKey);
      this.creatingDuelPlayers.delete(player1Id);
      this.creatingDuelPlayers.delete(player2Id);
    }
  }

  async verifyDuelInDatabase(duelId: string | number): Promise<boolean> {
    try {
      // Garantir que duelId seja string (UUID)
      const duelIdStr = typeof duelId === 'string' ? duelId : String(duelId);

      // Validar formato UUID básico (8-4-4-4-12 caracteres hexadecimais)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(duelIdStr)) {
        logger.error(`❌ [verifyDuelInDatabase] ID inválido (não é UUID): ${duelIdStr}`);
        return false;
      }

      const duel = await this.duelsRepository.findOne({
        where: { id: duelIdStr },
        select: ['id']
      });

      return !!duel;
    } catch (error: any) {
      logger.error(`❌ [verifyDuelInDatabase] Erro ao verificar duelo ${duelId}:`, error);
      logger.error(`❌ [verifyDuelInDatabase] Tipo do erro:`, error?.constructor?.name);
      logger.error(`❌ [verifyDuelInDatabase] Mensagem:`, error?.message);
      logger.error(`❌ [verifyDuelInDatabase] Código:`, error?.code);
      return false;
    }
  }

  private async createDuelInternal(
    player1Id: number,
    player2Id: number,
    origin: DuelOrigin = DuelOrigin.OTHER,
    options?: { player1AnimeDeckId?: string; player2AnimeDeckId?: string },
  ): Promise<Duel | null> {
    logger.info(`🚀 [createDuelInternal] ==========================================`);
    logger.info(`🚀 [createDuelInternal] INICIANDO criação de duelo`);
    logger.info(`🚀 [createDuelInternal] Player1Id: ${player1Id}, Player2Id: ${player2Id}, Origin: ${origin}`);
    try {
      await this.enforceExclusiveDuel(player1Id, player2Id, origin);
      const activeDuels = this.getActiveDuelsCount();
      const queryTimeout = activeDuels > 0 ? 2000 : 5000;
      logger.info(`🚀 [createDuelInternal] ActiveDuels: ${activeDuels}, QueryTimeout: ${queryTimeout}ms`);

      await new Promise(resolve => setImmediate(resolve));
      logger.info(`🚀 [createDuelInternal] Buscando players no banco...`);

      const [player1, player2] = await Promise.race([
        Promise.all([
          this.usersRepository.findOne({
            where: { id: player1Id },
            select: [
              'id',
              'username',
              'nickname',
              'clanTag',
              'level',
              'profileImage',
              'equippedPlaymatId',
              'equippedPlaymatImage',
              'equippedSkinId',
              'equippedSkinImage',
              'equippedDeckId',
              'equippedDeckName',
            ],
          }),
          this.usersRepository.findOne({
            where: { id: player2Id },
            select: [
              'id',
              'username',
              'nickname',
              'clanTag',
              'level',
              'profileImage',
              'equippedPlaymatId',
              'equippedPlaymatImage',
              'equippedSkinId',
              'equippedSkinImage',
              'equippedDeckId',
              'equippedDeckName',
            ],
          }),
        ]),
        new Promise<[null, null]>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), queryTimeout)
        )
      ]).catch(() => [null, null]);

      if (!player1 || !player2) {
        logger.error(`❌ [createDuelInternal] Player não encontrado. P1: ${player1 ? 'OK' : 'NULL'}, P2: ${player2 ? 'OK' : 'NULL'}`);
      return null;
      }

      logger.info(`✅ [createDuelInternal] Players encontrados: P1=${player1.id} (${player1.username}), P2=${player2.id} (${player2.username})`);
      logger.info(`🔍 [createDuelInternal] P1 completo:`, JSON.stringify({
        id: player1.id,
        username: player1.username,
        equippedDeckId: (player1 as any).equippedDeckId,
        equippedDeckName: (player1 as any).equippedDeckName,
      }, null, 2));
      logger.info(`🔍 [createDuelInternal] P2 completo:`, JSON.stringify({
        id: player2.id,
        username: player2.username,
        equippedDeckId: (player2 as any).equippedDeckId,
        equippedDeckName: (player2 as any).equippedDeckName,
      }, null, 2));

      const useAnimeDecks = !!(
        options?.player1AnimeDeckId &&
        options?.player2AnimeDeckId &&
        origin === DuelOrigin.RANDOM_ANIME
      );

      let player1Deck: { deck: any[]; hand: any[]; extraDeck: any[] };
      let player2Deck: { deck: any[]; hand: any[]; extraDeck: any[] };

      if (useAnimeDecks) {
        logger.info(`🚀 [createDuelInternal] Modo Anime Deck: P1=${options!.player1AnimeDeckId}, P2=${options!.player2AnimeDeckId}`);
        player1Deck = await this.preparePlayerDeckFromAnimeDeck(options!.player1AnimeDeckId!);
        player2Deck = await this.preparePlayerDeckFromAnimeDeck(options!.player2AnimeDeckId!);
      } else {
        // Validar se ambos os jogadores têm deck equipado (por ID ou por nome)
        const player1DeckId = (player1 as any).equippedDeckId;
        const player1DeckName = (player1 as any).equippedDeckName || 'Meu Deck';
        const player2DeckId = (player2 as any).equippedDeckId;
        const player2DeckName = (player2 as any).equippedDeckName || 'Meu Deck';
        const p1HasEquipped = (player1DeckId && String(player1DeckId).trim() !== '') || (player1DeckName && player1DeckName.trim() !== '');
        const p2HasEquipped = (player2DeckId && String(player2DeckId).trim() !== '') || (player2DeckName && player2DeckName.trim() !== '');

        if (!p1HasEquipped) {
          logger.error(`❌ [createDuelInternal] Player1 (${player1.username}) não tem deck equipado!`);
          throw new Error(`Jogador ${player1.username} não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.`);
        }
        if (!p2HasEquipped) {
          logger.error(`❌ [createDuelInternal] Player2 (${player2.username}) não tem deck equipado!`);
          throw new Error(`Jogador ${player2.username} não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.`);
        }

        logger.info(`🚀 [createDuelInternal] Preparando decks... P1 deckId: ${player1DeckId ?? 'null'}, name: ${player1DeckName}; P2 deckId: ${player2DeckId ?? 'null'}, name: ${player2DeckName}`);
        player1Deck = await this.preparePlayerDeck(player1Id, player1DeckName, player1DeckId);
        player2Deck = await this.preparePlayerDeck(player2Id, player2DeckName, player2DeckId);
      }

      logger.info(`✅ [createDuelInternal] Deck P1 preparado: ${player1Deck.deck.length} cartas no deck, ${player1Deck.hand.length} na mão, ${player1Deck.extraDeck.length} no extra deck`);

      // Validação adicional: garantir que o deck tenha cartas
      if (player1Deck.deck.length === 0 && player1Deck.hand.length === 0) {
        logger.error(`❌ [createDuelInternal] Deck P1 está vazio após preparação!`);
        throw new Error(`Deck do jogador 1 está vazio. Por favor, adicione cartas ao deck.`);
      }

      // Validar tamanho mínimo (40 cartas no total: deck + mão) - extra deck não conta
      const totalCardsP1 = player1Deck.deck.length + player1Deck.hand.length;
      if (totalCardsP1 < 40) {
        logger.error(`❌ [createDuelInternal] Deck P1 tem apenas ${totalCardsP1} cartas (mínimo: 40)`);
        throw new Error(`Deck do jogador 1 tem apenas ${totalCardsP1} cartas. O mínimo é 40 cartas.`);
      }

      await new Promise(resolve => setImmediate(resolve));
      logger.info(`✅ [createDuelInternal] Deck P2 preparado: ${player2Deck.deck.length} cartas no deck, ${player2Deck.hand.length} na mão, ${player2Deck.extraDeck.length} no extra deck`);

      // Validação adicional: garantir que o deck tenha cartas
      if (player2Deck.deck.length === 0 && player2Deck.hand.length === 0) {
        logger.error(`❌ [createDuelInternal] Deck P2 está vazio após preparação!`);
        throw new Error(`Deck do jogador 2 está vazio. Por favor, adicione cartas ao deck.`);
      }

      // Validar tamanho mínimo (40 cartas no total: deck + mão) - extra deck não conta
      const totalCardsP2 = player2Deck.deck.length + player2Deck.hand.length;
      if (totalCardsP2 < 40) {
        logger.error(`❌ [createDuelInternal] Deck P2 tem apenas ${totalCardsP2} cartas (mínimo: 40)`);
        throw new Error(`Deck do jogador 2 tem apenas ${totalCardsP2} cartas. O mínimo é 40 cartas.`);
      }

      const player1Field = {
        ...this.createEmptyField(),
        deck: player1Deck.deck,
        hand: player1Deck.hand,
        extraDeck: player1Deck.extraDeck, // Extra Deck separado do deck principal
        turnCounter: 1, // Inicializar contador de turnos no campo JSON
      };

      const player2Field = {
        ...this.createEmptyField(),
        deck: player2Deck.deck,
        hand: player2Deck.hand,
        extraDeck: player2Deck.extraDeck, // Extra Deck separado do deck principal
        turnCounter: 1, // Inicializar contador de turnos no campo JSON
      };

      // Log detalhado ANTES de atribuir ao duelData
      logger.info(`🔍 [createDuelInternal] ANTES de atribuir ao duelData:`);
      logger.info(`  - player1Field.deck.length: ${player1Field.deck.length}`);
      logger.info(`  - player1Field.hand.length: ${player1Field.hand.length}`);
      logger.info(`  - player2Field.deck.length: ${player2Field.deck.length}`);
      logger.info(`  - player2Field.hand.length: ${player2Field.hand.length}`);
      logger.info(`  - player1Field é objeto: ${typeof player1Field === 'object'}`);
      logger.info(`  - player2Field é objeto: ${typeof player2Field === 'object'}`);

      const duelData = new Duel();
      delete (duelData as any).id;

      duelData.player1Id = player1.id;
      duelData.player2Id = player2.id;
      duelData.player1Nickname = player1.nickname || player1.username || null;
      duelData.player2Nickname = player2.nickname || player2.username || null;
      duelData.status = DuelStatus.IN_PROGRESS;
      duelData.player1LifePoints = 8000;
      duelData.player2LifePoints = 8000;
      duelData.currentTurn = Math.random() > 0.5 ? 1 : 2;
      duelData.currentPhase = TurnPhase.DRAW;
      duelData.result = null as any;
      duelData.winnerId = null;
      duelData.finishedAt = null as any;
      duelData.duelTime = 0;
      // Inicializar contador global de turnos
      duelData.turnCounter = 1;
      logger.info(`🔄 [createDuelInternal] turnCounter inicializado em 1`);
      duelData.turnTime = 90;
      (duelData as any).turnStartedAt = new Date(); // Inicializar timestamp do turno

      // Garantir que origin sempre tenha um valor válido
      if (!origin || !Object.values(DuelOrigin).includes(origin)) {
        logger.warn(`⚠️ [createDuelInternal] Origin inválido ou não fornecido: ${origin}, usando OTHER como padrão`);
        origin = DuelOrigin.OTHER;
      }
      duelData.origin = origin;
      logger.info(`📌 [createDuelInternal] Origin definido: ${duelData.origin}`);
      logger.info(`🧹 [createDuelInternal] ANTES de limpar - P1Field: ${player1Field?.deck?.length || 0} cartas no deck, ${player1Field?.hand?.length || 0} na mão`);
      logger.info(`🧹 [createDuelInternal] ANTES de limpar - P2Field: ${player2Field?.deck?.length || 0} cartas no deck, ${player2Field?.hand?.length || 0} na mão`);

      // As cartas já vêm compactadas do preparePlayerDeck, então não precisamos compactar novamente
      // Apenas garantir que os campos existam
      // IMPORTANTE: Atribuir diretamente usando (duelData as any) para garantir que o TypeORM reconheça
      // Garantir que monsters e spellTrap sejam arrays de 5 elementos (null para vazio)
      const normalizeMonstersArray = (arr: any[] | undefined | null): (any | null)[] => {
        if (!Array.isArray(arr)) return [null, null, null, null, null];
        const result = [...arr];
        while (result.length < 5) result.push(null);
        return result.slice(0, 5);
      };

      const normalizeSpellTrapArray = (arr: any[] | undefined | null): (any | null)[] => {
        if (!Array.isArray(arr)) return [null, null, null, null, null];
        const result = [...arr];
        while (result.length < 5) result.push(null);
        return result.slice(0, 5);
      };

      const p1FieldObj = {
        deck: player1Field.deck || [],
        hand: player1Field.hand || [],
        extraDeck: player1Field.extraDeck || [], // Extra Deck separado do deck principal
        monsters: normalizeMonstersArray(player1Field.monsters),
        spellTrap: normalizeSpellTrapArray(player1Field.spellTrap),
        graveyard: player1Field.graveyard || [],
        banished: player1Field.banished || [],
        normalSummonUsed: false,
        positionChangedThisTurn: false,
        monsterDestroyedThisTurn: false, // Flag para Last Will
        // Armazenar turnCounter no JSON para validação de cartas
        turnCounter: 1,
        // Quem deu o primeiro turno (regras de DP→MP2 / sem BP no 1º turno)
        firstTurnPlayer: duelData.currentTurn,
        stolenTurnOccurred: false,
      };

      const p2FieldObj = {
        deck: player2Field.deck || [],
        hand: player2Field.hand || [],
        extraDeck: player2Field.extraDeck || [], // Extra Deck separado do deck principal
        monsters: normalizeMonstersArray(player2Field.monsters),
        spellTrap: normalizeSpellTrapArray(player2Field.spellTrap),
        graveyard: player2Field.graveyard || [],
        banished: player2Field.banished || [],
        normalSummonUsed: false,
        positionChangedThisTurn: false,
        monsterDestroyedThisTurn: false, // Flag para Last Will
        // Armazenar turnCounter no JSON para validação de cartas
        turnCounter: 1,
        firstTurnPlayer: duelData.currentTurn,
        stolenTurnOccurred: false,
      };

      logger.info(`🔍 [createDuelInternal] ANTES de atribuir ao duelData:`);
      logger.info(`  - p1FieldObj.deck.length: ${p1FieldObj.deck.length}`);
      logger.info(`  - p1FieldObj.hand.length: ${p1FieldObj.hand.length}`);
      logger.info(`  - p2FieldObj.deck.length: ${p2FieldObj.deck.length}`);
      logger.info(`  - p2FieldObj.hand.length: ${p2FieldObj.hand.length}`);

      // Atribuir usando (duelData as any) para garantir que o TypeORM reconheça
      (duelData as any).player1Field = p1FieldObj;
      (duelData as any).player2Field = p2FieldObj;
      (duelData as any).actionLogs = []; // Log de ações (persistido junto com o duelo, como as cartas)

      logger.info(`✅ [createDuelInternal] DEPOIS de atribuir ao duelData:`);
      logger.info(`  - duelData.player1Field existe: ${!!(duelData as any).player1Field}`);
      logger.info(`  - duelData.player1Field.deck.length: ${(duelData as any).player1Field?.deck?.length || 0}`);
      logger.info(`  - duelData.player1Field.hand.length: ${(duelData as any).player1Field?.hand?.length || 0}`);
      logger.info(`  - duelData.player2Field existe: ${!!(duelData as any).player2Field}`);
      logger.info(`  - duelData.player2Field.deck.length: ${(duelData as any).player2Field?.deck?.length || 0}`);
      logger.info(`  - duelData.player2Field.hand.length: ${(duelData as any).player2Field?.hand?.length || 0}`);

      // Validação crítica: garantir que ambos os campos foram atribuídos corretamente
      if (!(duelData as any).player1Field || !(duelData as any).player1Field.deck || (duelData as any).player1Field.deck.length === 0) {
        logger.error(`❌ [createDuelInternal] ERRO CRÍTICO: player1Field não foi atribuído corretamente!`);
        throw new Error(`Erro ao atribuir player1Field ao duelData`);
      }
      if (!(duelData as any).player2Field || !(duelData as any).player2Field.deck || (duelData as any).player2Field.deck.length === 0) {
        logger.error(`❌ [createDuelInternal] ERRO CRÍTICO: player2Field não foi atribuído corretamente!`);
        throw new Error(`Erro ao atribuir player2Field ao duelData`);
      }

      // Log de exemplo de carta para debug
      if (duelData.player1Field.deck.length > 0) {
        logger.info(`📦 [createDuelInternal] Exemplo de carta do deck P1:`, {
          id: duelData.player1Field.deck[0].id,
          idCarta: duelData.player1Field.deck[0].idCarta,
          name: duelData.player1Field.deck[0].name,
        });
      }
      if (duelData.player1Field.hand.length > 0) {
        logger.info(`📦 [createDuelInternal] Exemplo de carta da mão P1:`, {
          id: duelData.player1Field.hand[0].id,
          idCarta: duelData.player1Field.hand[0].idCarta,
          name: duelData.player1Field.hand[0].name,
        });
      }

      logger.info(`💾 [createDuelInternal] ==========================================`);
      logger.info(`💾 [createDuelInternal] Tentando salvar duelo no banco...`);
      logger.info(`💾 [createDuelInternal] Dados antes do save:`, JSON.stringify({
        player1Id: duelData.player1Id,
        player2Id: duelData.player2Id,
        player1Nickname: duelData.player1Nickname,
        player2Nickname: duelData.player2Nickname,
        status: duelData.status,
        origin: duelData.origin,
        player1LifePoints: duelData.player1LifePoints,
        player2LifePoints: duelData.player2LifePoints,
        currentTurn: duelData.currentTurn,
        currentPhase: duelData.currentPhase,
        duelTime: duelData.duelTime,
        turnTime: duelData.turnTime,
        hasId: !!(duelData as any).id,
        hasPlayer1Field: !!duelData.player1Field,
        hasPlayer2Field: !!duelData.player2Field,
        player1FieldKeys: duelData.player1Field ? Object.keys(duelData.player1Field) : null,
        player2FieldKeys: duelData.player2Field ? Object.keys(duelData.player2Field) : null,
      }, null, 2));

      let savedDuel: Duel;
      try {
        logger.info(`💾 [createDuelInternal] Chamando duelsRepository.save()...`);
        logger.info(`💾 [createDuelInternal] Tipo de duelData:`, typeof duelData);
        logger.info(`💾 [createDuelInternal] duelData é instância de Duel:`, duelData instanceof Duel);
        logger.info(`💾 [createDuelInternal] duelData.id antes do save:`, (duelData as any).id);
        logger.info(`💾 [createDuelInternal] ANTES DO SAVE - player1Field.deck.length: ${duelData.player1Field?.deck?.length || 0}`);
        logger.info(`💾 [createDuelInternal] ANTES DO SAVE - player1Field.hand.length: ${duelData.player1Field?.hand?.length || 0}`);
        logger.info(`💾 [createDuelInternal] ANTES DO SAVE - player2Field.deck.length: ${duelData.player2Field?.deck?.length || 0}`);
        logger.info(`💾 [createDuelInternal] ANTES DO SAVE - player2Field.hand.length: ${duelData.player2Field?.hand?.length || 0}`);

        // Serializar os campos para garantir que são JSON válido
        const player1FieldJson = JSON.parse(JSON.stringify(duelData.player1Field));
        const player2FieldJson = JSON.parse(JSON.stringify(duelData.player2Field));

        logger.info(`💾 [createDuelInternal] APÓS SERIALIZAÇÃO - player1Field.deck.length: ${player1FieldJson?.deck?.length || 0}, hand.length: ${player1FieldJson?.hand?.length || 0}`);
        logger.info(`💾 [createDuelInternal] APÓS SERIALIZAÇÃO - player2Field.deck.length: ${player2FieldJson?.deck?.length || 0}, hand.length: ${player2FieldJson?.hand?.length || 0}`);

        // Validar que ambos os campos têm cartas antes de salvar
        if (!player1FieldJson?.deck || player1FieldJson.deck.length === 0) {
          logger.error(`❌ [createDuelInternal] ERRO CRÍTICO: player1Field.deck está vazio após serialização!`);
          throw new Error(`Erro ao preparar deck do jogador 1: deck está vazio após serialização`);
        }
        if (!player2FieldJson?.deck || player2FieldJson.deck.length === 0) {
          logger.error(`❌ [createDuelInternal] ERRO CRÍTICO: player2Field.deck está vazio após serialização!`);
          throw new Error(`Erro ao preparar deck do jogador 2: deck está vazio após serialização`);
        }

        // Garantir que ambos os campos são objetos válidos antes de salvar
        if (typeof player1FieldJson !== 'object' || player1FieldJson === null) {
          logger.error(`❌ [createDuelInternal] player1FieldJson não é um objeto válido!`);
          throw new Error(`Erro ao serializar player1Field`);
        }
        if (typeof player2FieldJson !== 'object' || player2FieldJson === null) {
          logger.error(`❌ [createDuelInternal] player2FieldJson não é um objeto válido!`);
          throw new Error(`Erro ao serializar player2Field`);
        }

        // Verificar estrutura final antes de salvar
        logger.info(`💾 [createDuelInternal] Estrutura final antes de salvar:`);
        logger.info(`  - player1Field:`, {
          hasDeck: !!player1FieldJson.deck,
          deckLength: player1FieldJson.deck?.length || 0,
          hasHand: !!player1FieldJson.hand,
          handLength: player1FieldJson.hand?.length || 0,
        });
        logger.info(`  - player2Field:`, {
          hasDeck: !!player2FieldJson.deck,
          deckLength: player2FieldJson.deck?.length || 0,
          hasHand: !!player2FieldJson.hand,
          handLength: player2FieldJson.hand?.length || 0,
        });

        // Atribuir os campos serializados diretamente ao objeto
        // IMPORTANTE: Garantir que ambos os campos sejam atribuídos antes de salvar
        logger.info(`🔍 [createDuelInternal] Atribuindo campos serializados ao duelData...`);
        logger.info(`  - player1FieldJson.deck.length: ${player1FieldJson?.deck?.length || 0}`);
        logger.info(`  - player2FieldJson.deck.length: ${player2FieldJson?.deck?.length || 0}`);

        (duelData as any).player1Field = player1FieldJson;
        (duelData as any).player2Field = player2FieldJson;

        // Verificar imediatamente após atribuir
        logger.info(`🔍 [createDuelInternal] Após atribuir:`);
        logger.info(`  - duelData.player1Field existe: ${!!(duelData as any).player1Field}`);
        logger.info(`  - duelData.player1Field.deck.length: ${(duelData as any).player1Field?.deck?.length || 0}`);
        logger.info(`  - duelData.player2Field existe: ${!!(duelData as any).player2Field}`);
        logger.info(`  - duelData.player2Field.deck.length: ${(duelData as any).player2Field?.deck?.length || 0}`);

        // Validação crítica antes de salvar
        if (!(duelData as any).player1Field || !(duelData as any).player1Field.deck || (duelData as any).player1Field.deck.length === 0) {
          logger.error(`❌ [createDuelInternal] ERRO: player1Field está vazio após atribuição!`);
          throw new Error(`player1Field está vazio após atribuição`);
        }
        if (!(duelData as any).player2Field || !(duelData as any).player2Field.deck || (duelData as any).player2Field.deck.length === 0) {
          logger.error(`❌ [createDuelInternal] ERRO: player2Field está vazio após atribuição!`);
          throw new Error(`player2Field está vazio após atribuição`);
        }

        // Verificação final antes de salvar
        logger.info(`🔍 [createDuelInternal] Verificação final ANTES do save:`);
        logger.info(`  - duelData.player1Field existe: ${!!(duelData as any).player1Field}`);
        logger.info(`  - duelData.player1Field.deck existe: ${!!(duelData as any).player1Field?.deck}`);
        logger.info(`  - duelData.player1Field.deck.length: ${(duelData as any).player1Field?.deck?.length || 0}`);
        logger.info(`  - duelData.player2Field existe: ${!!(duelData as any).player2Field}`);
        logger.info(`  - duelData.player2Field.deck existe: ${!!(duelData as any).player2Field?.deck}`);
        logger.info(`  - duelData.player2Field.deck.length: ${(duelData as any).player2Field?.deck?.length || 0}`);

        if (!(duelData as any).player1Field?.deck || (duelData as any).player1Field.deck.length === 0) {
          logger.error(`❌ [createDuelInternal] Validação final falhou: player1Field.deck está vazio`);
          throw new Error(`Validação final falhou: player1Field.deck está vazio`);
        }
        if (!(duelData as any).player2Field?.deck || (duelData as any).player2Field.deck.length === 0) {
          logger.error(`❌ [createDuelInternal] Validação final falhou: player2Field.deck está vazio`);
          throw new Error(`Validação final falhou: player2Field.deck está vazio`);
        }

        logger.info(`💾 [createDuelInternal] Chamando save() com ambos os campos preenchidos...`);

        // Garantir que os campos sejam objetos válidos antes de salvar
        // Usar uma abordagem mais explícita para garantir que o TypeORM salve corretamente
        // Garantir que origin está definido antes de salvar
        const finalOrigin = duelData.origin && Object.values(DuelOrigin).includes(duelData.origin)
          ? duelData.origin
          : DuelOrigin.OTHER;

        const duelToSave = {
          ...duelData,
          origin: finalOrigin, // Garantir que origin está explicitamente definido
          turnCounter: duelData.turnCounter || 1, // Garantir que turnCounter está definido
          player1Field: player1FieldJson,
          player2Field: player2FieldJson,
        };

        logger.info(`💾 [createDuelInternal] Origin no objeto a ser salvo: ${duelToSave.origin}`);

        // Log final antes do save
        logger.info(`💾 [createDuelInternal] Dados finais antes do save:`);
        logger.info(`  - player1Field type: ${typeof duelToSave.player1Field}, isObject: ${typeof duelToSave.player1Field === 'object'}`);
        logger.info(`  - player1Field.deck.length: ${duelToSave.player1Field?.deck?.length || 0}`);
        logger.info(`  - player2Field type: ${typeof duelToSave.player2Field}, isObject: ${typeof duelToSave.player2Field === 'object'}`);
        logger.info(`  - player2Field.deck.length: ${duelToSave.player2Field?.deck?.length || 0}`);

        savedDuel = await this.duelsRepository.save(duelToSave);

        // Verificar imediatamente após o save se os campos foram salvos
        logger.info(`🔍 [createDuelInternal] Verificando savedDuel após save:`);
        logger.info(`  - savedDuel.player1Field existe: ${!!(savedDuel as any).player1Field}`);
        logger.info(`  - savedDuel.player1Field.deck.length: ${(savedDuel as any).player1Field?.deck?.length || 0}`);
        logger.info(`  - savedDuel.player2Field existe: ${!!(savedDuel as any).player2Field}`);
        logger.info(`  - savedDuel.player2Field.deck.length: ${(savedDuel as any).player2Field?.deck?.length || 0}`);

        // Se algum campo não foi salvo corretamente, tentar salvar novamente explicitamente
        if (!(savedDuel as any).player1Field?.deck || (savedDuel as any).player1Field.deck.length === 0 ||
            !(savedDuel as any).player2Field?.deck || (savedDuel as any).player2Field.deck.length === 0) {
          logger.error(`❌ [createDuelInternal] Campos não foram salvos corretamente! Tentando salvar novamente...`);

          // Tentar atualizar explicitamente os campos
          await this.duelsRepository.update(savedDuel.id, {
            player1Field: player1FieldJson,
            player2Field: player2FieldJson,
          } as any);

          // Buscar novamente para verificar
          const retryDuel = await this.duelsRepository.findOne({ where: { id: savedDuel.id } });
          if (retryDuel) {
            logger.info(`✅ [createDuelInternal] Após retry - player1Field.deck.length: ${retryDuel.player1Field?.deck?.length || 0}`);
            logger.info(`✅ [createDuelInternal] Após retry - player2Field.deck.length: ${retryDuel.player2Field?.deck?.length || 0}`);
            savedDuel = retryDuel;
          }
        }
        logger.info(`✅ [createDuelInternal] Duelo salvo! ID: ${savedDuel.id} (tipo: ${typeof savedDuel.id})`);
        logger.info(`✅ [createDuelInternal] Duelo completo:`, {
          id: savedDuel.id,
          player1Id: savedDuel.player1Id,
          player2Id: savedDuel.player2Id,
          status: savedDuel.status,
          origin: savedDuel.origin,
        });

        logger.info(`💾 [createDuelInternal] Verificando se duelo foi salvo no banco...`);
        const verify = await this.duelsRepository.findOne({
          where: { id: savedDuel.id },
        });

        if (verify) {
          logger.info(`✅ [createDuelInternal] Duelo verificado no banco!`);
          logger.info(`📦 [createDuelInternal] player1Field no banco:`, {
            exists: !!verify.player1Field,
            deckLength: verify.player1Field?.deck?.length || 0,
            handLength: verify.player1Field?.hand?.length || 0,
          });
          logger.info(`📦 [createDuelInternal] player2Field no banco:`, {
            exists: !!verify.player2Field,
            deckLength: verify.player2Field?.deck?.length || 0,
            handLength: verify.player2Field?.hand?.length || 0,
            isArray: Array.isArray(verify.player2Field?.deck),
            hasHand: !!verify.player2Field?.hand,
            handIsArray: Array.isArray(verify.player2Field?.hand),
          });

          // Validar que ambos os campos foram salvos corretamente
          if (!verify.player1Field?.deck || verify.player1Field.deck.length === 0) {
            logger.error(`❌ [createDuelInternal] ERRO: player1Field não foi salvo corretamente no banco!`);
          }
          if (!verify.player2Field?.deck || verify.player2Field.deck.length === 0) {
            logger.error(`❌ [createDuelInternal] ERRO: player2Field não foi salvo corretamente no banco!`);
          }
        } else {
          logger.error(`❌ [createDuelInternal] Duelo NÃO encontrado no banco após save!`);
        }

        if (!verify) {
          logger.error(`❌ [createDuelInternal] Duelo ${savedDuel.id} NÃO encontrado no banco após save!`);
        } else {
          logger.info(`✅ [createDuelInternal] Duelo ${savedDuel.id} confirmado no banco!`);
          logger.info(`✅ [createDuelInternal] Duelo verificado:`, {
            id: verify.id,
            player1Id: verify.player1Id,
            player2Id: verify.player2Id,
            status: verify.status,
          });
        }
      } catch (saveError: any) {
        logger.error(`❌ [createDuelInternal] ==========================================`);
        logger.error(`❌ [createDuelInternal] ERRO ao salvar duelo!`);
        logger.error(`❌ [createDuelInternal] Código:`, saveError?.code);
        logger.error(`❌ [createDuelInternal] Mensagem:`, saveError?.message);
        logger.error(`❌ [createDuelInternal] Detalhes:`, saveError?.detail);
        logger.error(`❌ [createDuelInternal] Query:`, saveError?.query);
        logger.error(`❌ [createDuelInternal] Stack:`, saveError?.stack);
        logger.error(`❌ [createDuelInternal] ==========================================`);
        throw saveError;
      }

      // Não expor username para outros jogadores; só nickname
      (savedDuel as any).player1 = {
        id: player1.id,
        nickname: player1.nickname,
        clanTag: (player1 as any).clanTag,
        profileImage: normalizeProfileImageForClient((player1 as any).profileImage),
        equippedPlaymatId: (player1 as any).equippedPlaymatId,
        equippedPlaymatImage: (player1 as any).equippedPlaymatImage,
        equippedSkinId: (player1 as any).equippedSkinId,
        equippedSkinImage: (player1 as any).equippedSkinImage,
        equippedDeckId: (player1 as any).equippedDeckId,
        equippedDeckName: (player1 as any).equippedDeckName,
      };
      (savedDuel as any).player2 = {
        id: player2.id,
        nickname: player2.nickname,
        clanTag: (player2 as any).clanTag,
        profileImage: normalizeProfileImageForClient((player2 as any).profileImage),
        equippedPlaymatId: (player2 as any).equippedPlaymatId,
        equippedPlaymatImage: (player2 as any).equippedPlaymatImage,
        equippedSkinId: (player2 as any).equippedSkinId,
        equippedSkinImage: (player2 as any).equippedSkinImage,
        equippedDeckId: (player2 as any).equippedDeckId,
        equippedDeckName: (player2 as any).equippedDeckName,
      };
      let cachedDuel = { ...savedDuel } as any;

      // Usar os campos originais (não serializados) para o cache em memória
      // Mas garantir que estão corretos
      logger.info(`💾 [createDuelInternal] Preparando cache - P1Field: ${player1Field?.deck?.length || 0} cartas no deck, ${player1Field?.hand?.length || 0} na mão`);
      logger.info(`💾 [createDuelInternal] Preparando cache - P2Field: ${player2Field?.deck?.length || 0} cartas no deck, ${player2Field?.hand?.length || 0} na mão`);

      // Validar antes de adicionar ao cache
      if (!player1Field?.deck || player1Field.deck.length === 0) {
        logger.error(`❌ [createDuelInternal] ERRO: player1Field está vazio ao adicionar ao cache!`);
        throw new Error(`Erro ao preparar cache: player1Field está vazio`);
      }
      if (!player2Field?.deck || player2Field.deck.length === 0) {
        logger.error(`❌ [createDuelInternal] ERRO: player2Field está vazio ao adicionar ao cache!`);
        throw new Error(`Erro ao preparar cache: player2Field está vazio`);
      }

      cachedDuel.player1Field = player1Field;
      cachedDuel.player2Field = player2Field;

      const savedDuelIdStr = typeof savedDuel.id === 'string' ? savedDuel.id : String(savedDuel.id);
      logger.info(`💾 [createDuelInternal] Adicionando duelo ao cache em memória. ID: ${savedDuelIdStr}`);
          this.activeDuels.set(savedDuelIdStr, cachedDuel);
        this.activeDuelsCountCache = this.activeDuels.size;
        this.lastCountUpdate = Date.now();
      logger.info(`✅ [createDuelInternal] Duelo adicionado ao cache. Total de duelos ativos: ${this.activeDuels.size}`);

      // Regra: no primeiro turno só quem começou compra na DP e vai direto para MP2. Processar já na criação para evitar race ao dar join.
      const isFirstTurn = (cachedDuel.turnCounter ?? 1) === 1;
      const firstSeatCreate = this.getFirstTurnPlayerSeat(cachedDuel) ?? cachedDuel.currentTurn;
      const isFirstTurnOfStartingPlayer =
        !this.hasStarterFirstTurnRulesVoided(cachedDuel) && isFirstTurn && cachedDuel.currentTurn === firstSeatCreate;

      if (isFirstTurnOfStartingPlayer && cachedDuel.currentPhase === TurnPhase.DRAW) {
        logger.info(`🔄 [createDuelInternal] Processando DP na criação (primeiro turno → compra + MAIN2)...`);
        try {
          const updatedDuel = await this.processDrawPhase(savedDuelIdStr);
          if (updatedDuel) {
            logger.info(`✅ [createDuelInternal] DP processada - duelo em ${updatedDuel.currentPhase} (primeiro turno respeitado)`);
            this.activeDuels.set(savedDuelIdStr, updatedDuel as any);
            cachedDuel = updatedDuel as any;
          }
        } catch (error) {
          logger.error(`❌ [createDuelInternal] Erro ao processar DP na criação:`, error);
          // handleJoinDuelRoom ainda pode processar quando o jogador der join
        }
      }

      // Só o createDuel externo libera a reserva de jogadores e do par.
      logger.info(`✅ [createDuelInternal] Duelo criado e adicionado ao cache em memória`);
      logger.info(`✅ [createDuelInternal] ==========================================`);

      return cachedDuel;
    } catch (error) {
      logger.error(`❌ [createDuelInternal] Erro ao criar duelo interno (catch externo):`, error);
      logger.error(`❌ [createDuelInternal] Tipo:`, error?.constructor?.name);
      logger.error(`❌ [createDuelInternal] Mensagem:`, error instanceof Error ? error.message : String(error));
      logger.error(`❌ [createDuelInternal] Stack:`, error instanceof Error ? error.stack : 'N/A');

      // A reserva é liberada pelo finally de createDuel, inclusive em falhas.
      // Relançar para o cliente receber a mensagem real (ex.: deck vazio, deck não encontrado)
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Prepara deck a partir de um Anime Deck (Random Duel: Animes Deck).
   * Retorna o mesmo formato que preparePlayerDeck: { deck, hand, extraDeck }.
   */
  private async preparePlayerDeckFromAnimeDeck(animeDeckId: string): Promise<{ deck: any[]; hand: any[]; extraDeck: any[] }> {
    const animeDeck = await this.animeDecksService.findOne(animeDeckId);
    if (!animeDeck || !animeDeck.cards || animeDeck.cards.length === 0) {
      throw new Error(`Deck anime "${animeDeck?.name || animeDeckId}" não encontrado ou está vazio.`);
    }
    // Expandir cartas por quantity (mesmo formato que deck.cards no preparePlayerDeck)
    const expandedCards: any[] = [];
    for (const dc of animeDeck.cards) {
      for (let q = 0; q < (dc.quantity || 1); q++) {
        expandedCards.push({
          id: dc.id,
          cardId: dc.cardId,
          isExtraDeck: !!dc.isExtraDeck,
          card: dc.card,
        });
      }
    }
    const deck = { cards: expandedCards };
    return this.preparePlayerDeckFromCards(deck, `Anime Deck ${animeDeck.name}`);
  }

  /**
   * Lógica comum de extração, embaralhamento e mão a partir de um objeto deck com .cards.
   * Usado por preparePlayerDeck (deck do usuário) e preparePlayerDeckFromAnimeDeck.
   */
  private preparePlayerDeckFromCards(
    deck: { cards: any[] },
    deckLabel: string,
  ): { deck: any[]; hand: any[]; extraDeck: any[] } {
    const mainDeckCards = deck.cards.filter((dc: any) => !dc.isExtraDeck || dc.isExtraDeck === false);
    const extraDeckCards = deck.cards.filter((dc: any) => dc.isExtraDeck === true);

    if (mainDeckCards.length < 40) {
      throw new Error(`Deck principal "${deckLabel}" tem apenas ${mainDeckCards.length} cartas (mínimo: 40).`);
    }

    const extractedCards = mainDeckCards
      .map((deckCard: any) => {
        if (!deckCard.card) return null;
        const card = deckCard.card;
        const cardData = { ...card };
        cardData.cardId = deckCard.cardId || card.id;
        cardData.idCarta = card.idCarta || card.id;
        cardData.cardType = card.cardType || card.type;
        const isMonster = card.type === 'Monster' || card.type === 'MONSTER' || card.cardType === 'Monster';
        cardData.attribute = isMonster ? (card.attribute || cardData.attribute || null) : null;
        cardData.race = isMonster ? (card.race || cardData.race || null) : null;
        cardData.cardImage = card.cardImage || null;
        return cardData;
      })
      .filter((c: any) => c != null);

    const extractedExtraDeck = extraDeckCards
      .map((deckCard: any) => {
        if (!deckCard.card) return null;
        const card = deckCard.card;
        const cardData = { ...card };
        cardData.cardId = deckCard.cardId || card.id;
        cardData.idCarta = card.idCarta || card.id;
        cardData.cardType = card.cardType || card.type;
        const isMonster = card.type === 'Monster' || card.type === 'MONSTER' || card.cardType === 'Monster';
        cardData.attribute = isMonster ? (card.attribute || cardData.attribute || null) : null;
        cardData.race = isMonster ? (card.race || cardData.race || null) : null;
        cardData.cardImage = card.cardImage || null;
        return cardData;
      })
      .filter((c: any) => c != null);

    extractedExtraDeck.forEach((card) => this.ensureCardInstanceId(card));
    const shuffledDeck = this.shuffleDeck(extractedCards);
    const hand = shuffledDeck.splice(0, 5);
    hand.forEach((card) => this.ensureCardInstanceId(card));
    return { deck: shuffledDeck, hand, extraDeck: extractedExtraDeck };
  }

  private async preparePlayerDeck(userId: number, deckName: string, deckId?: string | null): Promise<{deck: any[], hand: any[], extraDeck: any[]}> {
    try {
      const activeDuels = this.getActiveDuelsCount();
      const timeout = activeDuels > 0 ? 5000 : 10000;
      const byId = deckId && String(deckId).trim() !== '';

      logger.info(`🔍 [preparePlayerDeck] Buscando deck para usuário ${userId} ${byId ? `id "${deckId}"` : `nome "${deckName}"`} (timeout: ${timeout}ms)...`);

      const deck = await Promise.race([
        byId
          ? this.decksService.getDeckByIdForUser(userId, deckId!)
          : this.decksService.getCurrentDeck(userId, deckName),
        new Promise<null>((_, reject) =>
          setTimeout(() => {
            logger.warn(`⏱️ [preparePlayerDeck] Timeout ao buscar deck para usuário ${userId} após ${timeout}ms`);
            reject(new Error('Timeout'));
          }, timeout)
        )
      ]).catch((error) => {
        logger.error(`❌ [preparePlayerDeck] Erro ao buscar deck para usuário ${userId}:`, error);
        return null;
      });

      if (!deck) {
        logger.error(`❌ [preparePlayerDeck] Deck não encontrado ou timeout para usuário ${userId} ${byId ? `id "${deckId}"` : `nome "${deckName}"`}`);
        throw new Error(`Deck não encontrado para o usuário. Verifique se o deck existe e está equipado.`);
      }

      logger.info(`🔍 [preparePlayerDeck] Estrutura do deck recebido:`, {
        hasCards: !!deck.cards,
        cardsIsArray: Array.isArray(deck.cards),
        cardsLength: deck.cards?.length || 0,
        deckKeys: Object.keys(deck || {}),
      });

      // CRÍTICO: Verificar se as cartas têm a relação 'card' carregada
      if (deck.cards && deck.cards.length > 0) {
        const cardsWithCard = deck.cards.filter((dc: any) => dc.card).length;
        const cardsWithoutCard = deck.cards.filter((dc: any) => !dc.card).length;
        logger.info(`🔍 [preparePlayerDeck] Cartas com relação 'card': ${cardsWithCard}, sem relação: ${cardsWithoutCard}`);

        if (cardsWithoutCard > 0) {
          logger.error(`❌ [preparePlayerDeck] PROBLEMA: ${cardsWithoutCard} cartas não têm relação 'card' carregada!`);
          // Logar detalhes das primeiras cartas sem relação
          deck.cards.slice(0, 3).forEach((dc: any, index: number) => {
            if (!dc.card) {
              logger.error(`❌ [preparePlayerDeck] Carta ${index} sem relação:`, {
                deckCardId: dc.id,
                cardId: dc.cardId,
                hasCard: !!dc.card,
                deckCardKeys: Object.keys(dc || {}),
              });
            }
          });
        }
      }

      // Debug: Verificar se as cartas têm descrição
      if (deck.cards && deck.cards.length > 0) {
        const firstDeckCard = deck.cards[0];
        const firstCard = firstDeckCard?.card || firstDeckCard;
        logger.info(`🔍 [preparePlayerDeck] Primeira carta do deck:`, {
          deckCardId: firstDeckCard?.id,
          cardId: firstDeckCard?.cardId,
          hasCardRelation: !!firstDeckCard?.card,
          name: firstCard?.name,
          hasDescription: !!firstCard?.description,
          description: firstCard?.description ? firstCard.description.substring(0, 50) + '...' : 'N/A',
          cardKeys: firstCard ? Object.keys(firstCard) : [],
          deckCardKeys: firstDeckCard ? Object.keys(firstDeckCard) : [],
        });
      }

      if (!deck.cards || !Array.isArray(deck.cards) || deck.cards.length === 0) {
        logger.error(`❌ [preparePlayerDeck] Deck "${deckName}" sem cartas para usuário ${userId}`);
        throw new Error(`Deck "${deckName}" está vazio. Por favor, adicione cartas ao deck antes de entrar no duelo.`);
      }

      // Separar cartas do deck principal das do extra deck
      const mainDeckCards = deck.cards.filter((deckCard: any) => !deckCard.isExtraDeck || deckCard.isExtraDeck === false);
      const extraDeckCards = deck.cards.filter((deckCard: any) => deckCard.isExtraDeck === true);

      logger.info(`🔍 [preparePlayerDeck] Total de cartas: ${deck.cards.length} (Principal: ${mainDeckCards.length}, Extra Deck: ${extraDeckCards.length})`);

      // Validar tamanho mínimo do deck principal (40 cartas) - extra deck não conta
      if (mainDeckCards.length < 40) {
        logger.error(`❌ [preparePlayerDeck] Deck principal "${deckName}" tem apenas ${mainDeckCards.length} cartas (mínimo: 40)`);
        throw new Error(`Deck principal "${deckName}" tem apenas ${mainDeckCards.length} cartas. O mínimo é 40 cartas.`);
      }

      // Verificar estrutura das cartas
      if (mainDeckCards.length > 0) {
        logger.info(`🔍 [preparePlayerDeck] Primeira carta do deck principal:`, {
          id: mainDeckCards[0].id,
          cardId: mainDeckCards[0].cardId,
          hasCard: !!mainDeckCards[0].card,
          isExtraDeck: mainDeckCards[0].isExtraDeck,
          card: mainDeckCards[0].card ? {
            id: mainDeckCards[0].card.id,
            name: mainDeckCards[0].card.name,
            type: mainDeckCards[0].card.type,
          } : null,
        });
      }

      // Extrair as cartas do deck principal corretamente (deck.cards é um array de DeckCard, precisamos do card dentro)
      const extractedCards = mainDeckCards.map((deckCard: any, index: number) => {
        // CRÍTICO: Verificar se tem a relação 'card' carregada
        if (!deckCard.card) {
          logger.error(`❌ [preparePlayerDeck] Carta ${index} do deck principal NÃO tem relação 'card'!`, {
            deckCardId: deckCard.id,
            cardId: deckCard.cardId,
            deckCardKeys: Object.keys(deckCard || {}),
          });
          // Tentar buscar a carta do banco se não estiver carregada
          // Por enquanto, retornar null para filtrar depois
          return null;
        }

        const card = deckCard.card;
        // Usar spread operator para pegar TODOS os campos, depois remover apenas cardImage
        const cardData = { ...card };

        // Garantir campos críticos
        cardData.cardId = deckCard.cardId || card.id;
        // CRÍTICO: idCarta é necessário para CardImage - sempre usar idCarta se existir
        cardData.idCarta = card.idCarta || null;
        if (!cardData.idCarta) {
          logger.warn(`⚠️ [preparePlayerDeck] Carta "${card.name}" não tem idCarta! Usando id como fallback.`);
          cardData.idCarta = card.id;
        }
        cardData.cardType = card.cardType || card.type; // Garantir compatibilidade
        // CRÍTICO: Garantir que attribute e race sejam preservados APENAS para monstros
        const isMonster = card.type === 'Monster' || card.type === 'MONSTER' || card.cardType === 'Monster';
        cardData.attribute = isMonster ? (card.attribute || cardData.attribute || null) : null;
        cardData.race = isMonster ? (card.race || cardData.race || null) : null; // race só para monstros
        // instanceId será gerado no shuffleDeck para cada instância única

        // CRÍTICO: Preservar cardImage EXATAMENTE como vem do banco (igual ao editar deck)
        // O cardImage será usado pelo componente CardImage que já sabe como buscar a imagem correta
        cardData.cardImage = card.cardImage || null;

        // Log de debug para primeira carta
        if (index === 0) {
          logger.info(`🔍 [preparePlayerDeck] Primeira carta processada:`, {
            name: cardData.name,
            idCarta: cardData.idCarta,
            hasCardImage: !!cardData.cardImage,
            cardImage: cardData.cardImage,
            hasDescription: !!cardData.description,
            descriptionPreview: cardData.description ? cardData.description.substring(0, 50) + '...' : 'N/A',
            keys: Object.keys(cardData),
          });
        }

        return cardData;
      }).filter((card: any) => card !== null && card !== undefined);

      // CRÍTICO: Verificar se alguma carta foi perdida
      if (extractedCards.length < mainDeckCards.length) {
        logger.error(`❌ [preparePlayerDeck] ATENÇÃO: ${mainDeckCards.length - extractedCards.length} cartas foram perdidas durante extração!`);
        logger.error(`❌ [preparePlayerDeck] Total esperado: ${mainDeckCards.length}, Total extraído: ${extractedCards.length}`);
      }

      logger.info(`🔍 [preparePlayerDeck] Cartas do deck principal extraídas: ${extractedCards.length} cartas`);
      if (extractedCards.length > 0) {
        logger.info(`🔍 [preparePlayerDeck] Primeira carta extraída do deck principal:`, {
          id: extractedCards[0].id,
          idCarta: extractedCards[0].idCarta,
          cardId: extractedCards[0].cardId,
          name: extractedCards[0].name,
          type: extractedCards[0].type,
          hasCardImage: !!extractedCards[0].cardImage,
          cardImage: extractedCards[0].cardImage,
        });
      }

      // Extrair cartas do extra deck
      const extractedExtraDeck = extraDeckCards.map((deckCard: any) => {
        if (deckCard.card) {
          const card = deckCard.card;
          const cardData = { ...card };

          // Garantir campos críticos
          cardData.cardId = deckCard.cardId || card.id;
          // CRÍTICO: idCarta é necessário para CardImage - sempre usar idCarta se existir
          cardData.idCarta = card.idCarta || null;
          if (!cardData.idCarta) {
            logger.warn(`⚠️ [preparePlayerDeck] Carta do Extra Deck "${card.name}" não tem idCarta! Usando id como fallback.`);
            cardData.idCarta = card.id;
          }
          cardData.cardType = card.cardType || card.type;
          // CRÍTICO: Garantir que attribute e race sejam preservados APENAS para monstros
          const isMonsterExtra = card.type === 'Monster' || card.type === 'MONSTER' || card.cardType === 'Monster';
          cardData.attribute = isMonsterExtra ? (card.attribute || cardData.attribute || null) : null;
          cardData.race = isMonsterExtra ? (card.race || cardData.race || null) : null; // race só para monstros

          // CRÍTICO: Preservar cardImage (caminho da imagem) para o frontend conseguir carregar
          if (card.cardImage) {
            cardData.cardImage = card.cardImage;
          }

          return cardData;
        } else {
          // Se não tem card.card, usar deckCard diretamente mas garantir idCarta e cardImage
          return {
            ...deckCard,
            idCarta: deckCard.idCarta || deckCard.id || deckCard.cardId,
            cardImage: deckCard.cardImage || null, // Preservar cardImage se existir
          };
        }
      }).filter((card: any) => card !== null && card !== undefined);

      // Garantir instanceId para cada carta do extra deck (não embaralhar, manter ordem)
      extractedExtraDeck.forEach(card => this.ensureCardInstanceId(card));

      logger.info(`🔍 [preparePlayerDeck] Cartas do extra deck extraídas: ${extractedExtraDeck.length} cartas`);

      // Embaralhar apenas o deck principal
      const shuffledDeck = this.shuffleDeck(extractedCards);
      logger.info(`🔍 [preparePlayerDeck] Deck principal embaralhado: ${shuffledDeck.length} cartas`);

      // Distribuir 5 cartas para a mão (apenas do deck principal)
      const hand = shuffledDeck.splice(0, 5);
      // Garantir que as cartas da mão também tenham instanceId (já devem ter do shuffle, mas garantir)
      hand.forEach(card => this.ensureCardInstanceId(card));

      logger.info(`✅ [preparePlayerDeck] Deck preparado para usuário ${userId}: ${shuffledDeck.length} cartas no deck principal, ${hand.length} na mão, ${extractedExtraDeck.length} no extra deck`);
      logger.info(`✅ [preparePlayerDeck] Primeira carta da mão:`, hand[0] ? {
        id: hand[0].id,
        idCarta: hand[0].idCarta,
        cardId: hand[0].cardId,
        name: hand[0].name,
        type: hand[0].type,
      } : null);

      return { deck: shuffledDeck, hand, extraDeck: extractedExtraDeck };
    } catch (error) {
      logger.error(`❌ [preparePlayerDeck] Erro ao preparar deck do usuário ${userId}:`, error);
      // Relançar o erro para que seja tratado no nível superior
      throw error;
    }
  }

  /**
   * Gera um ID único para cada instância de carta no duelo
   * Isso permite distinguir múltiplas cópias da mesma carta
   */
  private generateCardInstanceId(): string {
    return `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Adiciona um instanceId único a uma carta se ela ainda não tiver
   * Isso garante que cada carta no duelo tenha uma identidade única
   */
  private ensureCardInstanceId(card: any): any {
    if (!card) return card;
    if (!card.instanceId) {
      card.instanceId = this.generateCardInstanceId();
    }
    return card;
  }

  private shuffleDeck(deck: any[]): any[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Adicionar instanceId único para cada carta após embaralhar
    shuffled.forEach(card => this.ensureCardInstanceId(card));
    return shuffled;
  }

  private createEmptyField(): any {
    return {
      deck: [],
      hand: [],
      extraDeck: [], // Extra Deck separado do deck principal
      monsters: [null, null, null, null, null], // Array de 5 elementos inicializado com null
      spellTrap: [null, null, null, null, null], // Array de 5 elementos inicializado com null
      graveyard: [],
      normalSummonUsed: false,
      bonusNormalSummonsRemaining: 0,
      positionChangedThisTurn: false,
    };
  }

  private compactCard(card: any): any {
    if (!card) {
      logger.warn(`⚠️ [compactCard] Carta é null/undefined`);
      return null;
    }

    // Se a carta tem uma propriedade 'card' (relação do TypeORM), usar ela
    const actualCard = card.card || card;

    // CRÍTICO: Preservar cardImage EXATAMENTE como vem (igual ao editar deck)
    // Prioridade: card.card?.cardImage -> card.cardImage -> actualCard.cardImage
    // O componente CardImage já sabe como buscar a imagem correta baseado no cardImage
    const preservedCardImage = card.card?.cardImage || card.cardImage || actualCard.cardImage || null;

    const compacted: any = {
      id: actualCard.id || card.id || card.cardId || null,
      idCarta: actualCard.idCarta || card.idCarta || actualCard.id || card.id || null, // CRÍTICO: idCarta necessário para CardImage
      cardId: actualCard.id || card.id || card.cardId || null,
      instanceId: card.instanceId || actualCard.instanceId || null, // CRÍTICO: instanceId único para distinguir múltiplas cópias da mesma carta
      name: actualCard.name || card.name || 'Unknown',
      type: actualCard.type || card.type || 'MONSTER',
      cardType: actualCard.cardType || card.cardType || actualCard.type || card.type || 'MONSTER',
      atk: actualCard.atk || card.atk || 0,
      def: actualCard.def || card.def || 0,
      level: actualCard.level || card.level || 0,
      // attribute e race só para monstros
      attribute: (actualCard.type === 'Monster' || card.type === 'Monster' || actualCard.type === 'MONSTER' || card.type === 'MONSTER')
        ? (actualCard.attribute || card.attribute || null)
        : null,
      race: (actualCard.type === 'Monster' || card.type === 'Monster' || actualCard.type === 'MONSTER' || card.type === 'MONSTER')
        ? (actualCard.race || card.race || null)
        : null, // race só para monstros
      spellType: actualCard.spellType || card.spellType || null,
      trapType: actualCard.trapType || card.trapType || null,
      monsterType: actualCard.monsterType || card.monsterType || actualCard.monster_type || card.monster_type || null,
      // Preservar posição (attack, defense, set, face-up) - sempre incluir se existir
      position: card.position !== undefined ? card.position : (actualCard.position !== undefined ? actualCard.position : undefined),
      // CRÍTICO: Preservar cardImage EXATAMENTE como vem do banco (igual ao editar deck)
      cardImage: preservedCardImage,
    };

    // Preservar bônus de equipamento APENAS se o monstro ainda tem equipamentos (evita ATK fantasma após equip/monstro destruído)
    const isMonster = (actualCard.type === 'Monster' || card.type === 'Monster' || actualCard.type === 'MONSTER' || card.type === 'MONSTER');
    if (isMonster) {
      const hasEquips = card.equippedCards && Array.isArray(card.equippedCards) && card.equippedCards.length > 0;
      if (hasEquips) {
        if (card.equipmentBonusAtk !== undefined && card.equipmentBonusAtk !== null) {
          compacted.equipmentBonusAtk = card.equipmentBonusAtk;
        }
        if (card.equipmentBonusDef !== undefined && card.equipmentBonusDef !== null) {
          compacted.equipmentBonusDef = card.equipmentBonusDef;
        }
        compacted.equippedCards = [...card.equippedCards];
      }
      // Se não tem equips, não copiar bônus/equippedCards (monstro revivido ou equip destruído = ATK base)
    }

    // CRÍTICO: Preservar equippedToMonsterZoneIndex em spell/trap (ex: Premature Burial) para que ao destruir a carta o monstro equipado também seja destruído
    if (card.equippedToMonsterZoneIndex !== undefined && card.equippedToMonsterZoneIndex !== null) {
      compacted.equippedToMonsterZoneIndex = card.equippedToMonsterZoneIndex;
    }
    // CRÍTICO: Preservar dados de ativação da Swords of Revealing Light (destruir na Fase Final do 3º turno do oponente)
    if (card.activationTurnCounter !== undefined && card.activationTurnCounter !== null) {
      compacted.activationTurnCounter = card.activationTurnCounter;
    }
    if (card.activationTurn !== undefined && card.activationTurn !== null) {
      compacted.activationTurn = card.activationTurn;
    }
    if (card.activatedByPlayer1 !== undefined && card.activatedByPlayer1 !== null) {
      compacted.activatedByPlayer1 = card.activatedByPlayer1;
    }
    if (card.trapSetTurnCounter !== undefined && card.trapSetTurnCounter !== null) {
      compacted.trapSetTurnCounter = card.trapSetTurnCounter;
    }

    // CRÍTICO: Garantir que idCarta existe ANTES de remover campos nulos (necessário para CardImage)
    if (!compacted.idCarta || compacted.idCarta === null || compacted.idCarta === undefined) {
      if (compacted.id) {
        compacted.idCarta = compacted.id;
      } else if (compacted.cardId) {
        compacted.idCarta = compacted.cardId;
      } else if (actualCard.idCarta) {
        compacted.idCarta = actualCard.idCarta;
      } else if (card.idCarta) {
        compacted.idCarta = card.idCarta;
      }
    }

    // Remover campos nulos ou indefinidos (exceto idCarta, position e cardImage que devem ser preservados)
    for (const key in compacted) {
      if (compacted.hasOwnProperty(key) && (compacted[key] === null || compacted[key] === undefined)) {
        // NÃO remover position, idCarta nem cardImage mesmo se for null/undefined
        // cardImage pode ser null mas ainda assim é necessário para o frontend saber que não há imagem
        if (key !== 'position' && key !== 'idCarta' && key !== 'cardImage') {
          delete compacted[key];
        }
      }
    }

    // Garantir que position seja preservada se existir na carta original
    if (card.position !== undefined) {
      compacted.position = card.position;
    } else if (actualCard.position !== undefined) {
      compacted.position = actualCard.position;
    }

    // Garantir que idCarta não seja removido (mesmo que seja null, manter para debug)
    if (!compacted.hasOwnProperty('idCarta')) {
      // Se foi removido acidentalmente, tentar recuperar
      const recoveredIdCarta = actualCard.idCarta || card.idCarta || actualCard.id || card.id || actualCard.cardId || card.cardId;
      if (recoveredIdCarta) {
        compacted.idCarta = recoveredIdCarta;
      }
    }

    // Garantir que cardImage seja preservado se existir na carta original
    // CRÍTICO: Verificar múltiplas fontes para garantir que cardImage seja preservado
    if (!compacted.cardImage || compacted.cardImage === null) {
      // Tentar recuperar de múltiplas fontes
      const recoveredCardImage = card.card?.cardImage || card.cardImage || actualCard.cardImage || null;
      if (recoveredCardImage) {
        compacted.cardImage = recoveredCardImage;
        // Log apenas se recuperou (para não poluir logs)
        if (compacted.name) {
          const logKey = `recoveredCardImage_${compacted.name}`;
          if (!this.cardImageLogCache) {
            this.cardImageLogCache = new Set();
          }
          if (!this.cardImageLogCache.has(logKey)) {
            logger.debug(`✅ [compactCard] cardImage RECUPERADO para "${compacted.name}": ${recoveredCardImage}`);
            this.cardImageLogCache.add(logKey);
          }
        }
      }
    }

    // Debug: Logar se cardImage foi preservado (apenas para primeira carta para não poluir logs)
    if (compacted.cardImage && compacted.name) {
      // Logar apenas uma vez por tipo de carta para não poluir logs
      const logKey = `cardImage_${compacted.name}`;
      if (!this.cardImageLogCache) {
        this.cardImageLogCache = new Set();
      }
      if (!this.cardImageLogCache.has(logKey)) {
        logger.debug(`✅ [compactCard] cardImage preservado para "${compacted.name}": ${compacted.cardImage}`);
        logger.debug(`✅ [compactCard] idCarta: ${compacted.idCarta}, cardImage: ${compacted.cardImage}, temCard.card: ${!!card.card}`);
        this.cardImageLogCache.add(logKey);
      }
    } else if (compacted.name && !compacted.cardImage) {
      // AVISO: Se não tem cardImage mas tem nome, logar para debug
      const logKey = `noCardImage_${compacted.name}`;
      if (!this.cardImageLogCache) {
        this.cardImageLogCache = new Set();
      }
      if (!this.cardImageLogCache.has(logKey)) {
        logger.warn(`⚠️ [compactCard] "${compacted.name}" NÃO tem cardImage! idCarta: ${compacted.idCarta}`);
        logger.warn(`⚠️ [compactCard] Fontes verificadas: card.card?.cardImage=${card.card?.cardImage}, card.cardImage=${card.cardImage}, actualCard.cardImage=${actualCard.cardImage}`);
        this.cardImageLogCache.add(logKey);
      }
    }

    return compacted;
  }

  /**
   * Define uma escolha pendente no duelo
   * IMPORTANTE: Apenas CONFISCATION, GRACEFUL_CHARITY e FORCEFUL_SENTRY criam pendingChoice persistente
   */
  async setPendingChoice(duelId: string | number, choice: {
    type: 'CONFISCATION' | 'GRACEFUL_CHARITY' | 'FORCEFUL_SENTRY' | 'BRAIN_CONTROL' | 'SOUL_TAKER' | 'UNITED_WE_STAND' | 'MAGE_POWER' | 'AUTONOMOUS_ACTION_UNIT' | 'MONSTER_REBORN' | 'CHANGE_OF_HEART' | 'CYBER_STEIN' | 'MYSTICAL_SPACE_TYPHOON' | 'SNOWMAN_EATER' | 'CHAOS_SORCERER' | 'DARK_ARMED_DRAGON' | 'RED_EYES_DARKNESS_METAL_DRAGON' | 'REINFORCEMENT_OF_THE_ARMY' | 'LAST_WILL' | 'MONSTER_REINCARNATION' | 'PREMATURE_BURIAL' | 'LIGHTNING_STORM' | 'PLAYER_TARGET_SPELL' | 'DARK_MAGICIAN_OF_CHAOS' | 'MAGICIAN_S_ROD_SEARCH' | 'MAGICIAN_S_ROD_GY' | 'MAGICIAN_S_SALVATION_ETERNAL_SOUL' | 'MAGICIAN_S_SALVATION_PAIR' | 'ETERNAL_SOUL_EFFECT' | 'SKILLED_DARK_MAGICIAN' | 'ARCHFIEND_OF_GILFER' | 'DUST_TORNADO';
    userId: number;
    turnWhenStarted: number;
    phaseWhenStarted: string;
    data: any;
  }): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    await this.updateDuelInDatabase(duelIdStr, {
      pendingChoice: choice
    } as any);

    const cached = this.activeDuels.get(duelIdStr);
    if (cached) {
      (cached as any).pendingChoice = JSON.parse(JSON.stringify(choice));
    } else {
      const duel = await this.findDuelByIdFromDatabase(duelIdStr);
      if (duel) {
        (duel as any).pendingChoice = choice;
        this.activeDuels.set(duelIdStr, duel);
      }
    }
  }

  /**
   * Limpa a escolha pendente do duelo
   */
  async clearPendingChoice(duelId: string | number, restoreCardToSet: boolean = true): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Buscar duelo para verificar se há pendingChoice que precisa restaurar carta
    const duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    const clearedPendingType = (duel as any)?.pendingChoice?.type as string | undefined;
    if (duel && restoreCardToSet && (duel as any).pendingChoice) {
      const pendingChoice = (duel as any).pendingChoice;

      // Verificar se é Change Of Heart ou Brain Control que estava no campo em "set"
      const isChangeOfHeartOrBrainControl = pendingChoice.type === 'CHANGE_OF_HEART' || pendingChoice.type === 'BRAIN_CONTROL';

      if (isChangeOfHeartOrBrainControl && pendingChoice.data && pendingChoice.data.cardWasOnField === true) {
        const zoneIndex = pendingChoice.data.zoneIndex;
        const originalPosition = pendingChoice.data.originalPosition || 'set';

        if (zoneIndex !== null && zoneIndex !== undefined) {
          const isPlayer1 = Number(duel.player1Id) === Number(pendingChoice.userId);
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

          // Verificar se a carta está no campo e restaurar para "set"
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const cardOnField = playerField.spellTrap[zoneIndex];
            // Restaurar para a posição original (geralmente "set")
            cardOnField.position = originalPosition;
            logger.info(`🔄 [clearPendingChoice] Restaurando carta ${cardOnField.name || cardOnField.cardName} para "${originalPosition}" no campo`);

            // Atualizar no banco antes de limpar pendingChoice
            await this.updateDuelInDatabase(duelIdStr, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          }
        }
      }

      // Verificar se é Monster Reincarnation e se há carta descartada que precisa ser devolvida à mão
      const isMonsterReincarnation = pendingChoice.type === 'MONSTER_REINCARNATION';
      if (isMonsterReincarnation && pendingChoice.data && pendingChoice.data.discardedCard) {
        const discardedCard = pendingChoice.data.discardedCard;
        const isPlayer1 = Number(duel.player1Id) === Number(pendingChoice.userId);
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

        if (playerField) {
          // Verificar se a carta não está na mão (foi removida mas ainda não foi para o cemitério)
          // Usar múltiplos critérios de comparação para garantir que encontramos a carta
          const cardInHand = playerField.hand?.some((c: any) => {
            if (!c) return false;
            // Comparar por instanceId se ambos tiverem
            if (c.instanceId && discardedCard.instanceId) {
              return c.instanceId === discardedCard.instanceId;
            }
            // Fallback: comparar por idCarta/id/cardId
            const cId = c.idCarta || c.id || c.cardId;
            const discardedId = discardedCard.idCarta || discardedCard.id || discardedCard.cardId;
            if (cId && discardedId) {
              return String(cId) === String(discardedId);
            }
            return false;
          });

          if (!cardInHand) {
            // Devolver a carta descartada à mão
            if (!playerField.hand) {
              playerField.hand = [];
            }
            playerField.hand.push(discardedCard);
            logger.info(`🔄 [clearPendingChoice] Devolvendo carta descartada à mão: ${discardedCard.name || discardedCard.cardName} (instanceId: ${discardedCard.instanceId})`);

            // Atualizar no banco antes de limpar pendingChoice
            await this.updateDuelInDatabase(duelIdStr, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
          } else {
            logger.info(`ℹ️ [clearPendingChoice] Carta descartada já está na mão, não precisa devolver`);
          }
        }
      }
    }

    // Limpar pendingChoice
    await this.updateDuelInDatabase(duelIdStr, {
      pendingChoice: null
    } as any);

    const cachedAfterClear = this.activeDuels.get(duelIdStr);
    if (cachedAfterClear) {
      (cachedAfterClear as any).pendingChoice = null;
      logger.info(`✅ [clearPendingChoice] PendingChoice limpo e cache atualizado para duelo ${duelIdStr}`);
    } else {
      const updatedDuel = await this.findDuelByIdFromDatabase(duelIdStr, true);
      if (updatedDuel) {
        (updatedDuel as any).pendingChoice = null;
        this.activeDuels.set(duelIdStr, updatedDuel);
        logger.info(`✅ [clearPendingChoice] PendingChoice limpo e cache atualizado para duelo ${duelIdStr}`);
      }
    }

    // Após resolver outra carta, oferecer Magician's Rod do GY se estava agendado
    if (
      clearedPendingType &&
      clearedPendingType !== 'MAGICIAN_S_ROD_SEARCH' &&
      clearedPendingType !== 'MAGICIAN_S_ROD_GY' &&
      clearedPendingType !== 'MAGICIAN_S_SALVATION_ETERNAL_SOUL' &&
      clearedPendingType !== 'MAGICIAN_S_SALVATION_PAIR' &&
      clearedPendingType !== 'ETERNAL_SOUL_EFFECT' &&
      clearedPendingType !== 'SKILLED_DARK_MAGICIAN'
    ) {
      await this.flushMagiciansRodGyCheck(duelIdStr);
    }
  }

  /**
   * Buscar histórico de duelos de um usuário
   */
  async getDuelHistory(userId: number, limit: number = 50, offset: number = 0): Promise<{ history: any[]; total: number }> {
    logger.info(`🔍 [getDuelHistory] Buscando histórico para userId: ${userId}, limit: ${limit}, offset: ${offset}`);

    try {
      // Primeiro, verificar se há dados na tabela usando query direta
      const countQuery = await this.duelsRepository.query(`
        SELECT COUNT(*) as count
        FROM duel_history
        WHERE "playerId" = $1
      `, [userId]);
      const totalInTable = parseInt(countQuery[0]?.count || '0', 10);
      logger.info(`🔍 [getDuelHistory] Total de registros na tabela para userId ${userId}: ${totalInTable}`);

      // Tentar buscar com relação primeiro, se falhar, buscar sem relação
      let history: DuelHistory[];
      let total: number;

      try {
        [history, total] = await this.duelHistoryRepository.findAndCount({
          where: { playerId: userId },
          order: { finishedAt: 'DESC' },
          take: limit,
          skip: offset,
          relations: ['opponent'], // Incluir informações do oponente
        });
        logger.info(`✅ [getDuelHistory] Encontrados ${history.length} duelos no histórico (total: ${total}) com relação`);
        logger.info(`🔍 [getDuelHistory] Primeiro registro (se houver):`, history.length > 0 ? JSON.stringify(history[0], null, 2) : 'Nenhum registro');
      } catch (relationError: any) {
        logger.warn(`⚠️ [getDuelHistory] Erro ao buscar com relação, tentando sem relação:`, relationError.message);
        logger.warn(`⚠️ [getDuelHistory] Stack do erro:`, relationError.stack);
        // Se falhar com relação, buscar sem relação
        [history, total] = await this.duelHistoryRepository.findAndCount({
          where: { playerId: userId },
          order: { finishedAt: 'DESC' },
          take: limit,
          skip: offset,
        });
        logger.info(`✅ [getDuelHistory] Encontrados ${history.length} duelos no histórico (total: ${total}) sem relação`);
        logger.info(`🔍 [getDuelHistory] Primeiro registro (se houver):`, history.length > 0 ? JSON.stringify(history[0], null, 2) : 'Nenhum registro');
      }

      // Se ainda não encontrou nada, tentar query direta como último recurso
      if (history.length === 0 && totalInTable > 0) {
        logger.info(`⚠️ [getDuelHistory] TypeORM não retornou dados mas há ${totalInTable} registros na tabela. Tentando query direta...`);
        const directQuery = await this.duelsRepository.query(`
          SELECT *
          FROM duel_history
          WHERE "playerId" = $1
          ORDER BY "finishedAt" DESC
          LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);
        logger.info(`🔍 [getDuelHistory] Query direta retornou ${directQuery.length} registros`);

        if (directQuery.length > 0) {
          // Converter resultados da query direta para o formato esperado
          history = directQuery.map((row: any) => ({
            id: row.id,
            playerId: row.playerId,
            opponentId: row.opponentId,
            opponentNickname: row.opponentNickname,
            opponentUsername: row.opponentUsername,
            opponentClanTag: row.opponentClanTag,
            result: row.result,
            origin: row.origin,
            playerLifePoints: row.playerLifePoints,
            opponentLifePoints: row.opponentLifePoints,
            scoreEarned: parseFloat(row.scoreEarned || '0'),
            turns: row.turns,
            duration: row.duration,
            originalDuelId: row.originalDuelId,
            finishedAt: row.finishedAt,
          })) as any;
          total = totalInTable;
          logger.info(`✅ [getDuelHistory] Convertidos ${history.length} registros da query direta`);
        }
      }

      // Formatar histórico para incluir informações do oponente
      const formattedHistory = history.map((h) => {
        try {
          const opponent = (h as any).opponent || null;
          return {
            id: h.id,
            playerId: h.playerId,
            opponentId: h.opponentId,
            opponent: opponent ? {
              id: opponent.id,
              nickname: opponent.nickname,
              clanTag: opponent.clanTag,
              profileImage: normalizeProfileImageForClient(opponent.profileImage),
            } : {
              id: h.opponentId,
              nickname: h.opponentNickname,
              clanTag: h.opponentClanTag,
            },
            result: h.result,
            origin: h.origin,
            playerLifePoints: h.playerLifePoints,
            opponentLifePoints: h.opponentLifePoints,
            scoreEarned: h.scoreEarned,
            turns: h.turns,
            duration: h.duration,
            finishedAt: h.finishedAt,
          };
        } catch (mapError: any) {
          logger.error(`❌ [getDuelHistory] Erro ao formatar entrada do histórico:`, mapError);
          // Retornar dados básicos mesmo se houver erro
          return {
            id: h.id,
            playerId: h.playerId,
            opponentId: h.opponentId,
            opponent: {
              id: h.opponentId,
              nickname: h.opponentNickname,
              clanTag: h.opponentClanTag,
            },
            result: h.result,
            origin: h.origin,
            playerLifePoints: h.playerLifePoints,
            opponentLifePoints: h.opponentLifePoints,
            scoreEarned: h.scoreEarned,
            turns: h.turns,
            duration: h.duration,
            finishedAt: h.finishedAt,
          };
        }
      });

      logger.info(`✅ [getDuelHistory] Histórico formatado com ${formattedHistory.length} entradas`);
      return { history: formattedHistory, total };
    } catch (error: any) {
      logger.error(`❌ [getDuelHistory] Erro ao buscar histórico:`, error);
      logger.error(`❌ [getDuelHistory] Stack:`, error.stack);
      // Retornar array vazio em caso de erro ao invés de lançar exceção
      return { history: [], total: 0 };
    }
  }

  /**
   * Buscar estatísticas de um usuário
   */
  async getUserStats(userId: number): Promise<{
    winsGeral: number;
    lossesGeral: number;
    totalScore: number;
    totalDuels: number;
    winRate: number;
    recentHistory: DuelHistory[];
  }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'winsGeral', 'lossesGeral', 'totalScore']
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const [history, total] = await this.duelHistoryRepository.findAndCount({
      where: { playerId: userId },
      order: { finishedAt: 'DESC' },
      take: 10,
    });

    const totalDuels = user.winsGeral + user.lossesGeral;
    const winRate = totalDuels > 0 ? (user.winsGeral / totalDuels) * 100 : 0;

    return {
      winsGeral: user.winsGeral,
      lossesGeral: user.lossesGeral,
      totalScore: user.totalScore,
      totalDuels: totalDuels,
      winRate: Math.round(winRate * 100) / 100, // Arredondar para 2 casas decimais
      recentHistory: history,
    };
  }

  detectPlayerTargetSpellKindForDuel(card: any, duel: any, isPlayer1: boolean): string | null {
    return Pts.detectPlayerTargetSpellKind(card, duel, isPlayer1);
  }

  private popActivatingPlayerTargetSpell(duel: any, isPlayer1: boolean, d: any): { card: any | null; error?: string } {
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!d.cardWasOnField) {
      const hand = playerField.hand || [];
      const hi = hand.findIndex((c: any) => {
        if (d.cardInstanceId && c?.instanceId) return c.instanceId === d.cardInstanceId;
        const cid = c?.idCarta || c?.id || c?.cardId;
        return cid && d.cardId && String(cid) === String(d.cardId);
      });
      if (hi < 0) return { card: null, error: 'Magia ativada não encontrada na mão' };
      return { card: playerField.hand.splice(hi, 1)[0] };
    }
    const z = d.zoneIndex;
    if (z === undefined || z === null || !playerField.spellTrap?.[z]) {
      return { card: null, error: 'Magia ativada não encontrada no campo' };
    }
    const c = playerField.spellTrap[z];
    playerField.spellTrap[z] = null;
    return { card: c };
  }

  private pushActivatorGraveyard(duel: any, isPlayer1: boolean, card: any) {
    const pf = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!pf.graveyard) pf.graveyard = [];
    pf.graveyard.push(card);
  }

  private async ptsPlaceSpecialSummoned(
    duelIdStr: string,
    duel: any,
    isPlayer1: boolean,
    playerField: any,
    card: any,
    zoneIndex: number,
    position: 'attack' | 'defense',
  ) {
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    playerField.monsters[zoneIndex] = {
      ...card,
      position,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true,
    };
    const placed = playerField.monsters[zoneIndex];
    if (placed && typeof (this as any).checkTrapsOnMonsterSummon === 'function') {
      const destroyed = await (this as any).checkTrapsOnMonsterSummon(duelIdStr, duel, isPlayer1, zoneIndex, placed, position);
      if (destroyed) return;
    }
    if (position === 'attack' && typeof (this as any).applySliferEffectOnOpponentSummon === 'function') {
      await (this as any).applySliferEffectOnOpponentSummon(duelIdStr, duel, isPlayer1, zoneIndex);
    }
  }

  private async ptsDestroySpellTrapZone(duelIdStr: string, duel: any, fieldOwnerIsPlayer1: boolean, zoneIndex: number): Promise<boolean> {
    const field = fieldOwnerIsPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!field?.spellTrap) return false;
    const destroyedCard = field.spellTrap[zoneIndex];
    if (destroyedCard === null || destroyedCard === undefined) return false;
    const isChg =
      this.isExactCard(destroyedCard, 'ChangeOfHeart') || this.isExactCard(destroyedCard, 'BrainControl');
    if (isChg) {
      await (this as any).returnChangeOfHeartMonsters(duelIdStr, duel, fieldOwnerIsPlayer1);
    } else if (this.isExactCard(destroyedCard, 'UnitedWeStand') || this.isExactCard(destroyedCard, 'MagePower')) {
      await this.handleEquipmentDestruction(duelIdStr, duel, fieldOwnerIsPlayer1, undefined, destroyedCard, zoneIndex);
    }
    await (this as any).onSpellTrapRemovedFromField(duelIdStr, duel, fieldOwnerIsPlayer1, zoneIndex);
    if (field.spellTrap[zoneIndex] !== null && field.spellTrap[zoneIndex] !== undefined) {
      if (!field.graveyard) field.graveyard = [];
      field.graveyard.push(field.spellTrap[zoneIndex]);
      field.spellTrap[zoneIndex] = null;
      await (this as any).recalculateMagePowerAtk(duelIdStr, duel, fieldOwnerIsPlayer1);
      await (this as any).recalculateUnitedWeStandForBothPlayers(duelIdStr, duel);
      return true;
    }
    return false;
  }

  /**
   * Armadilha colocada em set neste turno (mesmo turnCounter global) não pode ser ativada ainda.
   */
  isNormalTrapBlockedSameTurnSet(duel: any, card: any): boolean {
    if (!card || !duel) return false;
    const isTrap = card.type === 'Trap' || card.cardType === 'Trap';
    if (!isTrap) return false;
    const tc = Number(duel.turnCounter ?? 1);
    const setTc = card.trapSetTurnCounter;
    if (setTc === undefined || setTc === null) return false;
    return Number(setTc) === tc;
  }

  async openPlayerTargetSpellChoice(
    duelId: string | number,
    userId: number,
    duelIn: any,
    cardToProcess: any,
    cardIsOnField: boolean,
    zoneIndex: number,
    spellKind: string,
  ): Promise<{ ok: true; emitPayload: any } | { ok: false; message: string }> {
    const duelIdStr = String(duelId);
    let duel = duelIn;
    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? duel.player1Field : duel.player2Field;
    const opponentField = isPlayer1 ? duel.player2Field : duel.player1Field;
    const zoneIndexForPending = cardIsOnField ? zoneIndex : null;

    if (cardIsOnField && this.isNormalTrapBlockedSameTurnSet(duel, cardToProcess)) {
      return {
        ok: false,
        message: 'Armadilhas não podem ser ativadas no mesmo turno em que foram colocadas no campo.',
      };
    }

    if (!cardIsOnField) {
      if (duel.currentPhase === TurnPhase.BATTLE) {
        duel = await this.goToPhase(duelIdStr, TurnPhase.MAIN2);
      } else if (duel.currentPhase === TurnPhase.STANDBY) {
        duel = await this.goToPhase(duelIdStr, TurnPhase.MAIN1);
      }
    }

    const pf = isPlayer1 ? duel.player1Field : duel.player2Field;
    const of = isPlayer1 ? duel.player2Field : duel.player1Field;

    const excludeActivating = (hand: any[]) => {
      if (!hand) return [];
      if (cardIsOnField) return [...hand];
      return hand.filter((c: any) => {
        if (c?.instanceId && cardToProcess?.instanceId) return c.instanceId !== cardToProcess.instanceId;
        return c !== cardToProcess;
      });
    };

    const base = {
      spellKind,
      step: 1,
      zoneIndex: zoneIndexForPending,
      cardWasOnField: cardIsOnField,
      originalPosition: cardIsOnField ? (cardToProcess.position || 'set') : null,
      cardInstanceId: cardToProcess.instanceId,
      cardData: cardToProcess,
      cardId: cardToProcess.idCarta || cardToProcess.id || cardToProcess.cardId,
      cardName: cardToProcess.name || cardToProcess.cardName,
    };

    let title = '';
    let selectableHand: any[] | undefined;
    let graveyardChoices: { index: number; card: any }[] | undefined;
    let spellTrapChoices: { zoneIndex: number; isOpponent: boolean; card: any }[] | undefined;
    let opponentMonsters: any[] | undefined;
    let defenseMonsters: { zoneIndex: number; isOpponent: boolean; monster: any }[] | undefined;
    let emptyMonsterZones: number[] | undefined;

    if (spellKind === 'LIGHTNING_VORTEX') {
      selectableHand = excludeActivating(pf.hand || []);
      if (selectableHand.length < 1) {
        return { ok: false, message: 'Descarte 1 carta da sua mão como custo (é preciso ter outra carta além desta).' };
      }
      title = 'Lightning Vortex — escolha a carta da mão para descartar';
    } else if (spellKind === 'TRADE_IN') {
      selectableHand = (pf.hand || []).filter((c: any) => {
        if (!c) return false;
        if (!cardIsOnField && cardToProcess?.instanceId && c.instanceId === cardToProcess.instanceId) return false;
        const isM = String(c.type || c.cardType) === 'Monster' || String(c.type || c.cardType) === 'MONSTER';
        return isM && Number(c.level ?? 0) >= 8;
      });
      if (!selectableHand || selectableHand.length < 1) {
        return { ok: false, message: 'Você precisa de um monstro de Nível 8 ou mais na mão para descartar.' };
      }
      title = "Trade-In — escolha o monstro de Nível 8+ para descartar";
    } else if (spellKind === 'DARK_ERUPTION') {
      const gy = pf.graveyard || [];
      graveyardChoices = [];
      for (let i = 0; i < gy.length; i++) {
        const c = gy[i];
        const attr = String(c?.attribute || '').toUpperCase();
        const atk = Number(c?.atk ?? 0);
        const isM = String(c?.type || c?.cardType || '').toLowerCase().includes('monster');
        if (isM && (attr === 'DARK' || attr === 'TREVAS') && atk <= 1500) {
          graveyardChoices.push({ index: i, card: c });
        }
      }
      if (graveyardChoices.length < 1) {
        return { ok: false, message: 'Nenhum monstro de TREVAS com 1500 ou menos de ATK no seu Cemitério.' };
      }
      title = 'Dark Eruption — escolha o monstro no Cemitério para adicionar à mão';
    } else if (spellKind === 'STAMPING_DESTRUCTION') {
      if (!Pts.fieldHasDragonMonster(pf)) {
        return { ok: false, message: 'Você precisa controlar um monstro Dragão.' };
      }
      spellTrapChoices = Pts.collectSpellTrapTargetsBothSides(pf, of);
      if (spellTrapChoices.length < 1) {
        return { ok: false, message: 'Não há Magias/Armadilhas no campo para destruir.' };
      }
      title = 'Stamping Destruction — escolha 1 Magia ou Armadilha no campo';
    } else if (spellKind === 'TRIBUTE_TO_THE_DOOMED') {
      let hasOppMonster = false;
      (of.monsters || []).forEach((m: any) => {
        if (m) hasOppMonster = true;
      });
      if (!hasOppMonster) {
        return { ok: false, message: 'O oponente não tem monstros no campo.' };
      }
      selectableHand = excludeActivating(pf.hand || []);
      if (selectableHand.length < 1) {
        return { ok: false, message: 'Você precisa de uma carta na mão para descartar.' };
      }
      title = 'Tribute to the Doomed — passo 1: escolha a carta da mão para descartar';
    } else if (spellKind === 'ANCIENT_RULES') {
      selectableHand = (pf.hand || []).filter((c: any) => {
        if (!c) return false;
        if (!cardIsOnField && cardToProcess?.instanceId && c.instanceId === cardToProcess.instanceId) return false;
        return Pts.isNormalMonsterCard(c) && Number(c.level ?? 0) >= 5;
      });
      emptyMonsterZones = Pts.listEmptyMonsterZones(pf.monsters);
      if (!selectableHand || selectableHand.length < 1) {
        return { ok: false, message: 'Nenhum Monstro Normal de Nível 5 ou mais na mão.' };
      }
      if (emptyMonsterZones.length < 1) {
        return { ok: false, message: 'Não há zona de monstro vazia.' };
      }
      title = "Ancient Rules — passo 1: escolha o Monstro Normal (Nv 5+) na mão";
    } else if (spellKind === 'SILVERS_CRY') {
      const gy = pf.graveyard || [];
      graveyardChoices = [];
      for (let i = 0; i < gy.length; i++) {
        const c = gy[i];
        const race = String(c?.race || '').toLowerCase();
        if (Pts.isNormalMonsterCard(c) && race.includes('dragon')) {
          graveyardChoices.push({ index: i, card: c });
        }
      }
      emptyMonsterZones = Pts.listEmptyMonsterZones(pf.monsters);
      if (graveyardChoices.length < 1) {
        return { ok: false, message: 'Nenhum Monstro Normal Dragão no seu Cemitério.' };
      }
      if (emptyMonsterZones.length < 1) {
        return { ok: false, message: 'Não há zona de monstro vazia.' };
      }
      title = "Silver's Cry — passo 1: escolha o Monstro Normal Dragão no Cemitério";
    } else if (spellKind === 'SHIELD_CRUSH') {
      defenseMonsters = Pts.collectDefenseMonstersBothSides(pf, of);
      if (defenseMonsters.length < 1) {
        return { ok: false, message: 'Não há monstros em Posição de Defesa no campo.' };
      }
      title = 'Shield Crush — escolha 1 monstro em Posição de Defesa';
    } else if (spellKind === 'FISSURE_CHOOSE') {
      const tied = Pts.findFissureTiedZoneIndices(of);
      opponentMonsters = tied.map((z) => ({ ...(of.monsters[z] || {}), zoneIndex: z }));
      title = 'Fissure — escolha qual monstro com o menor ATK destruir (empate)';
    } else if (spellKind === 'RING_OF_DESTRUCTION') {
      opponentMonsters = [];
      (of.monsters || []).forEach((m: any, z: number) => {
        if (Pts.isFaceUpMonster(m)) opponentMonsters!.push({ ...m, zoneIndex: z });
      });
      if (!opponentMonsters.length) {
        return { ok: false, message: 'O oponente não tem monstros com a face para cima.' };
      }
      title = 'Ring of Destruction — escolha 1 monstro com a face para cima do oponente';
    } else if (spellKind === 'THOUSAND_KNIVES') {
      if (!Pts.fieldControlsDarkMagician(pf)) {
        return { ok: false, message: 'Você precisa controlar "Dark Magician".' };
      }
      opponentMonsters = [];
      (of.monsters || []).forEach((m: any, z: number) => {
        if (m) opponentMonsters!.push({ ...m, zoneIndex: z });
      });
      if (!opponentMonsters.length) {
        return { ok: false, message: 'O oponente não tem monstros no campo.' };
      }
      title = 'Thousand Knives — escolha 1 monstro do oponente para destruir';
    } else if (spellKind === 'DE_SPELL') {
      spellTrapChoices = Pts.collectSpellTrapTargetsBothSides(pf, of);
      if (spellTrapChoices.length < 1) {
        return { ok: false, message: 'Não há Magias/Armadilhas no campo.' };
      }
      title = 'De-Spell — escolha 1 Magia face-up ou 1 Magia/Armadilha setada';
    } else {
      return { ok: false, message: 'Tipo de magia desconhecido' };
    }

    const data: any = {
      ...base,
      title,
      selectableHand,
      graveyardChoices,
      spellTrapChoices,
      opponentMonsters,
      defenseMonsters,
      emptyMonsterZones,
    };

    await this.setPendingChoice(duelIdStr, {
      type: 'PLAYER_TARGET_SPELL',
      userId: Number(userId),
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase || 'MAIN1',
      data,
    });

    const emitPayload = {
      duelId: duelIdStr,
      spellKind,
      step: 1,
      title,
      selectableHand,
      graveyardChoices,
      spellTrapChoices,
      opponentMonsters,
      defenseMonsters,
      emptyMonsterZones,
    };

    return { ok: true, emitPayload };
  }

  async processPlayerTargetSpellChoice(
    duelId: string | number,
    userId: number,
    actionData: any,
  ): Promise<{
    success: boolean;
    message?: string;
    needsSecondStep?: boolean;
    secondEmit?: any;
  }> {
    return this.cardEffectsService.executeAction('processPlayerTargetSpellChoice', this, [duelId, userId, actionData]);
  }

  /**
   * Estatísticas de duelos Random (RANDOM + RANDOM_ANIME) do usuário
   */
  async getRandomDuelStats(userId: number): Promise<{ total: number; wins: number; losses: number }> {
    const rows = await this.duelHistoryRepository.query(
      `SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END), 0)::int AS wins,
        COALESCE(SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END), 0)::int AS losses
       FROM duel_history
       WHERE "playerId" = $1 AND origin IN ('RANDOM', 'RANDOM_ANIME')`,
      [userId],
    );
    const row = rows?.[0];
    return {
      total: row?.total ?? 0,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
    };
  }

  /** Estatísticas da fila ranqueada + pontos atuais */
  async getRankedDuelStats(
    userId: number,
  ): Promise<{ total: number; wins: number; losses: number; rankedPoints: number }> {
    const rows = await this.duelHistoryRepository.query(
      `SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN result = 'WIN' THEN 1 ELSE 0 END), 0)::int AS wins,
        COALESCE(SUM(CASE WHEN result = 'LOSS' THEN 1 ELSE 0 END), 0)::int AS losses
       FROM duel_history
       WHERE "playerId" = $1 AND origin = 'RANKED'`,
      [userId],
    );
    const row = rows?.[0];
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'rankedPoints'],
    });
    return {
      total: row?.total ?? 0,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
      rankedPoints: Number(user?.rankedPoints ?? 1000),
    };
  }

  /**
   * Buscar estatísticas de confronto direto entre dois jogadores
   */
  async getDirectMatchStats(player1Id: number, player2Id: number): Promise<{
    player1: {
      id: number;
      nickname: string;
      profileImage: string | null;
    };
    player2: {
      id: number;
      nickname: string;
      profileImage: string | null;
    };
    total: {
      player1Wins: number;
      player2Wins: number;
      draws: number;
      totalMatches: number;
    };
    byOrigin: {
      RANDOM: { player1Wins: number; player2Wins: number; draws: number; total: number };
      CHAT: { player1Wins: number; player2Wins: number; draws: number; total: number };
      ARENA: { player1Wins: number; player2Wins: number; draws: number; total: number };
      TOURNAMENT: { player1Wins: number; player2Wins: number; draws: number; total: number };
      OTHER: { player1Wins: number; player2Wins: number; draws: number; total: number };
    };
  }> {
    // Buscar informações dos jogadores
    const [player1, player2] = await Promise.all([
      this.usersRepository.findOne({
        where: { id: player1Id },
        select: ['id', 'nickname', 'profileImage']
      }),
      this.usersRepository.findOne({
        where: { id: player2Id },
        select: ['id', 'nickname', 'profileImage']
      })
    ]);

    if (!player1 || !player2) {
      throw new Error('Um ou ambos os jogadores não foram encontrados');
    }

    // Buscar todos os duelos entre os dois jogadores
    // Buscar apenas onde playerId = player1Id e opponentId = player2Id
    // Isso evita contar o mesmo duelo duas vezes
    const allMatches = await this.duelHistoryRepository.find({
      where: { playerId: player1Id, opponentId: player2Id }
    });

    // Agrupar estatísticas
    const stats = {
      total: {
        player1Wins: 0,
        player2Wins: 0,
        draws: 0,
        totalMatches: 0
      },
      byOrigin: {
        RANDOM: { player1Wins: 0, player2Wins: 0, draws: 0, total: 0 },
        CHAT: { player1Wins: 0, player2Wins: 0, draws: 0, total: 0 },
        ARENA: { player1Wins: 0, player2Wins: 0, draws: 0, total: 0 },
        TOURNAMENT: { player1Wins: 0, player2Wins: 0, draws: 0, total: 0 },
        OTHER: { player1Wins: 0, player2Wins: 0, draws: 0, total: 0 }
      }
    };

    // Processar cada duelo
    for (const match of allMatches) {
      // Ignorar duelos cancelados e empates (não vamos mais ter empates)
      if (match.result === DuelHistoryResult.CANCELLED || match.result === DuelHistoryResult.DRAW) {
        continue;
      }

      const origin = match.origin as keyof typeof stats.byOrigin;
      if (!stats.byOrigin[origin]) {
        stats.byOrigin[origin] = { player1Wins: 0, player2Wins: 0, draws: 0, total: 0 };
      }

      stats.byOrigin[origin].total++;
      stats.total.totalMatches++;

      if (match.result === DuelHistoryResult.WIN) {
        // Se o playerId é player1Id e resultou em WIN, então player1 ganhou
        stats.total.player1Wins++;
        stats.byOrigin[origin].player1Wins++;
      } else if (match.result === DuelHistoryResult.LOSS) {
        // Se o playerId é player1Id e resultou em LOSS, então player2 ganhou
        stats.total.player2Wins++;
        stats.byOrigin[origin].player2Wins++;
      }
    }

    return {
      player1: {
        id: player1.id,
        nickname: player1.nickname,
        profileImage: normalizeProfileImageForClient(player1.profileImage)
      },
      player2: {
        id: player2.id,
        nickname: player2.nickname,
        profileImage: normalizeProfileImageForClient(player2.profileImage)
      },
      total: stats.total,
      byOrigin: stats.byOrigin
    };
  }
}
