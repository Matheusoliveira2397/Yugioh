import { Injectable, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Duel, DuelStatus, DuelResult, TurnPhase, DuelOrigin } from './entities/duel.entity';
import { DuelLog } from './entities/duel-log.entity';
import { DuelHistory, DuelHistoryResult, DuelHistoryOrigin } from './entities/duel-history.entity';
import { User } from '../users/entities/user.entity';
import { DecksService } from '../decks/decks.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { CardsService } from '../cards/cards.service';
import { SeasonsService } from '../seasons/seasons.service';
import { GroupsService } from '../groups/groups.service';
import { UsersService } from '../users/users.service';
import { logger } from '../../common/utils/logger.util';

@Injectable()
export class DuelsService implements OnModuleInit {
  private activeDuels: Map<string, Duel> = new Map()
  private creatingDuels: Map<string, Promise<Duel | null>> = new Map();

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
        'CREATE INDEX IF NOT EXISTS "IDX_users_rating" ON "users"("rating" DESC)',
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
        select: ['id', 'equippedDeckName'],
      });

      if (!user) {
        return false;
      }

      const equippedDeckName = (user as any).equippedDeckName;
      return !!(equippedDeckName && equippedDeckName.trim() !== '');
    } catch (error) {
      logger.error(`❌ [hasEquippedDeck] Erro ao verificar deck equipado para usuário ${userId}:`, error);
      return false;
    }
  }

  findDuelByIdLight(duelId: string | number): Duel | null {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = this.activeDuels.get(duelIdStr) || null;
    if (duel) {
      logger.info(`🔍 [findDuelByIdLight] Duelo encontrado em memória - player1Field: ${!!(duel as any).player1Field}, player2Field: ${!!(duel as any).player2Field}`);
      
      // CRÍTICO: Se algum campo estiver faltando, buscar do banco imediatamente
      if (!(duel as any).player1Field || !(duel as any).player2Field) {
        logger.error(`❌ [findDuelByIdLight] Campos faltando em memória! player1Field: ${!!(duel as any).player1Field}, player2Field: ${!!(duel as any).player2Field}`);
        // Retornar null para forçar busca do banco
        return null;
      }
      
      // Verificar se os campos são strings (JSON não parseado) e fazer parse se necessário
      if ((duel as any).player1Field && typeof (duel as any).player1Field === 'string') {
        logger.info(`🔄 [findDuelByIdLight] player1Field é string, fazendo parse...`);
        try {
          (duel as any).player1Field = JSON.parse((duel as any).player1Field);
        } catch (e) {
          logger.error(`❌ [findDuelByIdLight] Erro ao fazer parse do player1Field:`, e);
        }
      }
      if ((duel as any).player2Field && typeof (duel as any).player2Field === 'string') {
        logger.info(`🔄 [findDuelByIdLight] player2Field é string, fazendo parse...`);
        try {
          (duel as any).player2Field = JSON.parse((duel as any).player2Field);
        } catch (e) {
          logger.error(`❌ [findDuelByIdLight] Erro ao fazer parse do player2Field:`, e);
        }
      }
      
      // Validar que ambos os campos têm deck
      if (!(duel as any).player1Field?.deck || (duel as any).player1Field.deck.length === 0 ||
          !(duel as any).player2Field?.deck || (duel as any).player2Field.deck.length === 0) {
        logger.error(`❌ [findDuelByIdLight] Campos sem deck em memória! Forçando busca do banco...`);
        return null; // Retornar null para forçar busca do banco
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
          ])
          .leftJoinAndSelect('duel.player1', 'player1', undefined, [
            'player1.id',
            'player1.username',
            'player1.nickname',
            'player1.equippedPlaymatId',
            'player1.equippedPlaymatImage',
            'player1.equippedSkinId',
            'player1.equippedSkinImage',
            'player1.equippedDeckName',
          ])
          .leftJoinAndSelect('duel.player2', 'player2', undefined, [
            'player2.id',
            'player2.username',
            'player2.nickname',
            'player2.equippedPlaymatId',
            'player2.equippedPlaymatImage',
            'player2.equippedSkinId',
            'player2.equippedSkinImage',
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
                'username', p1.username,
                'nickname', p1.nickname,
                'equippedPlaymatId', p1."equippedPlaymatId",
                'equippedPlaymatImage', p1."equippedPlaymatImage",
                'equippedSkinId', p1."equippedSkinId",
                'equippedSkinImage', p1."equippedSkinImage",
                'equippedDeckName', p1."equippedDeckName"
              ) as player1,
              jsonb_build_object(
                'id', p2.id,
                'username', p2.username,
                'nickname', p2.nickname,
                'equippedPlaymatId', p2."equippedPlaymatId",
                'equippedPlaymatImage', p2."equippedPlaymatImage",
                'equippedSkinId', p2."equippedSkinId",
                'equippedSkinImage', p2."equippedSkinImage",
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
        
        // Validar que ambos os campos foram carregados corretamente do banco
        // Se algum campo estiver vazio, tentar buscar diretamente do banco usando query SQL
        if (!duel.player1Field || !duel.player1Field.deck || duel.player1Field.deck.length === 0) {
          logger.warn(`⚠️ [findDuelByIdFromDatabase] player1Field está vazio! Tentando buscar diretamente do banco...`);
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
        
        if (!duel.player2Field || !duel.player2Field.deck || duel.player2Field.deck.length === 0) {
          logger.warn(`⚠️ [findDuelByIdFromDatabase] player2Field está vazio! Tentando buscar diretamente do banco...`);
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
        
        // CRÍTICO: Validar que ambos os campos foram carregados antes de adicionar ao cache
        if (!duel.player1Field || !duel.player1Field.deck || duel.player1Field.deck.length === 0) {
          logger.error(`❌ [findDuelByIdFromDatabase] player1Field inválido antes de adicionar ao cache! Duelo ID: ${duelIdStr}`);
          // NÃO adicionar ao cache se os campos não estiverem corretos
          // Isso forçará uma busca do banco na próxima vez
          return null;
        }
        if (!duel.player2Field || !duel.player2Field.deck || duel.player2Field.deck.length === 0) {
          logger.error(`❌ [findDuelByIdFromDatabase] player2Field inválido antes de adicionar ao cache! Duelo ID: ${duelIdStr}`);
          // NÃO adicionar ao cache se os campos não estiverem corretos
          // Isso forçará uma busca do banco na próxima vez
          return null;
        }
        
        // Garantir que os campos sejam objetos válidos (não strings)
        if (typeof duel.player1Field === 'string') {
          (duel as any).player1Field = JSON.parse(duel.player1Field);
        }
        if (typeof duel.player2Field === 'string') {
          (duel as any).player2Field = JSON.parse(duel.player2Field);
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
        };
        
        logger.debug(`💾 [findDuelByIdFromDatabase] Adicionando ao cache - player1Field.deck.length: ${(duelToCache as any).player1Field?.deck?.length || 0}`);
        
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
        logger.info(`🧹 [deepCleanField] Limpando deck com ${clean.deck.length} cartas...`);
        clean.deck = clean.deck.map((card: any, index: number) => {
          const compacted = this.compactCard(card);
          if (!compacted && index < 3) {
            logger.warn(`⚠️ [deepCleanField] Carta ${index} do deck retornou null após compactCard:`, card);
          }
          return compacted;
        }).filter((c: any) => c !== null);
        logger.info(`🧹 [deepCleanField] Deck limpo: ${clean.deck.length} cartas restantes`);
      } else {
        clean.deck = clean.deck || [];
    }
    
    if (clean.hand && Array.isArray(clean.hand)) {
        logger.info(`🧹 [deepCleanField] Limpando hand com ${clean.hand.length} cartas...`);
        clean.hand = clean.hand.map((card: any, index: number) => {
          const compacted = this.compactCard(card);
          if (!compacted && index < 3) {
            logger.warn(`⚠️ [deepCleanField] Carta ${index} da mão retornou null após compactCard:`, card);
          }
          return compacted;
        }).filter((c: any) => c !== null);
        logger.info(`🧹 [deepCleanField] Hand limpa: ${clean.hand.length} cartas restantes`);
      } else {
        clean.hand = clean.hand || [];
    }
    
    if (clean.monsters && Array.isArray(clean.monsters)) {
      logger.info(`🧹 [deepCleanField] Limpando ${clean.monsters.length} monstros...`);
      clean.monsters = clean.monsters.map((monster: any, index: number) => {
        if (!monster) return null;
        const compacted = this.compactCard(monster);
        // Garantir que propriedades críticas sejam preservadas SEMPRE
        if (compacted && monster) {
          // Preservar position
          if (monster.position !== undefined && monster.position !== null) {
            compacted.position = monster.position;
            logger.info(`🔍 [deepCleanField] Preservando position para monstro ${compacted.name}: ${monster.position}`);
          }
          // Preservar summonedTurnNumber (CRÍTICO para impedir mudança de posição no mesmo turno)
          if (monster.summonedTurnNumber !== undefined && monster.summonedTurnNumber !== null) {
            compacted.summonedTurnNumber = monster.summonedTurnNumber;
            logger.info(`🔍 [deepCleanField] Preservando summonedTurnNumber para monstro ${compacted.name}: ${monster.summonedTurnNumber}`);
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
          // Preservar propriedades de equipamento
          if (monster.equippedBy !== undefined && monster.equippedBy !== null) {
            compacted.equippedBy = monster.equippedBy;
          }
          if (monster.equippedCardId !== undefined && monster.equippedCardId !== null) {
            compacted.equippedCardId = monster.equippedCardId;
          }
          if (monster.equippedSpellTrapZoneIndex !== undefined && monster.equippedSpellTrapZoneIndex !== null) {
            compacted.equippedSpellTrapZoneIndex = monster.equippedSpellTrapZoneIndex;
          }
          if (monster.equipmentBonusAtk !== undefined && monster.equipmentBonusAtk !== null) {
            compacted.equipmentBonusAtk = monster.equipmentBonusAtk;
          }
          // CRÍTICO: Preservar campos de controle do ChangeOfHeart
          if (monster.controlledBy !== undefined && monster.controlledBy !== null) {
            compacted.controlledBy = monster.controlledBy;
            logger.info(`🔍 [deepCleanField] Preservando controlledBy para monstro ${compacted.name}: ${monster.controlledBy}`);
          }
          if (monster.originalOwner !== undefined && monster.originalOwner !== null) {
            compacted.originalOwner = monster.originalOwner;
            logger.info(`🔍 [deepCleanField] Preservando originalOwner para monstro ${compacted.name}: ${monster.originalOwner}`);
          }
          if (monster.originalZoneIndex !== undefined && monster.originalZoneIndex !== null) {
            compacted.originalZoneIndex = monster.originalZoneIndex;
            logger.info(`🔍 [deepCleanField] Preservando originalZoneIndex para monstro ${compacted.name}: ${monster.originalZoneIndex}`);
          }
          if (monster.controlledUntilTurn !== undefined && monster.controlledUntilTurn !== null) {
            compacted.controlledUntilTurn = monster.controlledUntilTurn;
            logger.info(`🔍 [deepCleanField] Preservando controlledUntilTurn para monstro ${compacted.name}: ${monster.controlledUntilTurn}`);
          }
        }
        if (index < 2) {
          logger.info(`🧹 [deepCleanField] Monstro ${index}:`, {
            name: compacted?.name,
            position: compacted?.position,
            summonedTurnNumber: compacted?.summonedTurnNumber,
            summonedByPlayer: compacted?.summonedByPlayer,
            controlledBy: compacted?.controlledBy,
            originalOwner: compacted?.originalOwner,
            originalZoneIndex: compacted?.originalZoneIndex,
            originalPosition: monster?.position
          });
        }
        return compacted;
      });
      logger.info(`🧹 [deepCleanField] Monstros limpos:`, clean.monsters.map((m: any, i: number) => ({ 
        index: i, 
        name: m?.name || 'null', 
        position: m?.position || 'null',
        summonedTurnNumber: m?.summonedTurnNumber !== undefined ? m.summonedTurnNumber : 'undefined'
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
        logger.info(`🧹 [deepCleanField] Limpando extra deck com ${clean.extraDeck.length} cartas...`);
        clean.extraDeck = clean.extraDeck.map((card: any) => this.compactCard(card)).filter((c: any) => c !== null);
        logger.info(`🧹 [deepCleanField] Extra deck limpo: ${clean.extraDeck.length} cartas restantes`);
      } else {
        clean.extraDeck = clean.extraDeck || [];
    }

    // CRÍTICO: Preservar turnCounter no JSON do campo
    if (field.turnCounter !== undefined && field.turnCounter !== null) {
      clean.turnCounter = field.turnCounter;
      logger.info(`🔍 [deepCleanField] Preservando turnCounter: ${field.turnCounter}`);
    }
    
    // Preservar outras propriedades do campo
    if (field.normalSummonUsed !== undefined) {
      clean.normalSummonUsed = field.normalSummonUsed;
    }
    if (field.positionChangedThisTurn !== undefined) {
      clean.positionChangedThisTurn = field.positionChangedThisTurn;
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

  async updateDuelInDatabase(duelId: string | number, updates: Partial<Duel>): Promise<void> {
    try {
      const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
      
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
      
      // Limpar campos se estiverem presentes (apenas quando necessário)
      if (cleanUpdates.player1Field) {
        cleanUpdates.player1Field = this.deepCleanField(cleanUpdates.player1Field);
      }
      if (cleanUpdates.player2Field) {
        cleanUpdates.player2Field = this.deepCleanField(cleanUpdates.player2Field);
      }
      
      // Remover relações se estiverem presentes
      delete cleanUpdates.player1;
      delete cleanUpdates.player2;
      
      // Sempre atualizar updatedAt
      cleanUpdates.updatedAt = new Date();
      
      // Salvar no banco de dados - usar findOne + save para garantir que campos JSONB sejam atualizados corretamente
      const duelToUpdate = await this.duelsRepository.findOne({ where: { id: duelIdStr } });
      if (!duelToUpdate) {
        logger.error(`❌ [updateDuelInDatabase] Duelo ${duelIdStr} não encontrado para atualizar`);
        return;
      }
      
      // Preservar origin se não foi fornecido nos updates
      if (cleanUpdates.origin === undefined || cleanUpdates.origin === null) {
        // Manter o origin existente do banco
        cleanUpdates.origin = existingDuel.origin || DuelOrigin.OTHER;
        logger.info(`📌 [updateDuelInDatabase] Origin preservado: ${cleanUpdates.origin}`);
      } else {
        // Validar origin se foi fornecido
        if (!Object.values(DuelOrigin).includes(cleanUpdates.origin)) {
          logger.warn(`⚠️ [updateDuelInDatabase] Origin inválido: ${cleanUpdates.origin}, preservando o existente: ${existingDuel.origin}`);
          cleanUpdates.origin = existingDuel.origin || DuelOrigin.OTHER;
        }
      }
      
      // Atualizar todos os campos não-JSONB primeiro
      Object.keys(cleanUpdates).forEach(key => {
        if (key !== 'player1Field' && key !== 'player2Field' && key !== 'player1' && key !== 'player2') {
          (duelToUpdate as any)[key] = cleanUpdates[key];
        }
      });
      
      // Atualizar campos JSONB explicitamente (sempre ambos para garantir sincronização)
      if (cleanUpdates.player1Field !== undefined) {
        (duelToUpdate as any).player1Field = cleanUpdates.player1Field;
      }
      if (cleanUpdates.player2Field !== undefined) {
        (duelToUpdate as any).player2Field = cleanUpdates.player2Field;
      }
      
      // Salvar todas as alterações
      await this.duelsRepository.save(duelToUpdate);
    } catch (error) {
      logger.error(`❌ [updateDuelInDatabase] Erro ao atualizar duelo ${duelId}:`, error);
      throw error;
    }
  }


  async drawCard(duelId: string | number, userId: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = this.activeDuels.get(duelIdStr);
    
    // Se não encontrou em memória, buscar do banco
    if (!duel) {
      const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
      if (!duelFromDb) return;
      duel = duelFromDb;
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    if (!playerField || !playerField.deck || playerField.deck.length === 0) {
      return;
    }

    const drawnCard = playerField.deck.shift();
    if (!drawnCard) {
      return;
    }

    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    const jinzoOnField = this.isJinzoOnField(duel);
    
    // Verificar se o oponente tem "DropOff" ativada (face-up)
    let dropOffActivated = false;
    let dropOffZoneIndex = -1;
    
    // Se Jinzo está no campo, DropOff não pode ser ativada
    if (!jinzoOnField && opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
      for (let i = 0; i < opponentField.spellTrap.length; i++) {
        const trap = opponentField.spellTrap[i];
        if (trap && trap !== null) {
          const trapId = trap.idCarta || trap.id || trap.cardId;
          const trapPosition = trap.position || 'set';
          
          // Verificar se é DropOff e está face-up (ativada)
          if (trapId === 'DropOff' && (trapPosition === 'face-up' || trapPosition === 'activated')) {
            dropOffActivated = true;
            dropOffZoneIndex = i;
            logger.info(`✨ [drawCard] DropOff detectada na zona ${i} do oponente - interceptando compra de carta`);
            break;
          }
        }
      }
    } else if (jinzoOnField) {
      logger.info(`🤖 [drawCard] Jinzo está no campo - DropOff não pode ser ativada`);
    }

    if (dropOffActivated) {
      // DropOff ativada: enviar carta para o cemitério em vez da mão
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      playerField.graveyard.push(drawnCard);
      
      logger.info(`✅ [drawCard] Carta "${drawnCard.name || drawnCard.cardName || 'Desconhecida'}" enviada para o cemitério devido ao efeito de DropOff`);
      
      // Mover DropOff para o cemitério do oponente (quem ativou)
      if (opponentField && opponentField.spellTrap && dropOffZoneIndex >= 0) {
        const dropOffTrap = opponentField.spellTrap[dropOffZoneIndex];
        if (dropOffTrap) {
          if (!opponentField.graveyard) {
            opponentField.graveyard = [];
          }
          opponentField.graveyard.push(dropOffTrap);
          opponentField.spellTrap[dropOffZoneIndex] = null;
          logger.info(`✅ [drawCard] DropOff movida para o cemitério do oponente após ativação`);
        }
      }
    } else {
      // Comportamento normal: adicionar à mão
      // Garantir que a carta tenha instanceId único (importante para distinguir múltiplas cópias)
      this.ensureCardInstanceId(drawnCard);
      playerField.hand = playerField.hand || [];
      playerField.hand.push(drawnCard);
      logger.info(`✅ [drawCard] Carta comprada normalmente. Hand do player ${userId}: ${playerField.hand?.length || 0} cartas`);
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

    logger.info(`🔍 [masterAddCardToHand] Buscando carta "${cardName}" na lista completa de cartas do jogo para ${isPlayer1 ? 'Player 1' : 'Player 2'}`);

    // Buscar a carta na lista completa de cartas do jogo
    let card: any = null;
    
    // Tentar buscar por nome exato primeiro
    try {
      card = await this.cardsService.findByNameExact(cardName.trim());
      if (card) {
        logger.info(`✅ [masterAddCardToHand] Carta encontrada por nome exato: "${card.name}"`);
      } else {
        logger.info(`ℹ️ [masterAddCardToHand] Nome exato não encontrado (retornou null), tentando busca parcial...`);
      }
    } catch (error) {
      logger.info(`ℹ️ [masterAddCardToHand] Erro ao buscar por nome exato:`, error);
    }
    
    // Se não encontrou por nome exato, tentar busca parcial
    if (!card) {
      try {
        logger.info(`🔍 [masterAddCardToHand] Buscando por nome parcial: "${cardName.trim()}"`);
        const cards = await this.cardsService.findAll(cardName.trim());
        logger.info(`🔍 [masterAddCardToHand] Encontradas ${cards.length} cartas com busca parcial`);
        
        if (cards.length > 0) {
          // Normalizar o nome da busca
          const normalizedSearchName = cardName.trim().toLowerCase().replace(/\s+/g, ' ');
          
          // Procurar a melhor correspondência (exata ou parcial)
          for (const c of cards) {
            const cardNameToCheck = (c.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
            if (cardNameToCheck === normalizedSearchName) {
              card = c;
              logger.info(`✅ [masterAddCardToHand] Carta encontrada por correspondência exata: "${card.name}"`);
              break;
            }
          }
          
          // Se não encontrou correspondência exata, usar a primeira
          if (!card && cards.length > 0) {
            card = cards[0];
            logger.info(`⚠️ [masterAddCardToHand] Carta exata não encontrada, usando primeira correspondência: "${card.name}"`);
          }
        }
      } catch (searchError) {
        logger.error(`❌ [masterAddCardToHand] Erro ao buscar carta por nome parcial:`, searchError);
      }
    }

    // Se ainda não encontrou, tentar buscar por idCarta
    if (!card) {
      try {
        logger.info(`🔍 [masterAddCardToHand] Tentando buscar por idCarta: "${cardName.trim()}"`);
        card = await this.cardsService.findByIdCarta(cardName.trim());
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
      id: card.id
    });

    // Criar uma cópia da carta no formato usado no duelo (similar ao preparePlayerDeck)
    const duelCard = {
      id: card.id,
      idCarta: card.idCarta || card.id,
      cardId: card.idCarta || card.id,
      name: card.name,
      type: card.type,
      cardType: card.type,
      atk: card.atk || 0,
      def: card.def || 0,
      level: card.level || 0,
      attribute: card.attribute || null,
      race: card.race || null,
      rarity: card.rarity || null,
      instanceId: this.generateCardInstanceId(), // ID único para esta instância da carta
      // NÃO incluir cardImage (muito grande, será gerado no frontend)
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

    // Se não está na fase DRAW, não fazer nada
    if (duel.currentPhase !== TurnPhase.DRAW) {
      logger.info(`ℹ️ [processDrawPhase] Duelo ${duelIdStr} não está na fase DRAW (fase atual: ${duel.currentPhase})`);
      return null;
    }

    logger.info(`🔄 [processDrawPhase] Processando fase DRAW para duelo ${duelIdStr}, turno do player ${duel.currentTurn}`);

    // Identificar jogador atual e oponente
    const currentPlayerId = duel.currentTurn === 1 ? duel.player1Id : duel.player2Id;
    const opponentId = duel.currentTurn === 1 ? duel.player2Id : duel.player1Id;
    const isCurrentPlayer1 = duel.currentTurn === 1;
    const currentPlayerField = isCurrentPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isCurrentPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    const jinzoOnField = this.isJinzoOnField(duel);
    
    // Verificar se o oponente tem "DropOff" set (face-down) e ativar automaticamente
    // Mas só se Jinzo NÃO estiver no campo
    if (!jinzoOnField && opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
      for (let i = 0; i < opponentField.spellTrap.length; i++) {
        const trap = opponentField.spellTrap[i];
        if (trap && trap !== null) {
          const trapId = trap.idCarta || trap.id || trap.cardId;
          const trapPosition = trap.position || 'set';
          
          // Verificar se é DropOff e está set (face-down)
          if (trapId === 'DropOff' && trapPosition === 'set') {
            // Ativar automaticamente (virar face-up)
            trap.position = 'face-up';
            logger.info(`✨ [processDrawPhase] DropOff ativada automaticamente na zona ${i} do oponente antes da compra de carta`);
            
            // Atualizar no banco antes de comprar a carta
            await this.updateDuelInDatabase(duelIdStr, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
            
            // Buscar duelo atualizado após ativar a trap para garantir que drawCard veja a trap ativada
            const updatedDuelAfterTrap = await this.findDuelByIdFromDatabase(duelIdStr);
            if (updatedDuelAfterTrap) {
              duel = updatedDuelAfterTrap;
            }
            break;
          }
        }
      }
    } else if (jinzoOnField) {
      logger.info(`🤖 [processDrawPhase] Jinzo está no campo - DropOff não pode ser ativada`);
    }

    // Comprar uma carta para o jogador do turno atual
    logger.info(`🔄 [processDrawPhase] Comprando carta para player ${currentPlayerId}...`);
    await this.drawCard(duelId, currentPlayerId);
    logger.info(`✅ [processDrawPhase] Carta comprada com sucesso`);
    
    // Buscar o duelo atualizado após comprar a carta - SEMPRE do banco para garantir dados atualizados
    let updatedDuel: Duel | null = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!updatedDuel) {
      updatedDuel = this.activeDuels.get(duelIdStr) || null;
      if (!updatedDuel) {
        logger.warn(`⚠️ [processDrawPhase] Não foi possível buscar duelo atualizado após comprar carta`);
        return null;
      }
    }
    
    logger.info(`🔄 [processDrawPhase] Duelo atualizado encontrado. Fase atual: ${updatedDuel.currentPhase}, Hand do player atual: ${(updatedDuel.currentTurn === 1 ? (updatedDuel as any).player1Field?.hand?.length : (updatedDuel as any).player2Field?.hand?.length) || 0}`);
    
    // Avançar automaticamente para STANDBY (ao invés de MAIN1)
    updatedDuel.currentPhase = TurnPhase.STANDBY;
    logger.info(`✅ [processDrawPhase] Fase DRAW processada, avançando para STANDBY`);
    
    // Garantir que o duelo atualizado está no cache
    this.activeDuels.set(duelIdStr, updatedDuel);
    
    // Atualizar no banco de dados
      await this.updateDuelInDatabase(duelId, {
      currentPhase: updatedDuel.currentPhase,
      player1Field: (updatedDuel as any).player1Field,
      player2Field: (updatedDuel as any).player2Field,
      } as any);
    
    logger.info(`✅ [processDrawPhase] Duelo atualizado no banco. Retornando duelo atualizado.`);
    
    // Retornar o duelo atualizado para que o gateway possa emitir duelUpdate
    return updatedDuel;
  }

  /**
   * Verifica e ativa Trap Hole do oponente se as condições forem atendidas
   * Condições: oponente tem Trap Hole setada E monstro tem 1000+ de ataque
   * Retorna true se o monstro foi destruído, false caso contrário
   */
  private async checkAndActivateTrapHole(duelId: string | number, duel: Duel, isPlayer1: boolean, monsterZoneIndex: number, monster: any): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    if (this.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateTrapHole] Jinzo está no campo - Trap Hole não pode ser ativada`);
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente durante a Fase de Batalha
    // isPlayer1 = jogador que invocou o monstro (atacante)
    // O oponente (defensor) está tentando ativar a trap, então passamos !isPlayer1
    if (this.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateTrapHole] MirageDragon está no campo do atacante - Trap Hole não pode ser ativada durante Fase de Batalha`);
      return false;
    }
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    // Verificar se o oponente tem Trap Hole setada (face-down)
    let trapHoleZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapId = trap.idCarta || trap.id || trap.cardId;
        const trapName = (trap.name || trap.cardName || '').toLowerCase();
        const trapPosition = trap.position || 'set';
        
        const isTrapHole = trapId === 'TrapHole' || 
                          trapId === 'traphole' ||
                          trapName === 'trap hole' ||
                          this.isExactCard(trap, 'TrapHole');
        
        // Trap Hole deve estar setada (face-down)
        if (isTrapHole && trapPosition === 'set') {
          trapHoleZoneIndex = i;
          logger.info(`🕳️ [checkAndActivateTrapHole] Trap Hole encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (trapHoleZoneIndex === -1) {
      return false; // Não há Trap Hole setada
    }

    // Verificar se o monstro tem 1000+ de ataque
    const monsterAtk = monster.atk || 0;
    if (monsterAtk < 1000) {
      logger.info(`ℹ️ [checkAndActivateTrapHole] Monstro ${monster.name} tem apenas ${monsterAtk} de ATK, Trap Hole não ativa`);
      return false;
    }

    logger.info(`💥 [checkAndActivateTrapHole] Trap Hole ativada! Destruindo ${monster.name} (ATK: ${monsterAtk})`);

    // Verificar se o monstro tinha equipamento antes de destruir
    await this.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);

    // Destruir o monstro
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }
    playerField.graveyard.push(monster);
    playerField.monsters[monsterZoneIndex] = null;

    // Recalcular UnitedWeStand para ambos os jogadores (monstro foi removido)
    await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);

    // Mover Trap Hole para o cemitério do oponente
    const trapHole = opponentField.spellTrap[trapHoleZoneIndex];
    if (trapHole) {
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(trapHole);
      opponentField.spellTrap[trapHoleZoneIndex] = null;
      logger.info(`✅ [checkAndActivateTrapHole] Trap Hole movida para o cemitério do oponente após ativação`);
    }

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return true; // Monstro foi destruído
  }

  /**
   * Verifica se Jinzo está no campo (de qualquer jogador)
   * Jinzo nega todos os efeitos de Trap Cards
   */
  /**
   * Verifica se uma carta tem exatamente o idCarta especificado
   * Usa comparação exata (case-insensitive) para evitar falsos positivos
   */
  private isExactCard(card: any, exactIdCarta: string): boolean {
    if (!card) return false;
    
    const cardId = card.idCarta || card.id || card.cardId;
    if (!cardId) return false;
    
    // Comparação exata do idCarta (case-insensitive)
    const cardIdLower = String(cardId).toLowerCase().trim();
    const exactIdLower = exactIdCarta.toLowerCase().trim();
    
    return cardIdLower === exactIdLower;
  }

  /**
   * Busca uma carta em um array usando instanceId (prioritário) ou idCarta/id/cardId
   * Isso permite distinguir múltiplas cópias da mesma carta no duelo
   */
  private findCardInArray(cards: any[], searchCriteria: { instanceId?: string; idCarta?: string; id?: string; cardId?: string; cardName?: string }): any | null {
    if (!cards || !Array.isArray(cards)) return null;
    
    // Se temos instanceId, buscar por ele primeiro (mais específico)
    if (searchCriteria.instanceId) {
      const found = cards.find((c: any) => c && c.instanceId === searchCriteria.instanceId);
      if (found) return found;
    }
    
    // Se temos idCarta, id ou cardId, buscar por eles
    if (searchCriteria.idCarta || searchCriteria.id || searchCriteria.cardId) {
      const searchId = searchCriteria.idCarta || searchCriteria.id || searchCriteria.cardId;
      const found = cards.find((c: any) => {
        if (!c) return false;
        const cIdCarta = c.idCarta;
        const cId = c.id;
        const cCardId = c.cardId;
        return cIdCarta === searchId || cId === searchId || cCardId === searchId ||
               String(cIdCarta) === String(searchId) || String(cId) === String(searchId) || String(cCardId) === String(searchId);
      });
      if (found) return found;
    }
    
    // Se temos cardName, buscar por nome (menos específico, pode retornar primeira cópia)
    if (searchCriteria.cardName) {
      const found = cards.find((c: any) => {
        if (!c) return false;
        const cName = c.name || c.cardName;
        return cName && searchCriteria.cardName && 
               (cName === searchCriteria.cardName || cName.toLowerCase() === searchCriteria.cardName.toLowerCase());
      });
      if (found) return found;
    }
    
    return null;
  }

  private isJinzoOnField(duel: Duel): boolean {
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;
    
    // Verificar se Jinzo está no campo do Player1
    if (player1Field && player1Field.monsters && Array.isArray(player1Field.monsters)) {
      for (const monster of player1Field.monsters) {
        if (monster && monster !== null) {
          if (this.isExactCard(monster, 'Jinzo')) {
            logger.info(`🤖 [isJinzoOnField] Jinzo encontrado no campo do Player1`);
            return true;
          }
        }
      }
    }
    
    // Verificar se Jinzo está no campo do Player2
    if (player2Field && player2Field.monsters && Array.isArray(player2Field.monsters)) {
      for (const monster of player2Field.monsters) {
        if (monster && monster !== null) {
          if (this.isExactCard(monster, 'Jinzo')) {
            logger.info(`🤖 [isJinzoOnField] Jinzo encontrado no campo do Player2`);
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * Verifica se MirageDragon está no campo do oponente durante a Fase de Batalha
   * MirageDragon impede que o oponente ative traps durante a Fase de Batalha
   * @param duel - Duelo atual
   * @param isPlayer1 - Se o jogador que está tentando ativar a trap é Player1
   * @returns true se MirageDragon está no campo do oponente e estamos na Fase de Batalha
   */
  private isMirageDragonBlockingTraps(duel: Duel, isPlayer1: boolean): boolean {
    // MirageDragon só bloqueia traps durante a Fase de Batalha
    const currentPhase = duel.currentPhase as string;
    if (currentPhase !== TurnPhase.BATTLE && currentPhase !== 'BATTLE') {
      return false;
    }
    
    // O oponente do jogador que está tentando ativar a trap
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    if (!opponentField || !opponentField.monsters || !Array.isArray(opponentField.monsters)) {
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente (face-up)
    for (const monster of opponentField.monsters) {
      if (monster && monster !== null) {
        const monsterId = monster.idCarta || monster.id || monster.cardId;
        const monsterName = (monster.name || monster.cardName || '').toLowerCase();
        const monsterPosition = monster.position || 'set';
        
        // MirageDragon deve estar face-up (attack ou defense)
        if ((monsterPosition === 'attack' || monsterPosition === 'defense') &&
            (this.isExactCard(monster, 'MirageDragon') ||
             monsterId === 'MirageDragon' ||
             monsterId === 'miragedragon' ||
             (typeof monsterId === 'string' && monsterId.toLowerCase().includes('miragedragon')) ||
             monsterName === 'mirage dragon' ||
             monsterName.includes('miragedragon'))) {
          logger.info(`🐉 [isMirageDragonBlockingTraps] MirageDragon encontrado no campo do oponente - traps bloqueadas durante Fase de Batalha`);
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Verifica e ativa Mirror Force do oponente se as condições forem atendidas
   * Condições: oponente tem Mirror Force setada E um monstro está atacando
   * Destrói todos os monstros do atacante que estão em modo de ataque
   * Retorna true se Mirror Force foi ativada, false caso contrário
   */
  private async checkAndActivateMirrorForce(duelId: string | number, duel: Duel, isPlayer1: boolean): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Verificar se Jinzo está no campo - se estiver, traps não podem ser ativadas
    if (this.isJinzoOnField(duel)) {
      logger.info(`🤖 [checkAndActivateMirrorForce] Jinzo está no campo - Mirror Force não pode ser ativada`);
      return false;
    }
    
    // Verificar se MirageDragon está no campo do oponente durante a Fase de Batalha
    // isPlayer1 = jogador que está atacando (atacante)
    // O oponente (defensor) está tentando ativar a trap, então passamos !isPlayer1
    if (this.isMirageDragonBlockingTraps(duel, !isPlayer1)) {
      logger.info(`🐉 [checkAndActivateMirrorForce] MirageDragon está no campo do atacante - Mirror Force não pode ser ativada durante Fase de Batalha`);
      return false;
    }
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
      return false;
    }

    // Verificar se o oponente tem Mirror Force setada (face-down)
    let mirrorForceZoneIndex = -1;
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      const trap = opponentField.spellTrap[i];
      if (trap && trap !== null) {
        const trapId = trap.idCarta || trap.id || trap.cardId;
        const trapName = (trap.name || trap.cardName || '').toLowerCase();
        const trapPosition = trap.position || 'set';
        
        const isMirrorForce = this.isExactCard(trap, 'MirrorForce');
        
        // Mirror Force deve estar setada (face-down)
        if (isMirrorForce && trapPosition === 'set') {
          mirrorForceZoneIndex = i;
          logger.info(`🪞 [checkAndActivateMirrorForce] Mirror Force encontrada na zona ${i} do oponente`);
          break;
        }
      }
    }

    if (mirrorForceZoneIndex === -1) {
      return false; // Não há Mirror Force setada
    }

    logger.info(`💥 [checkAndActivateMirrorForce] Mirror Force ativada! Destruindo todos os monstros do atacante em modo de ataque`);

    // Destruir todos os monstros do atacante que estão em modo de ataque
    if (!attackerField || !attackerField.monsters || !Array.isArray(attackerField.monsters)) {
      return false;
    }

    let destroyedCount = 0;
    const monstersToDestroy: any[] = [];

    // Coletar todos os monstros em modo de ataque
    for (let i = 0; i < attackerField.monsters.length; i++) {
      const monster = attackerField.monsters[i];
      if (monster && monster !== null && monster.position === 'attack') {
        monstersToDestroy.push({ monster, zoneIndex: i });
      }
    }

    // Destruir os monstros coletados
    for (const { monster, zoneIndex } of monstersToDestroy) {
      // Verificar se o monstro tinha equipamento antes de destruir
      await this.handleEquipmentDestruction(duelId, duel, isPlayer1, monster);
      
      // Mover para o cemitério
      if (!attackerField.graveyard) {
        attackerField.graveyard = [];
      }
      attackerField.graveyard.push(monster);
      attackerField.monsters[zoneIndex] = null;
      destroyedCount++;
      logger.info(`💥 [checkAndActivateMirrorForce] ${monster.name || monster.cardName} destruído`);
    }

    // Recalcular UnitedWeStand para ambos os jogadores se monstros foram destruídos
    if (destroyedCount > 0) {
      await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
    }

    if (destroyedCount === 0) {
      logger.info(`ℹ️ [checkAndActivateMirrorForce] Mirror Force ativada, mas não havia monstros em modo de ataque para destruir`);
    } else {
      logger.info(`✅ [checkAndActivateMirrorForce] Mirror Force destruiu ${destroyedCount} monstro(s) em modo de ataque`);
    }

    // Mover Mirror Force para o cemitério do oponente
    const mirrorForce = opponentField.spellTrap[mirrorForceZoneIndex];
    if (mirrorForce) {
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(mirrorForce);
      opponentField.spellTrap[mirrorForceZoneIndex] = null;
      logger.info(`✅ [checkAndActivateMirrorForce] Mirror Force movida para o cemitério do oponente após ativação`);
    }

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return true; // Mirror Force foi ativada
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
          const isSwords = this.isExactCard(spellTrap, 'SwordsOfRevealingLight');
          
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
              // Se ativou no turnCounter X no turno T, e estamos no turnCounter Y no turno O (oponente),
              // precisamos contar quantas vezes o oponente jogou desde então
              
              // Se ativou no turno do Player1 (turn=1), o primeiro turno do Player2 (turn=2) é turnCounter+1
              // O 3º turno do Player2 seria quando turnCounter = activationTurnCounter + 3
              // Mas como alterna, se ativou no turnCounter X no turno 1:
              // - TurnCounter X+1: turno 2 (Player2) - 1º turno do oponente
              // - TurnCounter X+2: turno 1 (Player1)
              // - TurnCounter X+3: turno 2 (Player2) - 2º turno do oponente
              // - TurnCounter X+4: turno 1 (Player1)
              // - TurnCounter X+5: turno 2 (Player2) - 3º turno do oponente
              
              // Fórmula: se ativou no turnCounter X no turno T, e estamos no turnCounter Y no turno O:
              // - Se T=1 e O=2: turnos do oponente = (Y - X + 1) / 2 (arredondado para cima)
              // - Se T=2 e O=1: turnos do oponente = (Y - X + 1) / 2 (arredondado para cima)
              
              // Simplificação: se a diferença de turnCounter é >= 5 e estamos no turno do oponente,
              // garantimos que pelo menos 3 turnos do oponente passaram
              const turnsSinceActivation = currentTurnCounter - activationTurnCounter;
              
              // Se ativou no turno 1 e estamos no turno 2: turnos do oponente = Math.ceil((turnsSinceActivation + 1) / 2)
              // Se ativou no turno 2 e estamos no turno 1: turnos do oponente = Math.ceil((turnsSinceActivation + 1) / 2)
              const opponentTurnsSinceActivation = Math.ceil((turnsSinceActivation + 1) / 2);
              
              if (opponentTurnsSinceActivation >= 3) {
                logger.info(`🗡️ [checkAndDestroySwordsOfRevealingLight] Destruindo SwordsOfRevealingLight - ativada no turnCounter ${activationTurnCounter}, atual: ${currentTurnCounter}, turnos desde ativação: ${turnsSinceActivation}`);
                
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
                
                logger.info(`✅ [checkAndDestroySwordsOfRevealingLight] SwordsOfRevealingLight destruída após 3 turnos do oponente`);
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
          const isSwords = this.isExactCard(spellTrap, 'SwordsOfRevealingLight');
          
          if (isSwords && spellTrap.activationTurnCounter && spellTrap.activatedByPlayer1 !== undefined) {
            const activationTurnCounter = spellTrap.activationTurnCounter;
            const activationTurn = spellTrap.activationTurn;
            const activatedByPlayer1 = spellTrap.activatedByPlayer1;
            const opponentTurn = activatedByPlayer1 ? 2 : 1;
            
            if (currentTurn === opponentTurn && duel.currentPhase === TurnPhase.END) {
              const turnsSinceActivation = currentTurnCounter - activationTurnCounter;
              const opponentTurnsSinceActivation = Math.ceil((turnsSinceActivation + 1) / 2);
              
              if (opponentTurnsSinceActivation >= 3) {
                logger.info(`🗡️ [checkAndDestroySwordsOfRevealingLight] Destruindo SwordsOfRevealingLight - ativada no turnCounter ${activationTurnCounter}, atual: ${currentTurnCounter}, turnos desde ativação: ${turnsSinceActivation}`);
                
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
                
                logger.info(`✅ [checkAndDestroySwordsOfRevealingLight] SwordsOfRevealingLight destruída após 3 turnos do oponente`);
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
    
    // SEMPRE buscar do banco diretamente (não usar cache) para garantir estado mais recente
    logger.info(`🔍 [normalSummonMonster] Buscando duelo diretamente do banco (ignorando cache)...`);
    let duel: Duel | null = null;
    
    try {
      // Buscar diretamente do banco usando query builder
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
      
      logger.info(`✅ [normalSummonMonster] Duelo encontrado no banco - player1Id: ${duel.player1Id} (tipo: ${typeof duel.player1Id}), player2Id: ${duel.player2Id} (tipo: ${typeof duel.player2Id}), currentTurn: ${duel.currentTurn}`);
      
      // Atualizar cache com dados do banco
      this.activeDuels.set(duelIdStr, duel);
    } catch (error) {
      logger.error(`❌ [normalSummonMonster] Erro ao buscar duelo do banco:`, error);
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

    // Verificar se já fez invocação normal neste turno
    if (playerField.normalSummonUsed === true) {
      return { success: false, message: 'Você já usou sua invocação normal neste turno' };
    }

    // Buscar a carta na mão
    const cardIndex = playerField.hand.findIndex((c: any) => c.idCarta === cardId || c.id === cardId || c.cardId === cardId);
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
        // Não pode tributar o mesmo monstro que está sendo invocado (se já estiver no campo)
        if (tributeIndex === zoneIndex && playerField.monsters[zoneIndex] !== null) {
          return { success: false, message: 'Não pode tributar o monstro na mesma zona onde está invocando' };
        }
      }
    } else {
      // Nível 4 ou menos não precisa de tributo
      if (tributeZoneIndices && tributeZoneIndices.length > 0) {
        return { success: false, message: 'Monstros de nível 4 ou menos não precisam de tributo' };
      }
    }

    // Verificar se a zona está ocupada
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    if (playerField.monsters[zoneIndex] !== null && playerField.monsters[zoneIndex] !== undefined) {
      return { success: false, message: 'Esta zona de monstro já está ocupada' };
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
      attacksThisTurn: 0 // Inicializar contador de ataques
    };
    
    logger.info(`✅ [normalSummonMonster] Monstro invocado:`, {
      name: cardToSummon.name,
      position: finalPosition,
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      currentTurnCounter: currentTurnCounter,
      zoneIndex: zoneIndex
    });
    
    // AGORA remover os monstros tributados (enviar para o cemitério) DEPOIS de colocar a carta
    if (requiredTributes > 0 && tributeZoneIndices) {
      for (const tributeIndex of tributeZoneIndices) {
        const tributedMonster = playerField.monsters[tributeIndex];
        if (tributedMonster) {
          // IMPORTANTE: Verificar se o monstro tinha equipamento ANTES de remover do campo
          await this.handleEquipmentDestruction(duelId, duel, isPlayer1, tributedMonster);
          
          // Adicionar ao cemitério
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(tributedMonster);
          // Remover do campo
          playerField.monsters[tributeIndex] = null;
          logger.info(`🔄 [normalSummonMonster] Monstro ${tributedMonster.name} tributado e enviado ao cemitério`);
        }
      }
    }
    
    // Marcar que já usou invocação normal neste turno
    playerField.normalSummonUsed = true;

    // Verificar efeito de Breaker The Magical Warrior (invocado por invocação normal)
    const breakerCardId = cardToSummon.idCarta || cardToSummon.id || cardToSummon.cardId || '';
    const isBreaker = this.isExactCard(cardToSummon, 'BreakerTheMagicalWarrior');
    
    if (isBreaker) {
      logger.info(`✨ [normalSummonMonster] Breaker The Magical Warrior invocado por invocação normal - adicionando Marcador de Magia`);
      
      // Adicionar 1 Marcador de Magia (máx. 1)
      if (!playerField.monsters[zoneIndex].spellCounters) {
        playerField.monsters[zoneIndex].spellCounters = 0;
      }
      playerField.monsters[zoneIndex].spellCounters = Math.min(1, (playerField.monsters[zoneIndex].spellCounters || 0) + 1);
      
      // Calcular e aplicar bônus de ATK (300 por marcador)
      const spellCounters = playerField.monsters[zoneIndex].spellCounters || 0;
      const atkBonus = spellCounters * 300;
      playerField.monsters[zoneIndex].spellCounterBonusAtk = atkBonus;
      
      logger.info(`✨ [normalSummonMonster] Breaker: ${spellCounters} Marcador(es) de Magia adicionado(s). Bônus de ATK: +${atkBonus}`);
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

    // Verificar Trap Hole do oponente se invocou em ataque
    if (finalPosition === 'attack') {
      // Verificar se é ChaosSorcerer - não pode ser invocado normalmente
      const cardId = cardToSummon.idCarta || cardToSummon.id || cardToSummon.cardId;
      const cardName = (cardToSummon.name || cardToSummon.cardName || '').toLowerCase();
      const isChaosSorcerer = this.isExactCard(cardToSummon, 'ChaosSorcerer');
      
      if (isChaosSorcerer) {
        return { success: false, message: 'ChaosSorcerer não pode ser invocado por invocação normal. Use invocação especial banindo 1 monstro LIGHT e 1 monstro DARK do cemitério.' };
      }

      const monsterAtk = cardToSummon.atk || 0;
      if (monsterAtk >= 1000) {
        await this.checkAndActivateTrapHole(duelId, duel, isPlayer1, zoneIndex, cardToSummon);
      }
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
    
    // Buscar duelo do banco
    let duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
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
    };
    
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
        currentTurnCounter: currentTurnCounter
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
    if (summonedTurnNumber != null && summonedByPlayer != null) {
      const isSamePlayer = (isPlayer1 && summonedByPlayer === 1) || (!isPlayer1 && summonedByPlayer === 2);
      const isSameTurn = summonedTurnNumber === currentTurnCounter;
      
      logger.info(`   - É o mesmo jogador? ${isSamePlayer}`);
      logger.info(`   - É o mesmo turno global? ${isSameTurn}`);
      
      if (isSamePlayer && isSameTurn) {
        logger.info(`❌ [changeMonsterPosition] Bloqueado: monstro foi invocado no turno ${summonedTurnNumber} pelo mesmo jogador (${summonedByPlayer}), turno atual: ${currentTurnCounter}`);
        return { success: false, message: 'Você não pode mudar a posição de um monstro no mesmo turno em que foi invocado' };
      }
      
      const diff = currentTurnCounter - summonedTurnNumber;
      logger.info(`✅ [changeMonsterPosition] Monstro foi invocado no turno ${summonedTurnNumber} pelo jogador ${summonedByPlayer}, turno atual é ${currentTurnCounter} (diferença: ${diff}). PERMITINDO mudança de posição.`);
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
      
      // Verificar Trap Hole do oponente quando vira de face-down para face-up
      const monsterAtk = monster.atk || 0;
      if (monsterAtk >= 1000) {
        const wasDestroyed = await this.checkAndActivateTrapHole(duelId, duel, isPlayer1, zoneIndex, monster);
        if (wasDestroyed) {
          // Se foi destruído, não precisa processar mais nada
          return { success: true };
        }
      }
      
      // Verificar se é Fiber Jar ou SnowmanEater e processar efeito de flip
      if (this.isExactCard(monster, 'FiberJar') || this.isExactCard(monster, 'SnowmanEater')) {
        await this.processFlipEffect(duelIdStr, duel, isPlayer1, monster, zoneIndex);
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
    
    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);
    
    logger.info(`✅ [changeMonsterPosition] Player ${isPlayer1 ? 1 : 2} mudou posição do monstro ${monster.name} de ${currentPosition} para ${monster.position}`);
    
    return { success: true };
  }

  async placeCardOnField(duelId: string | number, userId: number, cardId: string, zoneIndex: number, position: 'attack' | 'defense' | 'face-up' | 'set', cardType?: string): Promise<{ success: boolean; message?: string }> {
    logger.info(`🚀 [placeCardOnField] INICIANDO - duelId: ${duelId}, userId: ${userId}, cardId: ${cardId}, zoneIndex: ${zoneIndex}, position: ${position}, cardType: ${cardType}`);
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // SEMPRE buscar do banco diretamente (não usar cache) para garantir estado mais recente
    logger.info(`🔍 [placeCardOnField] Buscando duelo diretamente do banco (ignorando cache)...`);
    let duel: Duel | null = null;
    
    try {
      // Buscar diretamente do banco usando query builder
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
      
      logger.info(`✅ [placeCardOnField] Duelo encontrado no banco - player1Id: ${duel.player1Id} (tipo: ${typeof duel.player1Id}), player2Id: ${duel.player2Id} (tipo: ${typeof duel.player2Id}), currentTurn: ${duel.currentTurn}`);
      
      // Atualizar cache com dados do banco
      this.activeDuels.set(duelIdStr, duel);
    } catch (error) {
      logger.error(`❌ [placeCardOnField] Erro ao buscar duelo do banco:`, error);
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
              matchedByName: isSameCardByName
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
    let cardToPlace;
    if (cardIsOnField) {
      // Carta já está no campo, apenas mudar posição
      cardToPlace = { ...card, position: 'face-up' };
      playerField.spellTrap[zoneIndex] = cardToPlace;
      logger.info(`✅ [placeCardOnField] Carta ${card.name || card.cardName} ativada no campo (mudou de 'set' para 'face-up')`);
      // Garantir que isMonster está correto para cartas no campo
      const cardTypeFromCard = card.type || card.cardType;
      if (cardTypeFromCard && !isMonster && !isSpellOrTrap) {
        // Se o tipo não foi determinado corretamente, usar o tipo da carta
        logger.info(`⚠️ [placeCardOnField] Tipo não determinado, usando tipo da carta: ${cardTypeFromCard}`);
      }
    } else {
      // Remover carta da mão e colocar no campo no slot específico
      cardToPlace = playerField.hand.splice(cardIndex, 1)[0];
      
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
      
      // Salvar no slot específico
      playerField.spellTrap[zoneIndex] = { ...cardToPlace, position };
      logger.info(`✅ [placeCardOnField] Player ${isPlayer1 ? 1 : 2} colocou spell/trap ${cardToPlace.name} na zona ${zoneIndex} em ${position}`);
      logger.info(`🔍 [placeCardOnField] Estado dos spellTrap após salvar:`, playerField.spellTrap.map((s: any, i: number) => ({ index: i, card: s?.name || 'null', position: s?.position || 'null' })));
      
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
      if (!isMonster && position === 'face-up') {
        logger.info(`✨ [placeCardOnField] Processando efeito da carta ${cardToPlace.name || cardToPlace.cardName} (${cardToPlace.idCarta || cardToPlace.id || cardToPlace.cardId})`);
        logger.info(`🔍 [placeCardOnField] Detalhes da ativação:`, {
          cardName: cardToPlace.name || cardToPlace.cardName,
          cardId: cardToPlace.idCarta || cardToPlace.id || cardToPlace.cardId,
          cardType: cardToPlace.type || cardToPlace.cardType,
          isMonster: isMonster,
          position: position,
          cardIsOnField: cardIsOnField,
          zoneIndex: zoneIndex
        });
        await this.processCardEffect(duelIdStr, duel, isPlayer1, cardToPlace, zoneIndex);
        logger.info(`✅ [placeCardOnField] Efeito processado para ${cardToPlace.name || cardToPlace.cardName}`);
        
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
    
    return { success: true };
  }

  /**
   * Processa efeitos de cartas quando ativadas
   */
  private async processCardEffect(duelId: string, duel: Duel, isPlayer1: boolean, card: any, zoneIndex: number, selectedMonsterZoneIndex?: number): Promise<void> {
    try {
      const cardId = card.idCarta || card.id || card.cardId;
      const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
      
      // IMPORTANTE: Spells Equip devem permanecer no campo até serem destruídas ou o monstro equipado for destruído
      // Verificar se é uma spell Equip - se for, não remover do campo automaticamente
      const cardType = card.type || card.cardType;
      const spellType = card.spellType;
      const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                           (cardId && (
                             cardId.toString().toLowerCase().includes('unitedwestand') ||
                             cardId.toString().toLowerCase().includes('magepower') ||
                             cardId.toString().toLowerCase().includes('hornoftheunicorn') ||
                             cardId.toString().toLowerCase().includes('malevolentnuzzler') ||
                             cardId.toString().toLowerCase().includes('equip')
                           ));
      
      // Se for spell Equip, garantir que permaneça no campo (não remover automaticamente)
      // Spells Equip só são removidas quando:
      // 1. O monstro equipado é destruído (tratado em handleEquipmentDestruction)
      // 2. A spell é destruída diretamente (tratado em handleEquipmentDestruction)
      if (isEquipSpell) {
        logger.info(`🔧 [processCardEffect] Spell Equip detectada (${card.name || card.cardName || cardId}) - permanecerá no campo`);
        // Continuar processando efeito, mas não remover do campo
      }
      
      // Upstart Goblin - Comprar 1 carta e aumentar LP do oponente em 1000
      if (cardId === 'UpstartGoblin') {
        logger.info(`✨ [processCardEffect] Processando efeito de Upstart Goblin`);
        
        // Comprar 1 carta
        await this.drawCard(duelId, userId);
        
        // Aumentar LP do oponente em 1000
        const opponentId = isPlayer1 ? duel.player2Id : duel.player1Id;
        if (isPlayer1) {
          duel.player2LifePoints = (duel.player2LifePoints || 0) + 1000;
          logger.info(`✅ [processCardEffect] Upstart Goblin: LP do oponente aumentado para ${duel.player2LifePoints}`);
        } else {
          duel.player1LifePoints = (duel.player1LifePoints || 0) + 1000;
          logger.info(`✅ [processCardEffect] Upstart Goblin: LP do oponente aumentado para ${duel.player1LifePoints}`);
        }
        
        logger.info(`✅ [processCardEffect] Upstart Goblin: Jogador comprou 1 carta e oponente ganhou 1000 LP`);
        
        // Buscar duelo atualizado após comprar carta
        const updatedDuel = await this.findDuelByIdFromDatabase(duelId);
        if (updatedDuel) {
          // Atualizar referência do duelo mantendo os LP atualizados
          updatedDuel.player1LifePoints = duel.player1LifePoints;
          updatedDuel.player2LifePoints = duel.player2LifePoints;
          Object.assign(duel, updatedDuel);
        }
        
        // Mover Upstart Goblin para o cemitério após ativação (spell normal)
        // IMPORTANTE: Não remover se for spell Equip (já verificado no início da função)
        if (!isEquipSpell) {
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const activatedCard = playerField.spellTrap[zoneIndex];
            
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(activatedCard);
            playerField.spellTrap[zoneIndex] = null;
            
            logger.info(`✅ [processCardEffect] Upstart Goblin movida para o cemitério após ativação`);
          }
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // Pot of Greed - Comprar 2 cartas
      if (cardId === 'PotOfGreed') {
        logger.info(`✨ [processCardEffect] Processando efeito de Pot of Greed`);
        
        // Comprar 2 cartas
        for (let i = 0; i < 2; i++) {
          await this.drawCard(duelId, userId);
        }
        
        logger.info(`✅ [processCardEffect] Pot of Greed: Jogador comprou 2 cartas`);
        
        // Buscar duelo atualizado após comprar cartas
        const updatedDuel = await this.findDuelByIdFromDatabase(duelId);
        if (updatedDuel) {
          // Atualizar referência do duelo
          Object.assign(duel, updatedDuel);
        }
        
        // Mover Pot of Greed para o cemitério após ativação (spell normal)
        // IMPORTANTE: Não remover se for spell Equip (já verificado no início da função)
        if (!isEquipSpell) {
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const activatedCard = playerField.spellTrap[zoneIndex];
            
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(activatedCard);
            playerField.spellTrap[zoneIndex] = null;
            
            logger.info(`✅ [processCardEffect] Pot of Greed movida para o cemitério após ativação`);
          }
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // Hinotama - Causa 500 de dano ao oponente
      if (cardId === 'Hinotama' || cardId.toLowerCase().includes('hinotama')) {
        logger.info(`✨ [processCardEffect] Processando efeito de Hinotama`);
        
        // Causar 500 de dano ao oponente
        const damage = 500;
        if (isPlayer1) {
          duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
          logger.info(`💥 [processCardEffect] Hinotama: ${damage} de dano causado ao Player2. LP restantes: ${duel.player2LifePoints}`);
        } else {
          duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
          logger.info(`💥 [processCardEffect] Hinotama: ${damage} de dano causado ao Player1. LP restantes: ${duel.player1LifePoints}`);
        }
        
        // Verificar se o duelo terminou
        if (duel.player1LifePoints <= 0) {
          await this.finishDuel(duelId, DuelResult.PLAYER2_WIN, isPlayer1 ? duel.player2Id : duel.player1Id);
        } else if (duel.player2LifePoints <= 0) {
          await this.finishDuel(duelId, DuelResult.PLAYER1_WIN, isPlayer1 ? duel.player1Id : duel.player2Id);
        }
        
        // Mover Hinotama para o cemitério após ativação (spell normal)
        // IMPORTANTE: Não remover se for spell Equip (já verificado no início da função)
        if (!isEquipSpell) {
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const activatedCard = playerField.spellTrap[zoneIndex];
            
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(activatedCard);
            playerField.spellTrap[zoneIndex] = null;
            
            logger.info(`✅ [processCardEffect] Hinotama movida para o cemitério após ativação`);
          }
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // Heavy Storm - Destruir todas as spell/trap de ambos os jogadores
      if (cardId === 'HeavyStorm') {
        logger.info(`✨ [processCardEffect] Processando efeito de Heavy Storm`);
        
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        let totalDestroyed = 0;
        
        // Função auxiliar para destruir todas as spells/traps de um campo
        const destroyAllSpellTraps = async (field: any, isPlayer1Field: boolean) => {
          if (!field || !field.spellTrap) return 0;
          
          // Garantir que spellTrap seja um array de 5 elementos
          if (!Array.isArray(field.spellTrap)) {
            field.spellTrap = [null, null, null, null, null];
          }
          while (field.spellTrap.length < 5) {
            field.spellTrap.push(null);
          }
          field.spellTrap = field.spellTrap.slice(0, 5);
          
          // Inicializar cemitério se não existir
          if (!field.graveyard) {
            field.graveyard = [];
          }
          
          // CRÍTICO: Coletar todas as cartas a serem destruídas ANTES de iterar
          // Isso evita problemas de mutação durante a iteração
          const cardsToDestroy: Array<{ card: any; zoneIndex: number }> = [];
          for (let i = 0; i < field.spellTrap.length; i++) {
            const card = field.spellTrap[i];
            if (card !== null && card !== undefined) {
              cardsToDestroy.push({ card, zoneIndex: i });
            }
          }
          
          logger.info(`💥 [processCardEffect] Heavy Storm - Encontradas ${cardsToDestroy.length} spell/trap(s) para destruir`);
          
          if (cardsToDestroy.length === 0) {
            return 0;
          }
          
          // Processar efeitos especiais primeiro (antes de destruir)
          for (const { card, zoneIndex } of cardsToDestroy) {
            const cardName = card.name || card.cardName || 'Desconhecida';
            
            // Processar efeitos especiais antes de destruir
            if (this.isExactCard(card, 'ChangeOfHeart') || this.isExactCard(card, 'BrainControl')) {
              logger.info(`💥 [processCardEffect] ${cardName} destruída - devolvendo monstros controlados`);
              await this.returnChangeOfHeartMonsters(duelId, duel, isPlayer1Field);
            } else if (this.isExactCard(card, 'UnitedWeStand') || this.isExactCard(card, 'MagePower')) {
              logger.info(`💥 [processCardEffect] ${cardName} destruída - removendo equipamento`);
              await this.handleEquipmentDestruction(duelId, duel, isPlayer1Field, undefined, card, zoneIndex);
            }
          }
          
          // Recalcular ATK do MagePower uma única vez após processar todos os efeitos especiais
          await this.recalculateMagePowerAtk(duelId, duel, isPlayer1Field);
          
          // Agora destruir todas as cartas: Mover para o cemitério e limpar a zona
          let destroyed = 0;
          for (const { card, zoneIndex } of cardsToDestroy) {
            const cardName = card.name || card.cardName || 'Desconhecida';
            logger.info(`💥 [processCardEffect] Heavy Storm - Destruindo ${cardName} (zona ${zoneIndex})`);
            
            // CRÍTICO: Primeiro mover para o cemitério
            field.graveyard.push(card);
            
            // CRÍTICO: Depois limpar a zona do campo (remover do campo)
            field.spellTrap[zoneIndex] = null;
            
            destroyed++;
            logger.info(`✅ [processCardEffect] ${cardName} removida do campo e movida para o cemitério (zona ${zoneIndex} agora está vazia)`);
          }
          
          // Verificar se todas as cartas foram realmente removidas
          const remainingCards = field.spellTrap.filter((c: any) => c !== null && c !== undefined).length;
          if (remainingCards > 0) {
            logger.warn(`⚠️ [processCardEffect] Heavy Storm - Ainda há ${remainingCards} carta(s) no campo após destruição!`);
            // Forçar remoção de qualquer carta restante
            for (let i = 0; i < field.spellTrap.length; i++) {
              if (field.spellTrap[i] !== null && field.spellTrap[i] !== undefined) {
                const remainingCard = field.spellTrap[i];
                field.graveyard.push(remainingCard);
                field.spellTrap[i] = null;
                logger.info(`🔧 [processCardEffect] Heavy Storm - Forçando remoção de carta restante da zona ${i}`);
              }
            }
          }
          
          return destroyed;
        };
        
        // Destruir todas as spell/trap do jogador
        const playerDestroyed = await destroyAllSpellTraps(playerField, isPlayer1);
        totalDestroyed += playerDestroyed;
        logger.info(`📊 [processCardEffect] Heavy Storm - ${playerDestroyed} spell/trap(s) destruída(s) do jogador`);
        
        // Destruir todas as spell/trap do oponente
        const opponentDestroyed = await destroyAllSpellTraps(opponentField, !isPlayer1);
        totalDestroyed += opponentDestroyed;
        logger.info(`📊 [processCardEffect] Heavy Storm - ${opponentDestroyed} spell/trap(s) destruída(s) do oponente`);
        
        // Verificar se o Heavy Storm também precisa ser destruído (se ainda estiver no campo)
        const heavyStormZone = playerField?.spellTrap?.[zoneIndex];
        if (heavyStormZone) {
          const heavyStormCardId = heavyStormZone.idCarta || heavyStormZone.id || heavyStormZone.cardId;
          if (heavyStormCardId === 'HeavyStorm') {
            logger.info(`💥 [processCardEffect] Heavy Storm também será destruído (zona ${zoneIndex})`);
            if (!playerField.graveyard) playerField.graveyard = [];
            playerField.graveyard.push(heavyStormZone);
            playerField.spellTrap[zoneIndex] = null;
            totalDestroyed++;
            logger.info(`✅ [processCardEffect] Heavy Storm removido do campo e movido para o cemitério`);
          }
        }
        
        if (totalDestroyed > 0) {
          logger.info(`✅ [processCardEffect] Heavy Storm destruiu ${totalDestroyed} spell/trap(s) de ambos os jogadores - todas foram removidas do campo e enviadas para o cemitério`);
        } else {
          logger.info(`ℹ️ [processCardEffect] Heavy Storm - Nenhuma spell/trap no campo para destruir`);
        }
        
        // Verificar se todas as cartas foram realmente removidas do campo
        const remainingPlayer = (playerField?.spellTrap || []).filter((c: any) => c !== null && c !== undefined).length;
        const remainingOpponent = (opponentField?.spellTrap || []).filter((c: any) => c !== null && c !== undefined).length;
        logger.info(`🔍 [processCardEffect] Heavy Storm - Verificação final: ${remainingPlayer} spell/trap(s) restante(s) do jogador, ${remainingOpponent} do oponente`);
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // Mystical Space Typhoon - Escolher 1 Spell/Trap no campo e destruir
      const isMysticalSpaceTyphoon = this.isExactCard(card, 'MysticalSpaceTyphoon');
      
      if (isMysticalSpaceTyphoon) {
        logger.info(`✨ [processCardEffect] Processando efeito de Mystical Space Typhoon - aguardando seleção de alvo`);
        
        // Verificar se há spell/trap no campo (próprio ou oponente)
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        // Garantir arrays válidos
        if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
          playerField.spellTrap = [null, null, null, null, null];
        }
        if (!opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
          opponentField.spellTrap = [null, null, null, null, null];
        }
        
        // Verificar se há pelo menos uma spell/trap no campo
        const playerSpellTraps = playerField.spellTrap.filter((s: any) => s !== null && s !== undefined);
        const opponentSpellTraps = opponentField.spellTrap.filter((s: any) => s !== null && s !== undefined);
        
        if (playerSpellTraps.length === 0 && opponentSpellTraps.length === 0) {
          logger.info(`⚠️ [processCardEffect] Nenhuma spell/trap no campo para Mystical Space Typhoon destruir`);
          // Mover Mystical Space Typhoon para o cemitério mesmo sem alvo
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const activatedCard = playerField.spellTrap[zoneIndex];
            if (!playerField.graveyard) playerField.graveyard = [];
            playerField.graveyard.push(activatedCard);
            playerField.spellTrap[zoneIndex] = null;
          }
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          this.activeDuels.set(duelId, duel);
          return;
        }
        
        // Criar pendingChoice para seleção de alvo
        await this.setPendingChoice(duelId, {
          type: 'MYSTICAL_SPACE_TYPHOON',
          userId: userId,
          data: {
            spellTrapZoneIndex: zoneIndex, // Zona onde está Mystical Space Typhoon
          },
          turnWhenStarted: duel.currentTurn,
          phaseWhenStarted: duel.currentPhase,
        });
        
        logger.info(`✅ [processCardEffect] PendingChoice criado para Mystical Space Typhoon`);
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // Raigeki - Destruir todos os monstros do adversário
      if (cardId === 'Raigeki') {
        logger.info(`✨ [processCardEffect] Processando efeito de Raigeki`);
        
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        if (!opponentField || !opponentField.monsters) {
          logger.info(`⚠️ [processCardEffect] Campo do adversário não encontrado`);
          return;
        }
        
        // Garantir que monsters seja um array de 5 elementos
        if (!Array.isArray(opponentField.monsters)) {
          opponentField.monsters = [null, null, null, null, null];
        }
        while (opponentField.monsters.length < 5) {
          opponentField.monsters.push(null);
        }
        opponentField.monsters = opponentField.monsters.slice(0, 5);
        
        // Inicializar cemitério se não existir
        if (!opponentField.graveyard) {
          opponentField.graveyard = [];
        }
        
        // Destruir todos os monstros do adversário
        const destroyedCards: any[] = [];
        for (let i = 0; i < opponentField.monsters.length; i++) {
          if (opponentField.monsters[i] !== null && opponentField.monsters[i] !== undefined) {
            const destroyedCard = opponentField.monsters[i];
            
            // Verificar se o monstro tinha equipamento antes de destruir
            await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, destroyedCard);
            
            destroyedCards.push(destroyedCard);
            opponentField.monsters[i] = null;
            
            // Mover para o cemitério
            opponentField.graveyard.push(destroyedCard);
            logger.info(`💥 [processCardEffect] Monstro destruído: ${destroyedCard.name || destroyedCard.cardName || 'Desconhecido'}`);
          }
        }
        
        // Recalcular UnitedWeStand para ambos os jogadores se monstros foram destruídos
        if (destroyedCards.length > 0) {
          await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
          logger.info(`✅ [processCardEffect] Raigeki destruiu ${destroyedCards.length} monstro(s) do adversário`);
        } else {
          logger.info(`ℹ️ [processCardEffect] Nenhum monstro do adversário para destruir`);
        }
        
        // Mover Raigeki para o cemitério após ativação (spell normal)
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const activatedCard = playerField.spellTrap[zoneIndex];
          
          // Inicializar cemitério se não existir
          if (!playerField.graveyard) {
            playerField.graveyard = [];
          }
          
          // Mover para o cemitério
          playerField.graveyard.push(activatedCard);
          playerField.spellTrap[zoneIndex] = null;
          
          logger.info(`✅ [processCardEffect] Raigeki movida para o cemitério após ativação`);
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }

      // Dark Hole - Destruir todos os monstros de ambos os jogadores
      if (this.isExactCard(card, 'DarkHole')) {
        logger.info(`✨ [processCardEffect] Processando efeito de Dark Hole`);
        
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        let totalDestroyed = 0;

        // Destruir todos os monstros do jogador
        if (playerField && playerField.monsters) {
          // Garantir que monsters seja um array de 5 elementos
          if (!Array.isArray(playerField.monsters)) {
            playerField.monsters = [null, null, null, null, null];
          }
          while (playerField.monsters.length < 5) {
            playerField.monsters.push(null);
          }
          playerField.monsters = playerField.monsters.slice(0, 5);
          
          // Inicializar cemitério se não existir
          if (!playerField.graveyard) {
            playerField.graveyard = [];
          }
          
          // Destruir todos os monstros do jogador
          for (let i = 0; i < playerField.monsters.length; i++) {
            if (playerField.monsters[i] !== null && playerField.monsters[i] !== undefined) {
              const destroyedCard = playerField.monsters[i];
              // Verificar se o monstro tinha equipamento antes de destruir
              await this.handleEquipmentDestruction(duelId, duel, isPlayer1, destroyedCard);
              playerField.monsters[i] = null;
              
              // Mover para o cemitério
              playerField.graveyard.push(destroyedCard);
              totalDestroyed++;
              logger.info(`💥 [processCardEffect] Monstro do jogador destruído: ${destroyedCard.name || destroyedCard.cardName || 'Desconhecido'}`);
            }
          }
        }

        // Destruir todos os monstros do oponente
        if (opponentField && opponentField.monsters) {
          // Garantir que monsters seja um array de 5 elementos
          if (!Array.isArray(opponentField.monsters)) {
            opponentField.monsters = [null, null, null, null, null];
          }
          while (opponentField.monsters.length < 5) {
            opponentField.monsters.push(null);
          }
          opponentField.monsters = opponentField.monsters.slice(0, 5);
          
          // Inicializar cemitério se não existir
          if (!opponentField.graveyard) {
            opponentField.graveyard = [];
          }
          
          // Destruir todos os monstros do oponente
          for (let i = 0; i < opponentField.monsters.length; i++) {
            if (opponentField.monsters[i] !== null && opponentField.monsters[i] !== undefined) {
              const destroyedCard = opponentField.monsters[i];
              // Verificar se o monstro tinha equipamento antes de destruir
              await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, destroyedCard);
              opponentField.monsters[i] = null;
              
              // Mover para o cemitério
              opponentField.graveyard.push(destroyedCard);
              totalDestroyed++;
              logger.info(`💥 [processCardEffect] Monstro do oponente destruído: ${destroyedCard.name || destroyedCard.cardName || 'Desconhecido'}`);
            }
          }
        }

        if (totalDestroyed > 0) {
          logger.info(`✅ [processCardEffect] Dark Hole destruiu ${totalDestroyed} monstro(s) de ambos os jogadores`);
        } else {
          logger.info(`ℹ️ [processCardEffect] Nenhum monstro para destruir`);
        }

        // Mover Dark Hole para o cemitério após ativação (spell normal)
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const activatedCard = playerField.spellTrap[zoneIndex];
          
          // Inicializar cemitério se não existir
          if (!playerField.graveyard) {
            playerField.graveyard = [];
          }
          
          // Mover para o cemitério
          playerField.graveyard.push(activatedCard);
          playerField.spellTrap[zoneIndex] = null;
          
          logger.info(`✅ [processCardEffect] Dark Hole movida para o cemitério após ativação`);
        }

        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);

        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // Harpie's Feather Duster - Destruir todas as spell/trap do adversário
      if (cardId === 'HarpiesFeatherDuster') {
        logger.info(`✨ [processCardEffect] Processando efeito de Harpie's Feather Duster`);
        
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        
        if (!opponentField || !opponentField.spellTrap) {
          logger.info(`⚠️ [processCardEffect] Campo do adversário não encontrado`);
          return;
        }
        
        // Verificar se a carta ainda está no campo antes de processar
        if (!playerField || !playerField.spellTrap || !playerField.spellTrap[zoneIndex]) {
          logger.info(`⚠️ [processCardEffect] Harpie's Feather Duster não encontrada no campo`);
          return;
        }
        
        const activatedCard = playerField.spellTrap[zoneIndex];
        const cardIdCheck = activatedCard.idCarta || activatedCard.id || activatedCard.cardId;
        
        if (cardIdCheck !== 'HarpiesFeatherDuster') {
          logger.info(`⚠️ [processCardEffect] Carta no campo não é Harpie's Feather Duster`);
          return;
        }
        
        // Garantir que spellTrap seja um array de 5 elementos
        if (!Array.isArray(opponentField.spellTrap)) {
          opponentField.spellTrap = [null, null, null, null, null];
        }
        while (opponentField.spellTrap.length < 5) {
          opponentField.spellTrap.push(null);
        }
        opponentField.spellTrap = opponentField.spellTrap.slice(0, 5);
        
        // Inicializar cemitério se não existir
        if (!opponentField.graveyard) {
          opponentField.graveyard = [];
        }
        
        // Destruir todas as spell/trap do adversário
        const destroyedCards: any[] = [];
        for (let i = 0; i < opponentField.spellTrap.length; i++) {
          if (opponentField.spellTrap[i] !== null && opponentField.spellTrap[i] !== undefined) {
            const destroyedCard = opponentField.spellTrap[i];
            const destroyedCardId = destroyedCard.idCarta || destroyedCard.id || destroyedCard.cardId;
            
            // Verificar se é ChangeOfHeart ou BrainControl - se for, devolver monstros controlados
            if (destroyedCardId === 'ChangeOfHeart' || 
                destroyedCardId === 'changeofheart' ||
                (typeof destroyedCardId === 'string' && destroyedCardId.toLowerCase().includes('changeofheart'))) {
              logger.info(`💥 [processCardEffect] ChangeOfHeart destruída por Harpie's Feather Duster - devolvendo monstros controlados`);
              const returnedCount = await this.returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
              logger.info(`✅ [processCardEffect] ${returnedCount} monstro(s) devolvido(s) após ChangeOfHeart ser destruída`);
              } else if (this.isExactCard(destroyedCard, 'BrainControl')) {
              logger.info(`💥 [processCardEffect] BrainControl destruída por Harpie's Feather Duster - devolvendo monstros controlados`);
              const returnedCount = await this.returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
              logger.info(`✅ [processCardEffect] ${returnedCount} monstro(s) devolvido(s) após BrainControl ser destruída`);
            } else if (this.isExactCard(destroyedCard, 'UnitedWeStand')) {
              logger.info(`💥 [processCardEffect] UnitedWeStand destruída por Harpie's Feather Duster - removendo equipamento`);
              await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, destroyedCard, i);
            } else if (this.isExactCard(destroyedCard, 'MagePower')) {
              logger.info(`💥 [processCardEffect] MagePower destruída por Harpie's Feather Duster - removendo equipamento`);
              await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, destroyedCard, i);
            } else {
              // Se outra spell/trap foi destruída, recalcular ATK do MagePower ANTES de remover
              await this.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
            }
            
            destroyedCards.push(destroyedCard);
            opponentField.spellTrap[i] = null;
            
            // Mover para o cemitério
            opponentField.graveyard.push(destroyedCard);
            logger.info(`💥 [processCardEffect] Spell/Trap destruída: ${destroyedCard.name || destroyedCard.cardName || 'Desconhecida'}`);
          }
        }
        
        if (destroyedCards.length > 0) {
          logger.info(`✅ [processCardEffect] Harpie's Feather Duster destruiu ${destroyedCards.length} spell/trap(s) do adversário`);
        } else {
          logger.info(`ℹ️ [processCardEffect] Nenhuma spell/trap do adversário para destruir`);
        }
        
        // Mover Harpie's Feather Duster para o cemitério após ativação (spell normal)
        // Verificar novamente se ainda está no campo
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const cardToMove = playerField.spellTrap[zoneIndex];
          const cardIdToMove = cardToMove.idCarta || cardToMove.id || cardToMove.cardId;
          
          // Verificar se é realmente a Harpie's Feather Duster
          if (cardIdToMove === 'HarpiesFeatherDuster') {
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(cardToMove);
            playerField.spellTrap[zoneIndex] = null;
            
            logger.info(`✅ [processCardEffect] Harpie's Feather Duster movida para o cemitério após ativação`);
          }
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // The Forceful Sentry - Ver mão do oponente e escolher uma carta para voltar ao deck
      // Este efeito requer interação do jogador, então apenas marcamos que precisa de escolha
      // O gateway emitirá um evento especial para o frontend
      if (cardId === 'TheForcefulSentry') {
        logger.info(`✨ [processCardEffect] The Forceful Sentry ativada - requer escolha do jogador`);
        // Retornar informações sobre o efeito que precisa de escolha
        // O gateway detectará isso e emitirá um evento especial
        return;
      }
      
      // Confiscation - Pagar 1000 LP, ver mão do oponente e escolher uma carta para ir ao cemitério
      if (cardId === 'Confiscation') {
        logger.info(`✨ [processCardEffect] Confiscation ativada - requer escolha do jogador`);
        // Reduzir 1000 LP do jogador
        if (isPlayer1) {
          duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - 1000);
          logger.info(`✅ [processCardEffect] Confiscation: Player 1 pagou 1000 LP. LP restante: ${duel.player1LifePoints}`);
        } else {
          duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - 1000);
          logger.info(`✅ [processCardEffect] Confiscation: Player 2 pagou 1000 LP. LP restante: ${duel.player2LifePoints}`);
        }
        
        // Verificar se o jogador perdeu por LP
        if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
          const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
          await this.finishDuel(duelId, duel.player1LifePoints <= 0 ? DuelResult.PLAYER2_WIN : DuelResult.PLAYER1_WIN, winnerId);
          return;
        }
        
        // Atualizar LP no banco
        await this.updateDuelInDatabase(duelId, {
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
        } as any);
        
        // Atualizar cache também
        this.activeDuels.set(duelId, duel);
        
        logger.info(`✅ [processCardEffect] Confiscation: LP atualizados no banco. O gateway deve emitir confiscationShowHand`);
        // O gateway detectará isso e emitirá um evento especial para mostrar a mão do oponente
        return;
      }
      
      // GracefulCharity - Comprar 3 cartas e depois descartar 2 cartas da mão
      if (cardId === 'GracefulCharity') {
        logger.info(`✨ [processCardEffect] GracefulCharity ativada - comprando 3 cartas e requerendo descarte de 2 cartas`);
        
        // Comprar 3 cartas
        for (let i = 0; i < 3; i++) {
          await this.drawCard(duelId, userId);
        }
        
        logger.info(`✅ [processCardEffect] GracefulCharity: Jogador comprou 3 cartas`);
        
        // Buscar duelo atualizado após comprar cartas
        const updatedDuel = await this.findDuelByIdFromDatabase(duelId);
        if (updatedDuel) {
          Object.assign(duel, updatedDuel);
        }
        
        // Mover GracefulCharity para o cemitério após ativação (spell normal)
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const activatedCard = playerField.spellTrap[zoneIndex];
          
          // Inicializar cemitério se não existir
          if (!playerField.graveyard) {
            playerField.graveyard = [];
          }
          
          // Mover para o cemitério
          playerField.graveyard.push(activatedCard);
          playerField.spellTrap[zoneIndex] = null;
          
          logger.info(`✅ [processCardEffect] GracefulCharity movida para o cemitério após ativação`);
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        
        logger.info(`✅ [processCardEffect] GracefulCharity: Cartas compradas. O gateway deve emitir gracefulCharityShowHand`);
        // O gateway detectará isso e emitirá um evento especial para mostrar a mão do jogador para descartar
        return;
      }

      // MonsterReborn - Reviver um monstro do cemitério (próprio ou do oponente)
      if (cardId === 'MonsterReborn') {
        logger.info(`✨ [processCardEffect] MonsterReborn ativada - requer escolha do jogador`);
        
        // Mover MonsterReborn para o cemitério após ativação (spell normal)
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const activatedCard = playerField.spellTrap[zoneIndex];
          
          // Inicializar cemitério se não existir
          if (!playerField.graveyard) {
            playerField.graveyard = [];
          }
          
          // Mover para o cemitério
          playerField.graveyard.push(activatedCard);
          playerField.spellTrap[zoneIndex] = null;
          
          logger.info(`✅ [processCardEffect] MonsterReborn movida para o cemitério após ativação`);
        }
        
        // Coletar monstros dos cemitérios (apenas monstros)
        const playerGraveyard = playerField?.graveyard || [];
        const opponentGraveyard = opponentField?.graveyard || [];
        
        const playerMonsters = playerGraveyard.filter((c: any) => {
          const cardType = c.type || c.cardType;
          return cardType === 'Monster';
        });
        
        const opponentMonsters = opponentGraveyard.filter((c: any) => {
          const cardType = c.type || c.cardType;
          return cardType === 'Monster';
        });
        
        // Se não houver monstros em nenhum cemitério, não precisa de escolha
        if (playerMonsters.length === 0 && opponentMonsters.length === 0) {
          logger.info(`ℹ️ [processCardEffect] MonsterReborn: Nenhum monstro nos cemitérios para reviver`);
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          this.activeDuels.set(duelId, duel);
          return;
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        
        logger.info(`✅ [processCardEffect] MonsterReborn: O gateway deve emitir monsterRebornShowGraveyards`);
        // O gateway detectará isso e emitirá um evento especial para mostrar os cemitérios
        return;
      }

      // ChangeOfHeart - Controlar um monstro do oponente durante o turno
      if (cardId === 'ChangeOfHeart') {
        logger.info(`✨ [processCardEffect] ChangeOfHeart ativada - requer escolha do jogador`);
        logger.info(`ℹ️ [processCardEffect] ChangeOfHeart permanecerá no campo até o turno acabar ou ser destruída`);
        
        // NÃO mover ChangeOfHeart para o cemitério imediatamente - ela fica no campo
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        // Coletar monstros do campo do oponente (qualquer posição: attack, defense ou set)
        const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
        (opponentField?.monsters || []).forEach((m: any, index: number) => {
          if (m && m !== null && m !== undefined) {
            // Pode controlar monstros em qualquer posição (attack, defense ou set)
            opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
          }
        });
        
        const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
          ...om.monster,
          zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
        }));
        
        // Se não houver monstros no campo do oponente, não precisa de escolha
        if (opponentMonsters.length === 0) {
          logger.info(`ℹ️ [processCardEffect] ChangeOfHeart: Nenhum monstro no campo do oponente para controlar`);
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
          this.activeDuels.set(duelId, duel);
          return;
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        
        // Salvar pending choice
        await this.setPendingChoice(duelId, {
          type: 'CHANGE_OF_HEART',
          userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
          turnWhenStarted: duel.currentTurn,
          phaseWhenStarted: duel.currentPhase || 'MAIN1',
          data: {
            opponentMonsters: opponentMonsters, // Já inclui zoneIndex em cada monstro
          }
        });
        
        logger.info(`✅ [processCardEffect] ChangeOfHeart: O gateway deve emitir changeOfHeartShowOpponentMonsters`);
        // O gateway detectará isso e emitirá um evento especial para mostrar os monstros do oponente
        return;
      }

      // BrainControl - Controlar um monstro face-up do oponente durante o turno (custo: 800 LP)
      if (this.isExactCard(card, 'BrainControl')) {
        logger.info(`✨ [processCardEffect] BrainControl ativada - requer escolha do jogador e pagamento de 800 LP`);
        logger.info(`ℹ️ [processCardEffect] BrainControl permanecerá no campo até o turno acabar ou ser destruída`);
        
        // Verificar se o jogador tem LP suficientes (800)
        const currentLP = isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints;
        if (currentLP < 800) {
          logger.info(`❌ [processCardEffect] BrainControl: Jogador não tem LP suficientes (${currentLP} < 800)`);
          // Mover BrainControl para o cemitério já que não pode ser usada
          const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
          if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
            const activatedCard = playerField.spellTrap[zoneIndex];
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            playerField.graveyard.push(activatedCard);
            playerField.spellTrap[zoneIndex] = null;
          }
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
            player1LifePoints: duel.player1LifePoints,
            player2LifePoints: duel.player2LifePoints,
          } as any);
          this.activeDuels.set(duelId, duel);
          return;
        }
        
        // Reduzir 800 LP do jogador
        if (isPlayer1) {
          duel.player1LifePoints = Math.max(0, duel.player1LifePoints - 800);
          logger.info(`✅ [processCardEffect] BrainControl: Player 1 pagou 800 LP. LP restante: ${duel.player1LifePoints}`);
        } else {
          duel.player2LifePoints = Math.max(0, duel.player2LifePoints - 800);
          logger.info(`✅ [processCardEffect] BrainControl: Player 2 pagou 800 LP. LP restante: ${duel.player2LifePoints}`);
        }
        
        // Verificar se o jogador perdeu por LP
        if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
          const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
          await this.updateDuelInDatabase(duelId, {
            status: 'FINISHED',
            winnerId: winnerId,
            player1LifePoints: duel.player1LifePoints,
            player2LifePoints: duel.player2LifePoints,
          } as any);
          this.activeDuels.set(duelId, duel);
          return;
        }
        
        // NÃO mover BrainControl para o cemitério imediatamente - ela fica no campo
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        // Coletar apenas monstros FACE-UP do campo do oponente (attack ou defense, NÃO set)
        const opponentMonstersWithIndices: Array<{ monster: any; zoneIndex: number }> = [];
        (opponentField?.monsters || []).forEach((m: any, index: number) => {
          if (m && m !== null && m !== undefined) {
            // Só pode controlar monstros face-up (attack ou defense, não set/face-down)
            const position = m.position || 'attack';
            if (position === 'attack' || position === 'defense') {
              opponentMonstersWithIndices.push({ monster: m, zoneIndex: index });
            }
          }
        });
        
        const opponentMonsters = opponentMonstersWithIndices.map((om: any) => ({
          ...om.monster,
          zoneIndex: om.zoneIndex, // Incluir zoneIndex no objeto do monstro
        }));
        
        // Se não houver monstros face-up no campo do oponente, não precisa de escolha
        if (opponentMonsters.length === 0) {
          logger.info(`ℹ️ [processCardEffect] BrainControl: Nenhum monstro face-up no campo do oponente para controlar`);
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
            player1LifePoints: duel.player1LifePoints,
            player2LifePoints: duel.player2LifePoints,
          } as any);
          this.activeDuels.set(duelId, duel);
          return;
        }
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
          player1LifePoints: duel.player1LifePoints,
          player2LifePoints: duel.player2LifePoints,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        
        // Salvar pending choice
        await this.setPendingChoice(duelId, {
          type: 'BRAIN_CONTROL',
          userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
          turnWhenStarted: duel.currentTurn,
          phaseWhenStarted: duel.currentPhase || 'MAIN1',
          data: {
            opponentMonsters: opponentMonsters, // Já inclui zoneIndex em cada monstro
          }
        });
        
        logger.info(`✅ [processCardEffect] BrainControl: O gateway deve emitir brainControlShowOpponentMonsters`);
        // O gateway detectará isso e emitirá um evento especial para mostrar os monstros do oponente
        return;
      }

      // UnitedWeStand - Magia de Equipamento: Escolher um monstro para equipar, ganha 800 ATK por cada monstro face-up no campo
      // IMPORTANTE: UnitedWeStand é uma spell Equip e DEVE permanecer no campo após ativação
      if (cardId === 'UnitedWeStand' || cardId === 'unitedwestand' || 
          (typeof cardId === 'string' && cardId.toLowerCase().includes('unitedwestand'))) {
        logger.info(`✨ [processCardEffect] UnitedWeStand ativada - spell Equip, permanecerá no campo`);
        
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        
        // GARANTIR que a carta está no campo e não será movida para o cemitério
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const cardOnField = playerField.spellTrap[zoneIndex];
          const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
          if (cardOnFieldId === cardId || String(cardOnFieldId) === String(cardId)) {
            // Garantir que a posição está como 'face-up' (ativada)
            cardOnField.position = 'face-up';
            logger.info(`✅ [processCardEffect] UnitedWeStand confirmada no campo na zona ${zoneIndex} em face-up`);
          }
        }
        
        if (!playerField || !playerField.monsters) {
          logger.info(`⚠️ [processCardEffect] Campo do jogador não encontrado`);
          return;
        }
        
        // Se o monstro já foi selecionado (via drag and drop), equipar diretamente
        if (selectedMonsterZoneIndex !== undefined && selectedMonsterZoneIndex !== null) {
          const chosenMonster = playerField.monsters[selectedMonsterZoneIndex];
          if (chosenMonster && (chosenMonster.position === 'attack' || chosenMonster.position === 'defense')) {
            // IMPORTANTE: Remover equipamento anterior antes de adicionar o novo
            // Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
            await this.removePreviousEquipment(duelId, duel, isPlayer1, chosenMonster);
            
            // Adicionar UnitedWeStand ao array de equips com referência única
            const cardId = card.idCarta || card.id || card.cardId;
            const uniqueEquipRef = `${cardId}:${zoneIndex}`;
            chosenMonster.equippedCards = [uniqueEquipRef];
            chosenMonster.equippedCardId = cardId;
            chosenMonster.equippedSpellTrapZoneIndex = zoneIndex;
            
            // Recalcular bônus total do equipamento
            chosenMonster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(chosenMonster, playerField);
            
            logger.info(`✅ [processCardEffect] UnitedWeStand equipada ao monstro na zona ${selectedMonsterZoneIndex}, bonus ATK: +${chosenMonster.equipmentBonusAtk}`);
            
            // Atualizar no banco e cache para garantir que o estado está salvo
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
            this.activeDuels.set(duelId, duel);
            
            return;
          }
        }
        
        // Se não foi selecionado via drag and drop, criar pending choice
        logger.info(`✨ [processCardEffect] UnitedWeStand ativada - requer escolha do monstro para equipar`);
        
        // Coletar todos os monstros face-up do jogador (attack ou defense, não set)
        const availableMonsters: any[] = [];
        playerField.monsters.forEach((monster: any, index: number) => {
          if (monster && (monster.position === 'attack' || monster.position === 'defense')) {
            availableMonsters.push({
              ...monster,
              zoneIndex: index
            });
          }
        });
        
        if (availableMonsters.length === 0) {
          logger.info(`⚠️ [processCardEffect] Nenhum monstro face-up disponível para equipar UnitedWeStand`);
          // Ainda assim, deixar a carta no campo (pode equipar depois quando houver monstros)
          return;
        }
        
        logger.info(`✅ [processCardEffect] UnitedWeStand: ${availableMonsters.length} monstro(s) disponível(is) para equipar`);
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        
        // Salvar pending choice
        await this.setPendingChoice(duelId, {
          type: 'UNITED_WE_STAND',
          userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
          turnWhenStarted: duel.currentTurn,
          phaseWhenStarted: duel.currentPhase || 'MAIN1',
          data: {
            availableMonsters: availableMonsters, // Já inclui zoneIndex em cada monstro
            spellTrapZoneIndex: zoneIndex, // Índice da zona onde UnitedWeStand está
          }
        });
        
        logger.info(`✅ [processCardEffect] UnitedWeStand: O gateway deve emitir unitedWeStandShowMonsters`);
        // O gateway detectará isso e emitirá um evento especial para mostrar os monstros disponíveis
        
        // IMPORTANTE: Garantir que UnitedWeStand permanece no campo (não vai para o cemitério)
        // Verificar novamente que a carta está no campo antes de retornar
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const cardOnField = playerField.spellTrap[zoneIndex];
          const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
          if (cardOnFieldId === cardId || String(cardOnFieldId) === String(cardId)) {
            // Garantir que está em face-up e não será movida
            cardOnField.position = 'face-up';
            logger.info(`✅ [processCardEffect] UnitedWeStand confirmada no campo na zona ${zoneIndex} - NÃO será movida para o cemitério`);
          }
        }
        
        // Atualizar no banco para garantir que o estado está correto
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        
        return;
      }

      // MagePower - Magia de Equipamento: Escolher um monstro para equipar, ganha 500 ATK por cada carta na zona de spell/trap
      if (this.isExactCard(card, 'MagePower')) {
        logger.info(`✨ [processCardEffect] MagePower ativada`);
        
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        
        if (!playerField || !playerField.monsters) {
          logger.info(`⚠️ [processCardEffect] Campo do jogador não encontrado`);
          return;
        }
        
        // Se o monstro já foi selecionado (via drag and drop), equipar diretamente
        if (selectedMonsterZoneIndex !== undefined && selectedMonsterZoneIndex !== null) {
          const chosenMonster = playerField.monsters[selectedMonsterZoneIndex];
          if (chosenMonster && (chosenMonster.position === 'attack' || chosenMonster.position === 'defense')) {
            // Contar cartas na zona de spell/trap do jogador
            if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
              playerField.spellTrap = [null, null, null, null, null];
            }
            while (playerField.spellTrap.length < 5) {
              playerField.spellTrap.push(null);
            }
            playerField.spellTrap = playerField.spellTrap.slice(0, 5);
            
            // IMPORTANTE: Remover equipamento anterior antes de adicionar o novo
            // Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
            await this.removePreviousEquipment(duelId, duel, isPlayer1, chosenMonster);
            
            // Adicionar MagePower ao array de equips com referência única
            const cardId = card.idCarta || card.id || card.cardId;
            const uniqueEquipRef = `${cardId}:${zoneIndex}`;
            chosenMonster.equippedCards = [uniqueEquipRef];
            chosenMonster.equippedCardId = cardId;
            chosenMonster.equippedSpellTrapZoneIndex = zoneIndex;
            
            // Recalcular bônus total do equipamento
            chosenMonster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(chosenMonster, playerField);
            
            logger.info(`✅ [processCardEffect] MagePower equipada ao monstro na zona ${selectedMonsterZoneIndex}, bonus ATK: +${chosenMonster.equipmentBonusAtk}`);
            
            // Atualizar no banco e cache para garantir que o estado está salvo
            await this.updateDuelInDatabase(duelId, {
              player1Field: (duel as any).player1Field,
              player2Field: (duel as any).player2Field,
            } as any);
            this.activeDuels.set(duelId, duel);
            
            return;
          }
        }
        
        // Se não foi selecionado via drag and drop, criar pending choice
        logger.info(`✨ [processCardEffect] MagePower ativada - requer escolha do monstro para equipar`);
        
        // Coletar todos os monstros face-up do jogador (attack ou defense, não set)
        const availableMonsters: any[] = [];
        playerField.monsters.forEach((monster: any, index: number) => {
          if (monster && (monster.position === 'attack' || monster.position === 'defense')) {
            availableMonsters.push({
              ...monster,
              zoneIndex: index
            });
          }
        });
        
        if (availableMonsters.length === 0) {
          logger.info(`⚠️ [processCardEffect] Nenhum monstro face-up disponível para equipar MagePower`);
          // Ainda assim, deixar a carta no campo (pode equipar depois quando houver monstros)
          return;
        }
        
        logger.info(`✅ [processCardEffect] MagePower: ${availableMonsters.length} monstro(s) disponível(is) para equipar`);
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        
        // Salvar pending choice
        await this.setPendingChoice(duelId, {
          type: 'MAGE_POWER',
          userId: isPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
          turnWhenStarted: duel.currentTurn,
          phaseWhenStarted: duel.currentPhase || 'MAIN1',
          data: {
            availableMonsters: availableMonsters, // Já inclui zoneIndex em cada monstro
            spellTrapZoneIndex: zoneIndex, // Índice da zona onde MagePower está
          }
        });
        
        logger.info(`✅ [processCardEffect] MagePower: O gateway deve emitir magePowerShowMonsters`);
        // O gateway detectará isso e emitirá um evento especial para mostrar os monstros disponíveis
        return;
      }

      // SwordsOfRevealingLight - Bloqueia ataques do oponente por 3 turnos
      if (this.isExactCard(card, 'SwordsOfRevealingLight')) {
        logger.info(`✨ [processCardEffect] Processando efeito de SwordsOfRevealingLight`);
        
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
        
        // Verificar se o oponente tem monstros face-down
        let hasFaceDownMonsters = false;
        if (opponentField && opponentField.monsters && Array.isArray(opponentField.monsters)) {
          for (const monster of opponentField.monsters) {
            if (monster && monster !== null && monster.position === 'set') {
              hasFaceDownMonsters = true;
              break;
            }
          }
        }
        
        // Se o oponente tem monstros face-down, virar todos face-up
        if (hasFaceDownMonsters) {
          logger.info(`✨ [processCardEffect] SwordsOfRevealingLight: Virando todos os monstros face-down do oponente`);
          for (let i = 0; i < opponentField.monsters.length; i++) {
            const monster = opponentField.monsters[i];
            if (monster && monster !== null && monster.position === 'set') {
              // Virar para face-up em defesa
              opponentField.monsters[i].position = 'defense';
              logger.info(`✨ [processCardEffect] SwordsOfRevealingLight: ${monster.name || monster.cardName || 'Monstro'} virado face-up`);
              
              // Verificar se é Fiber Jar ou SnowmanEater e processar efeito de flip
              const monsterCardId = monster.idCarta || monster.id || monster.cardId;
              const monsterCardName = (monster.name || monster.cardName || '').toLowerCase();
              const isFiberJar = this.isExactCard(monster, 'FiberJar');
              const isSnowmanEater = this.isExactCard(monster, 'SnowmanEater');
              
              if (isFiberJar || isSnowmanEater) {
                await this.processFlipEffect(duelId, duel, !isPlayer1, monster, i);
              }
            }
          }
        } else {
          logger.info(`ℹ️ [processCardEffect] SwordsOfRevealingLight: O oponente não tem monstros face-down para virar`);
        }
        
        // Armazenar informações na carta: turno de ativação e turnCounter
        const currentTurnCounter = duel.turnCounter || 1;
        const activationTurn = duel.currentTurn; // 1 = Player1, 2 = Player2
        const swordsCard = playerField.spellTrap[zoneIndex];
        if (swordsCard) {
          swordsCard.activationTurn = activationTurn; // Turno quando foi ativada (1 ou 2)
          swordsCard.activationTurnCounter = currentTurnCounter; // Contador de turnos quando foi ativada
          swordsCard.activatedByPlayer1 = isPlayer1; // Quem ativou
          logger.info(`✅ [processCardEffect] SwordsOfRevealingLight: Armazenado turno de ativação - turnCounter: ${currentTurnCounter}, turn: ${activationTurn}, ativado por: ${isPlayer1 ? 'Player1' : 'Player2'}`);
        }
        
        // A carta permanece no campo (não vai para o cemitério)
        logger.info(`✅ [processCardEffect] SwordsOfRevealingLight permanecerá no campo bloqueando ataques do oponente`);
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // BannerOfCourage - Continuous Spell: Durante a Fase de Batalha, todos os monstros que você controla ganham 200 de ATK
      if (cardId === 'BannerOfCourage' || cardId.toLowerCase().includes('bannerofcourage')) {
        logger.info(`✨ [processCardEffect] BannerOfCourage ativada - Continuous Spell`);
        
        // BannerOfCourage é uma Continuous Spell, então ela permanece no campo
        // O efeito será aplicado durante a fase de batalha através da função getBannerOfCourageBonus
        // Não mover para o cemitério - ela fica no campo até ser destruída
        
        logger.info(`✅ [processCardEffect] BannerOfCourage ativada e permanece no campo`);
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return;
      }
      
      // IMPORTANTE: Se chegou até aqui e é uma spell Equip, garantir que permaneça no campo
      // Spells Equip devem permanecer no campo até serem destruídas ou o monstro equipado for destruído
      if (isEquipSpell) {
        logger.info(`🔧 [processCardEffect] Spell Equip (${card.name || card.cardName || cardId}) - garantindo que permaneça no campo`);
        const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        
        // Verificar se a carta ainda está no campo (não deve ter sido movida para o cemitério)
        if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
          const cardOnField = playerField.spellTrap[zoneIndex];
          const cardOnFieldId = cardOnField.idCarta || cardOnField.id || cardOnField.cardId;
          
          // Se a carta ainda está no campo, tudo bem
          if (cardOnFieldId === cardId || String(cardOnFieldId) === String(cardId)) {
            logger.info(`✅ [processCardEffect] Spell Equip ainda está no campo na zona ${zoneIndex}`);
          } else {
            logger.warn(`⚠️ [processCardEffect] Spell Equip não encontrada no campo na zona ${zoneIndex} - pode ter sido movida incorretamente`);
          }
        } else {
          logger.warn(`⚠️ [processCardEffect] Zona ${zoneIndex} está vazia - spell Equip pode ter sido movida incorretamente para o cemitério`);
        }
        
        // Atualizar no banco para garantir que o estado está correto
        await this.updateDuelInDatabase(duelId, {
          player1Field: (duel as any).player1Field,
          player2Field: (duel as any).player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelId, duel);
        return; // Não processar mais nada para equip spells
      }
    } catch (error) {
      logger.error(`❌ [processCardEffect] Erro ao processar efeito da carta:`, error);
    }
  }
  
  /**
   * Retorna o bônus de ATK do BannerOfCourage se estiver ativo durante a fase de batalha
   */
  private getBannerOfCourageBonus(duel: Duel, isPlayer1: boolean, currentPhase: string | TurnPhase): number {
    // BannerOfCourage só funciona durante a Fase de Batalha
    if (currentPhase !== 'BATTLE' && currentPhase !== TurnPhase.BATTLE) {
      return 0;
    }
    
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.spellTrap) {
      return 0;
    }
    
    // Verificar se BannerOfCourage está no campo (face-up)
    const hasBannerOfCourage = playerField.spellTrap.some((st: any) => {
      if (!st) return false;
      const cardId = st.idCarta || st.id || st.cardId;
      return cardId === 'BannerOfCourage' || 
             (typeof cardId === 'string' && cardId.toLowerCase().includes('bannerofcourage'));
    });
    
    if (hasBannerOfCourage) {
      logger.info(`🛡️ [getBannerOfCourageBonus] BannerOfCourage ativo - bônus de +200 ATK aplicado`);
      return 200;
    }
    
    return 0;
  }
  
  /**
   * Processa a escolha de carta do The Forceful Sentry
   */
  async processForcefulSentryChoice(duelId: string | number, userId: number, chosenCardIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    // Se chosenCardIndex é -1, significa que não há cartas na mão do oponente
    if (chosenCardIndex === -1) {
      logger.info(`ℹ️ [processForcefulSentryChoice] Oponente não tem cartas na mão - apenas movendo The Forceful Sentry para o cemitério`);
    } else {
      if (!opponentField || !opponentField.hand || !Array.isArray(opponentField.hand)) {
        return { success: false, message: 'Mão do oponente não encontrada' };
      }
      
      if (chosenCardIndex < 0 || chosenCardIndex >= opponentField.hand.length) {
        return { success: false, message: 'Índice de carta inválido' };
      }
      
      // Remover a carta escolhida da mão
      const chosenCard = opponentField.hand.splice(chosenCardIndex, 1)[0];
      
      // Adicionar ao deck do oponente
      if (!opponentField.deck) {
        opponentField.deck = [];
      }
      opponentField.deck.push(chosenCard);
      
      // Embaralhar o deck após adicionar a carta
      opponentField.deck = this.shuffleDeck(opponentField.deck);
      
      logger.info(`✅ [processForcefulSentryChoice] Carta "${chosenCard.name || chosenCard.cardName || 'Desconhecida'}" retornou ao deck do oponente e o deck foi embaralhado`);
    }
    
    // Encontrar e mover The Forceful Sentry para o cemitério
    if (playerField && playerField.spellTrap) {
      for (let i = 0; i < playerField.spellTrap.length; i++) {
        if (playerField.spellTrap[i] !== null && playerField.spellTrap[i] !== undefined) {
          const card = playerField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          if (cardId === 'TheForcefulSentry') {
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(card);
            playerField.spellTrap[i] = null;
            
            logger.info(`✅ [processForcefulSentryChoice] The Forceful Sentry movida para o cemitério`);
            break;
          }
        }
      }
    }
    
    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    
    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);
    
    return { success: true };
  }

  async processConfiscationChoice(duelId: string | number, userId: number, chosenCardIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    
    const isPlayer1 = player1IdNum === userIdNum;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    // Se chosenCardIndex é -1, significa que não há cartas na mão do oponente
    if (chosenCardIndex === -1) {
      logger.info(`ℹ️ [processConfiscationChoice] Oponente não tem cartas na mão - apenas movendo Confiscation para o cemitério`);
    } else {
      if (!opponentField || !opponentField.hand || !Array.isArray(opponentField.hand)) {
        return { success: false, message: 'Mão do oponente não encontrada' };
      }
      
      if (chosenCardIndex < 0 || chosenCardIndex >= opponentField.hand.length) {
        return { success: false, message: 'Índice de carta inválido' };
      }
      
      // Remover a carta escolhida da mão
      const chosenCard = opponentField.hand.splice(chosenCardIndex, 1)[0];
      
      // Adicionar ao cemitério do oponente
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(chosenCard);
      
      logger.info(`✅ [processConfiscationChoice] Carta "${chosenCard.name || chosenCard.cardName || 'Desconhecida'}" foi enviada ao cemitério do oponente`);
    }
    
    // Encontrar e mover Confiscation para o cemitério
    if (playerField && playerField.spellTrap) {
      for (let i = 0; i < playerField.spellTrap.length; i++) {
        if (playerField.spellTrap[i] !== null && playerField.spellTrap[i] !== undefined) {
          const card = playerField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          if (cardId === 'Confiscation') {
            // Inicializar cemitério se não existir
            if (!playerField.graveyard) {
              playerField.graveyard = [];
            }
            
            // Mover para o cemitério
            playerField.graveyard.push(card);
            playerField.spellTrap[i] = null;
            
            logger.info(`✅ [processConfiscationChoice] Confiscation movida para o cemitério`);
            break;
          }
        }
      }
    }
    
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
   * Processa a escolha de cartas do GracefulCharity
   */
  async processGracefulCharityChoice(duelId: string | number, userId: number, cardIdsToDiscard: string[]): Promise<{ success: boolean; message?: string }> {
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
    
    if (!playerField || !playerField.hand || !Array.isArray(playerField.hand)) {
      return { success: false, message: 'Mão do jogador não encontrada' };
    }
    
    // Validar que tem pelo menos 2 cartas para descartar
    if (cardIdsToDiscard.length !== 2) {
      return { success: false, message: 'Você deve descartar exatamente 2 cartas' };
    }
    
    // Encontrar as cartas na mão
    const cardsToDiscard: any[] = [];
    for (const cardIdToDiscard of cardIdsToDiscard) {
      const cardIndex = playerField.hand.findIndex((card: any) => {
        const cardId = card.idCarta || card.id || card.cardId;
        return cardId?.toString() === cardIdToDiscard.toString();
      });
      
      if (cardIndex === -1) {
        return { success: false, message: `Carta com ID ${cardIdToDiscard} não encontrada na mão` };
      }
      
      cardsToDiscard.push(playerField.hand[cardIndex]);
    }
    
    // Remover as cartas da mão
    for (const cardToDiscard of cardsToDiscard) {
      const cardIndex = playerField.hand.findIndex((card: any) => {
        const cardId = card.idCarta || card.id || card.cardId;
        const discardCardId = cardToDiscard.idCarta || cardToDiscard.id || cardToDiscard.cardId;
        return cardId?.toString() === discardCardId?.toString();
      });
      
      if (cardIndex !== -1) {
        playerField.hand.splice(cardIndex, 1);
      }
    }
    
    // Adicionar ao cemitério
    if (!playerField.graveyard) {
      playerField.graveyard = [];
    }
    playerField.graveyard.push(...cardsToDiscard);
    
    logger.info(`✅ [processGracefulCharityChoice] ${cardsToDiscard.length} cartas foram descartadas da mão do jogador`);
    
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
   * Processa a escolha do MonsterReborn - reviver um monstro do cemitério
   */
  async processMonsterRebornChoice(duelId: string | number, userId: number, chosenMonster: { graveyard: 'player' | 'opponent'; index: number }): Promise<{ success: boolean; message?: string }> {
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
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Determinar qual cemitério usar
    const graveyard = chosenMonster.graveyard === 'player' ? playerField?.graveyard : opponentField?.graveyard;
    
    if (!graveyard || !Array.isArray(graveyard)) {
      return { success: false, message: 'Cemitério não encontrado' };
    }
    
    if (chosenMonster.index < 0 || chosenMonster.index >= graveyard.length) {
      return { success: false, message: 'Índice de monstro inválido' };
    }
    
    // Encontrar o monstro no cemitério
    const monstersInGraveyard = graveyard.filter((c: any) => {
      const cardType = c.type || c.cardType;
      return cardType === 'Monster';
    });
    
    if (chosenMonster.index >= monstersInGraveyard.length) {
      return { success: false, message: 'Monstro não encontrado no cemitério' };
    }
    
    const monsterToRevive = monstersInGraveyard[chosenMonster.index];
    
    // Encontrar o índice real no cemitério
    let realIndex = -1;
    let monsterCount = 0;
    for (let i = 0; i < graveyard.length; i++) {
      const card = graveyard[i];
      const cardType = card.type || card.cardType;
      if (cardType === 'Monster') {
        if (monsterCount === chosenMonster.index) {
          realIndex = i;
          break;
        }
        monsterCount++;
      }
    }
    
    if (realIndex === -1) {
      return { success: false, message: 'Monstro não encontrado no cemitério' };
    }
    
    // Verificar se há espaço no campo do jogador
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no campo para reviver o monstro' };
    }
    
    // Remover o monstro do cemitério
    graveyard.splice(realIndex, 1);
    
    // Obter contador global de turnos
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    
    // Reviver o monstro no campo do jogador em posição de ataque
    playerField.monsters[emptyZoneIndex] = {
      ...monsterToRevive,
      position: 'attack',
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };
    
    logger.info(`✅ [processMonsterRebornChoice] Monstro ${monsterToRevive.name || monsterToRevive.cardName} revivido no campo do jogador ${isPlayer1 ? 1 : 2}`);
    
    // Limpar pendingChoice
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    
    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);
    
    return { success: true };
  }
  
  /**
   * Devolve monstros controlados por ChangeOfHeart quando a carta é destruída ou o turno acaba
   */
  private async returnChangeOfHeartMonsters(duelId: string, duel: Duel, isPlayer1: boolean): Promise<number> {
    let returnedCount = 0;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
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
    
    playerField.monsters.forEach((monster: any, index: number) => {
      if (monster) {
        const controlledByNum = Number(monster.controlledBy);
        const originalOwnerNum = Number(monster.originalOwner);
        const isControlledMonster = controlledByNum === (isPlayer1 ? 1 : 2) && 
                                    originalOwnerNum === (isPlayer1 ? 2 : 1) && 
                                    monster.originalZoneIndex !== undefined;
        
        if (isControlledMonster) {
          // Devolver ao campo do oponente
          if (opponentField.monsters[monster.originalZoneIndex] === null) {
            const { controlledBy, originalOwner, originalZoneIndex, controlledUntilTurn, ...monsterWithoutControl } = monster;
            opponentField.monsters[monster.originalZoneIndex] = {
              ...monsterWithoutControl,
              positionChangedThisTurn: false,
              attackedThisTurn: false,
      attacksThisTurn: 0,
            };
            playerField.monsters[index] = null;
            returnedCount++;
            logger.info(`🔄 [returnChangeOfHeartMonsters] Devolvendo monstro ${monster.name || monster.cardName} do Player ${isPlayer1 ? 1 : 2} para Player ${isPlayer1 ? 2 : 1} (zona ${monster.originalZoneIndex})`);
          } else {
            // Se a zona original estiver ocupada, enviar para o cemitério do dono original
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
    });
    
    return returnedCount;
  }

  /**
   * Processa a escolha do ChangeOfHeart - controlar um monstro do oponente durante o turno
   */
  async processChangeOfHeartChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Validar índice da zona
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }
    
    // Verificar se há um monstro na zona escolhida do oponente
    if (!opponentField || !opponentField.monsters || !Array.isArray(opponentField.monsters)) {
      return { success: false, message: 'Campo do oponente não encontrado' };
    }
    
    const chosenMonster = opponentField.monsters[chosenMonsterZoneIndex];
    if (!chosenMonster || chosenMonster === null || chosenMonster === undefined) {
      return { success: false, message: 'Nenhum monstro na zona escolhida' };
    }
    
    // Pode controlar monstros em qualquer posição (attack, defense ou set)
    const position = chosenMonster.position || 'attack';
    
    // Verificar se há espaço no campo do jogador
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no seu campo para controlar o monstro' };
    }
    
    // Obter contador global de turnos
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    
    // Remover o monstro do campo do oponente
    opponentField.monsters[chosenMonsterZoneIndex] = null;
    
    // Adicionar o monstro ao campo do jogador com informações de controle
    const controlledMonster = {
      ...chosenMonster,
      controlledBy: isPlayer1 ? 1 : 2, // Quem está controlando
      originalOwner: isPlayer1 ? 2 : 1, // Dono original
      originalZoneIndex: chosenMonsterZoneIndex, // Zona original no campo do oponente
      controlledUntilTurn: currentTurnCounter, // Será devolvido no final deste turno
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };
    
    playerField.monsters[emptyZoneIndex] = controlledMonster;
    
    logger.info(`✅ [processChangeOfHeartChoice] Monstro ${chosenMonster.name || chosenMonster.cardName} agora está sob controle do jogador ${isPlayer1 ? 1 : 2}`);
    logger.info(`🔍 [processChangeOfHeartChoice] Detalhes do controle:`);
    logger.info(`   - controlledBy: ${controlledMonster.controlledBy}`);
    logger.info(`   - originalOwner: ${controlledMonster.originalOwner}`);
    logger.info(`   - originalZoneIndex: ${controlledMonster.originalZoneIndex}`);
    logger.info(`   - controlledUntilTurn: ${controlledMonster.controlledUntilTurn}`);
    logger.info(`   - currentTurnCounter: ${currentTurnCounter}`);
    
    // Limpar pendingChoice
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    
    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);
    
    return { success: true };
  }
  
  /**
   * Processa a escolha do BrainControl - controlar um monstro face-up do oponente durante o turno
   */
  async processBrainControlChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Validar índice da zona
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }
    
    // Verificar se há um monstro na zona escolhida do oponente
    if (!opponentField || !opponentField.monsters || !Array.isArray(opponentField.monsters)) {
      return { success: false, message: 'Campo do oponente não encontrado' };
    }
    
    const chosenMonster = opponentField.monsters[chosenMonsterZoneIndex];
    if (!chosenMonster || chosenMonster === null || chosenMonster === undefined) {
      return { success: false, message: 'Nenhum monstro na zona escolhida' };
    }
    
    // Verificar se o monstro está face-up (attack ou defense, não set)
    const position = chosenMonster.position || 'attack';
    if (position === 'set') {
      return { success: false, message: 'Brain Control só pode controlar monstros face-up (ataque ou defesa)' };
    }
    
    // Verificar se há espaço no campo do jogador
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no seu campo para controlar o monstro' };
    }
    
    // Obter contador global de turnos
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    
    // Remover o monstro do campo do oponente
    opponentField.monsters[chosenMonsterZoneIndex] = null;
    
    // Adicionar o monstro ao campo do jogador com informações de controle
    const controlledMonster = {
      ...chosenMonster,
      controlledBy: isPlayer1 ? 1 : 2, // Quem está controlando
      originalOwner: isPlayer1 ? 2 : 1, // Dono original
      originalZoneIndex: chosenMonsterZoneIndex, // Zona original no campo do oponente
      controlledUntilTurn: currentTurnCounter, // Será devolvido no final deste turno
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
    };
    
    playerField.monsters[emptyZoneIndex] = controlledMonster;
    
    logger.info(`✅ [processBrainControlChoice] Monstro ${chosenMonster.name || chosenMonster.cardName} agora está sob controle do jogador ${isPlayer1 ? 1 : 2}`);
    logger.info(`🔍 [processBrainControlChoice] Detalhes do controle:`);
    logger.info(`   - controlledBy: ${controlledMonster.controlledBy}`);
    logger.info(`   - originalOwner: ${controlledMonster.originalOwner}`);
    logger.info(`   - originalZoneIndex: ${controlledMonster.originalZoneIndex}`);
    logger.info(`   - controlledUntilTurn: ${controlledMonster.controlledUntilTurn}`);
    logger.info(`   - currentTurnCounter: ${currentTurnCounter}`);
    
    // Limpar pendingChoice
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    
    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);
    
    return { success: true };
  }

  /**
   * Processa a escolha do monstro para equipar UnitedWeStand
   */
  async processUnitedWeStandChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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

    // Validar índice da zona
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Verificar se há pendingChoice
    if (!duel.pendingChoice || duel.pendingChoice.type !== 'UNITED_WE_STAND') {
      return { success: false, message: 'Não há escolha pendente de UnitedWeStand' };
    }

    const spellTrapZoneIndex = duel.pendingChoice.data?.spellTrapZoneIndex;
    if (spellTrapZoneIndex === undefined || spellTrapZoneIndex === null) {
      return { success: false, message: 'Índice da zona de spell/trap não encontrado' };
    }

    // Verificar se UnitedWeStand ainda está no campo
    if (!playerField || !playerField.spellTrap || !playerField.spellTrap[spellTrapZoneIndex]) {
      return { success: false, message: 'UnitedWeStand não encontrada no campo' };
    }

    const unitedWeStandCard = playerField.spellTrap[spellTrapZoneIndex];
    if (!this.isExactCard(unitedWeStandCard, 'UnitedWeStand')) {
      return { success: false, message: 'Carta no campo não é UnitedWeStand' };
    }

    // Verificar se o monstro escolhido existe e está face-up
    if (!playerField.monsters || !playerField.monsters[chosenMonsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const chosenMonster = playerField.monsters[chosenMonsterZoneIndex];
    if (chosenMonster.position === 'set') {
      return { success: false, message: 'Monstro deve estar face-up para equipar UnitedWeStand' };
    }

    // Contar monstros face-up no campo do jogador (incluindo o escolhido)
    const faceUpMonsters = playerField.monsters.filter((m: any) => 
      m !== null && m !== undefined && (m.position === 'attack' || m.position === 'defense')
    );
    const bonusAtk = faceUpMonsters.length * 800;

    logger.info(`✨ [processUnitedWeStandChoice] Equipando UnitedWeStand ao monstro ${chosenMonster.name || chosenMonster.cardName}`);
    logger.info(`📊 [processUnitedWeStandChoice] Monstros face-up: ${faceUpMonsters.length}, ATK bonus: +${bonusAtk}`);

    // IMPORTANTE: Remover equipamento anterior antes de adicionar o novo
    // Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
    await this.removePreviousEquipment(duelIdStr, duel, isPlayer1, chosenMonster);

    // Equipar ao monstro
    const unitedWeStandCardId = unitedWeStandCard.idCarta || unitedWeStandCard.id || unitedWeStandCard.cardId;
    chosenMonster.equippedBy = isPlayer1 ? 1 : 2;
    
    // Inicializar array de equips (sempre começar vazio após remover o anterior)
    chosenMonster.equippedCards = [];
    
    // Adicionar novo equip ao array (apenas um equipamento por vez)
    chosenMonster.equippedCards.push(unitedWeStandCardId);
    
    // Manter equippedCardId para compatibilidade (último equip adicionado)
    chosenMonster.equippedCardId = unitedWeStandCardId;
    chosenMonster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;
    
    // Recalcular bônus total do equipamento
    chosenMonster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(chosenMonster, playerField);

    // Adicionar referência ao monstro equipado na carta UnitedWeStand
    unitedWeStandCard.equippedToMonsterZoneIndex = chosenMonsterZoneIndex;

    // Limpar pendingChoice
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [processUnitedWeStandChoice] UnitedWeStand equipada com sucesso! ATK bonus: +${bonusAtk}`);

    return { success: true };
  }

  /**
   * Processa a escolha do monstro para equipar MagePower
   */
  async processMagePowerChoice(duelId: string | number, userId: number, chosenMonsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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

    // Validar índice da zona
    if (chosenMonsterZoneIndex < 0 || chosenMonsterZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Verificar se há pendingChoice
    if (!duel.pendingChoice || duel.pendingChoice.type !== 'MAGE_POWER') {
      return { success: false, message: 'Não há escolha pendente de MagePower' };
    }

    const spellTrapZoneIndex = duel.pendingChoice.data?.spellTrapZoneIndex;
    if (spellTrapZoneIndex === undefined || spellTrapZoneIndex === null) {
      return { success: false, message: 'Índice da zona de spell/trap não encontrado' };
    }

    // Verificar se MagePower ainda está no campo
    if (!playerField || !playerField.spellTrap || !playerField.spellTrap[spellTrapZoneIndex]) {
      return { success: false, message: 'MagePower não encontrada no campo' };
    }

    const magePowerCard = playerField.spellTrap[spellTrapZoneIndex];
    if (!this.isExactCard(magePowerCard, 'MagePower')) {
      return { success: false, message: 'Carta no campo não é MagePower' };
    }

    // Verificar se o monstro escolhido existe e está face-up
    if (!playerField.monsters || !playerField.monsters[chosenMonsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const chosenMonster = playerField.monsters[chosenMonsterZoneIndex];
    if (chosenMonster.position === 'set') {
      return { success: false, message: 'Monstro deve estar face-up para equipar MagePower' };
    }

    // Contar cartas na zona de spell/trap do jogador (incluindo a própria MagePower)
    // Incluir TODAS as cartas, independentemente de estarem face-up ou face-down (set)
    // Garantir que spellTrap seja um array válido
    if (!playerField.spellTrap || !Array.isArray(playerField.spellTrap)) {
      playerField.spellTrap = [null, null, null, null, null];
    }
    while (playerField.spellTrap.length < 5) {
      playerField.spellTrap.push(null);
    }
    playerField.spellTrap = playerField.spellTrap.slice(0, 5);
    
    // Contar TODAS as cartas na zona spell/trap (face-up e face-down/set)
    // IMPORTANTE: Contar todas as cartas, independentemente da posição
    const spellTrapCards = playerField.spellTrap.filter((card: any) => {
      const isValid = card !== null && card !== undefined;
      if (isValid) {
        logger.info(`🔍 [processMagePowerChoice] Carta encontrada: ${card.name || card.cardName || 'Desconhecida'}, posição: ${card.position || 'face-up'}`);
      }
      return isValid;
    });
    const bonusAtk = spellTrapCards.length * 500;
    
    // Verificar se há cartas na zona
    if (spellTrapCards.length === 0) {
      logger.info(`⚠️ [processMagePowerChoice] Nenhuma carta encontrada na zona spell/trap!`);
      logger.info(`🔍 [processMagePowerChoice] Estado do array spellTrap:`, playerField.spellTrap);
    }

    logger.info(`✨ [processMagePowerChoice] Equipando MagePower ao monstro ${chosenMonster.name || chosenMonster.cardName}`);
    logger.info(`📊 [processMagePowerChoice] Cartas na zona spell/trap (face-up e face-down): ${spellTrapCards.length}, ATK bonus: +${bonusAtk}`);
    logger.info(`🔍 [processMagePowerChoice] Detalhes das cartas:`, spellTrapCards.map((c: any, i: number) => ({ 
      index: i, 
      name: c?.name || c?.cardName || 'null',
      position: c?.position || 'face-up',
      cardId: c?.idCarta || c?.id || c?.cardId || 'null'
    })));

    // IMPORTANTE: Remover equipamento anterior antes de adicionar o novo
    // Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
    await this.removePreviousEquipment(duelIdStr, duel, isPlayer1, chosenMonster);

    // Equipar ao monstro
    const magePowerCardId = magePowerCard.idCarta || magePowerCard.id || magePowerCard.cardId;
    chosenMonster.equippedBy = isPlayer1 ? 1 : 2;
    
    // Inicializar array de equips (sempre começar vazio após remover o anterior)
    chosenMonster.equippedCards = [];
    
    // Adicionar novo equip ao array (apenas um equipamento por vez)
    chosenMonster.equippedCards.push(magePowerCardId);
    
    // Manter equippedCardId para compatibilidade (último equip adicionado)
    chosenMonster.equippedCardId = magePowerCardId;
    chosenMonster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;
    
    // Recalcular bônus total do equipamento
    chosenMonster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(chosenMonster, playerField);

    // Adicionar referência ao monstro equipado na carta MagePower
    magePowerCard.equippedToMonsterZoneIndex = chosenMonsterZoneIndex;

    // IMPORTANTE: Recalcular ATK ANTES de salvar para garantir que está correto
    // O ATK já foi calculado e atribuído acima, mas vamos recalcular para garantir
    // que está correto com base no estado atual do campo (pode ter mudado)
    await this.recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    // Verificar o ATK após recalcular ANTES de salvar
    const recalculatedMonster = playerField.monsters[chosenMonsterZoneIndex];
    if (recalculatedMonster) {
      logger.info(`🔍 [processMagePowerChoice] ANTES de salvar - ATK base: ${recalculatedMonster.atk || 0}, ATK bonus: ${recalculatedMonster.equipmentBonusAtk || 0}, ATK total: ${(recalculatedMonster.atk || 0) + (recalculatedMonster.equipmentBonusAtk || 0)}`);
    }

    // Limpar pendingChoice e salvar no banco (com o ATK já recalculado)
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    
    // Aguardar um pouco para garantir que o banco foi atualizado
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Buscar o duelo atualizado do banco para verificar se foi salvo corretamente
    const freshDuel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    if (freshDuel) {
      const freshPlayerField = isPlayer1 ? (freshDuel as any).player1Field : (freshDuel as any).player2Field;
      const freshMonster = freshPlayerField?.monsters?.[chosenMonsterZoneIndex];
      if (freshMonster) {
        logger.info(`🔍 [processMagePowerChoice] Após salvar (dados do banco) - ATK base: ${freshMonster.atk || 0}, ATK bonus: ${freshMonster.equipmentBonusAtk || 0}, ATK total: ${(freshMonster.atk || 0) + (freshMonster.equipmentBonusAtk || 0)}`);
        
        // Se o ATK bonus não foi salvo, corrigir
        if ((freshMonster.equipmentBonusAtk || 0) !== (recalculatedMonster?.equipmentBonusAtk || 0)) {
          logger.info(`⚠️ [processMagePowerChoice] ATK bonus não foi salvo corretamente! Corrigindo...`);
          freshMonster.equipmentBonusAtk = recalculatedMonster?.equipmentBonusAtk || bonusAtk;
          // Atualizar o objeto do duelo
          if (isPlayer1) {
            (duel as any).player1Field = freshPlayerField;
          } else {
            (duel as any).player2Field = freshPlayerField;
          }
          // Salvar novamente
          await this.updateDuelInDatabase(duelId, {
            player1Field: (duel as any).player1Field,
            player2Field: (duel as any).player2Field,
          } as any);
        }
      }
    }

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [processMagePowerChoice] MagePower equipada com sucesso! ATK bonus: +${bonusAtk}`);
    logger.info(`🔍 [processMagePowerChoice] Monstro equipado - ATK base: ${chosenMonster.atk || 0}, ATK bonus: ${chosenMonster.equipmentBonusAtk}, ATK total: ${(chosenMonster.atk || 0) + (chosenMonster.equipmentBonusAtk || 0)}`);

    return { success: true };
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

    // Buscar carta na mão usando instanceId (prioritário) ou idCarta/id/cardId
    // Isso permite distinguir múltiplas cópias da mesma carta
    let cardIndex = -1;
    if (instanceId) {
      // Se temos instanceId, buscar por ele primeiro
      cardIndex = playerField.hand.findIndex((c: any) => c && c.instanceId === instanceId);
    }
    if (cardIndex === -1) {
      // Se não encontrou por instanceId, buscar por idCarta/id/cardId
      cardIndex = playerField.hand.findIndex((c: any) => {
        const cId = c.idCarta || c.id || c.cardId;
        return cId === cardId;
      });
    }

    if (cardIndex === -1) {
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const card = playerField.hand[cardIndex];

    // Verificar se é uma spell equip
    const cardType = card.type || card.cardType;
    const spellType = card.spellType;
    
    if (cardType !== 'Spell' || spellType !== 'Equip') {
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

    // IMPORTANTE: Remover equipamento anterior antes de adicionar o novo
    // Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
    await this.removePreviousEquipment(duelIdStr, duel, isPlayer1, monster);

    // Equipar a spell no monstro selecionado
    const spellCardId = spellCard.idCarta || spellCard.id || spellCard.cardId;
    monster.equippedBy = isPlayer1 ? 1 : 2;
    
    // Inicializar array de equips (sempre começar vazio após remover o anterior)
    monster.equippedCards = [];
    
    // Criar referência única para este equipamento: cardId:spellTrapZoneIndex
    const uniqueEquipRef = `${spellCardId}:${spellTrapZoneIndex}`;
    
    // Adicionar novo equip ao array (apenas um equipamento por vez)
    monster.equippedCards.push(uniqueEquipRef);
    
    // Manter equippedCardId para compatibilidade (último equip)
    monster.equippedCardId = spellCardId;
    monster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;
    spellCard.equippedToMonsterZoneIndex = monsterZoneIndex;
    
    // Recalcular bônus total do equipamento ANTES de processar efeito
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    logger.info(`🔍 [equipSpellFromHand] ANTES processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, ATK total: ${(monster.atk || 0) + (monster.equipmentBonusAtk || 0)}, equips: ${monster.equippedCards?.length || 0}`);
    
    // Processar efeito da spell equip (calcula bonus de ATK, etc)
    // O processCardEffect será chamado com o monstro já selecionado
    await this.processCardEffect(duelIdStr, duel, isPlayer1, spellCard, spellTrapZoneIndex, monsterZoneIndex);
    
    // Recalcular TODOS os monstros com equipamentos após adicionar um novo equipamento
    // Isso garante que todos os equipamentos sejam considerados corretamente
    playerField.monsters.forEach((m: any, idx: number) => {
      if (m && m.equippedCards && Array.isArray(m.equippedCards) && m.equippedCards.length > 0) {
        const oldBonus = m.equipmentBonusAtk || 0;
        m.equipmentBonusAtk = this.calculateTotalEquipmentBonus(m, playerField);
        if (oldBonus !== m.equipmentBonusAtk) {
          logger.info(`🔄 [equipSpellFromHand] Recalculado monstro ${idx} (${m.name || m.cardName}) - ATK bonus: ${oldBonus} -> ${m.equipmentBonusAtk}`);
        }
      }
    });
    
    // Recalcular novamente o monstro específico após processar efeito (pode ter mudado o campo)
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    logger.info(`🔍 [equipSpellFromHand] APÓS processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, ATK total: ${(monster.atk || 0) + (monster.equipmentBonusAtk || 0)}, equips: ${monster.equippedCards?.length || 0}`);

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

    // Verificar se é uma spell equip
    const cardType = spellCard.type || spellCard.cardType;
    const spellType = spellCard.spellType;
    const cardId = (spellCard.idCarta || spellCard.id || spellCard.cardId || '').toLowerCase();
    
    // Verificar se é spell equip pelo tipo ou pelo ID da carta
    const isEquipSpell = (cardType === 'Spell' && spellType === 'Equip') || 
                         cardId.includes('unitedwestand') || 
                         cardId.includes('magepower') ||
                         cardId.includes('hornoftheunicorn') ||
                         cardId.includes('malevolentnuzzler');
    
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

    // Apenas um equipamento por vez - equipamento anterior será removido automaticamente

    // Verificar se a spell já está equipada em outro monstro
    if (spellCard.equippedToMonsterZoneIndex !== undefined && spellCard.equippedToMonsterZoneIndex !== null) {
      return { success: false, message: 'Spell já está equipada em outro monstro' };
    }

    // IMPORTANTE: Remover equipamento anterior antes de adicionar o novo
    // Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
    await this.removePreviousEquipment(duelIdStr, duel, isPlayer1, monster);

    // Equipar a spell no monstro selecionado
    const spellCardId = spellCard.idCarta || spellCard.id || spellCard.cardId;
    monster.equippedBy = isPlayer1 ? 1 : 2;
    
    // Inicializar array de equips (sempre começar vazio após remover o anterior)
    monster.equippedCards = [];
    
    // Criar referência única para este equipamento: cardId:spellTrapZoneIndex
    const uniqueEquipRef = `${spellCardId}:${spellTrapZoneIndex}`;
    
    // Adicionar novo equip ao array (apenas um equipamento por vez)
    monster.equippedCards.push(uniqueEquipRef);
    
    // Manter equippedCardId para compatibilidade (último equip adicionado)
    monster.equippedCardId = spellCardId;
    monster.equippedSpellTrapZoneIndex = spellTrapZoneIndex;
    spellCard.equippedToMonsterZoneIndex = monsterZoneIndex;
    
    // Recalcular bônus total do equipamento ANTES de processar efeito
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    logger.info(`🔍 [equipSpellFromField] ANTES processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, ATK total: ${(monster.atk || 0) + (monster.equipmentBonusAtk || 0)}, equips: ${monster.equippedCards?.length || 0}`);
    
    // Processar efeito da spell equip (calcula bonus de ATK, etc)
    // O processCardEffect será chamado com o monstro já selecionado
    await this.processCardEffect(duelIdStr, duel, isPlayer1, spellCard, spellTrapZoneIndex, monsterZoneIndex);
    
    // Recalcular TODOS os monstros com equipamentos após adicionar um novo equipamento
    // Isso garante que todos os equipamentos sejam considerados corretamente
    playerField.monsters.forEach((m: any, idx: number) => {
      if (m && m.equippedCards && Array.isArray(m.equippedCards) && m.equippedCards.length > 0) {
        const oldBonus = m.equipmentBonusAtk || 0;
        m.equipmentBonusAtk = this.calculateTotalEquipmentBonus(m, playerField);
        if (oldBonus !== m.equipmentBonusAtk) {
          logger.info(`🔄 [equipSpellFromField] Recalculado monstro ${idx} (${m.name || m.cardName}) - ATK bonus: ${oldBonus} -> ${m.equipmentBonusAtk}`);
        }
      }
    });
    
    // Recalcular novamente o monstro específico após processar efeito (pode ter mudado o campo)
    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
    logger.info(`🔍 [equipSpellFromField] APÓS processCardEffect - ATK base: ${monster.atk || 0}, ATK bonus: ${monster.equipmentBonusAtk}, ATK total: ${(monster.atk || 0) + (monster.equipmentBonusAtk || 0)}, equips: ${monster.equippedCards?.length || 0}`);

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
   * Processa a remoção de marcador de magia e escolha de alvo para Breaker The Magical Warrior
   */
  async processBreakerRemoveCounter(duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5 || targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Verificar se o Breaker existe na zona especificada
    if (!playerField.monsters || !playerField.monsters[monsterZoneIndex]) {
      return { success: false, message: 'Monstro não encontrado na zona especificada' };
    }

    const breaker = playerField.monsters[monsterZoneIndex];
    const isBreaker = this.isExactCard(breaker, 'BreakerTheMagicalWarrior');

    if (!isBreaker) {
      return { success: false, message: 'Esta carta não é Breaker The Magical Warrior' };
    }

    // Verificar se tem marcador de magia
    if (!breaker.spellCounters || breaker.spellCounters <= 0) {
      return { success: false, message: 'Breaker não tem marcadores de magia para remover' };
    }

    // Remover 1 marcador
    breaker.spellCounters = Math.max(0, breaker.spellCounters - 1);
    
    // Recalcular ATK
    const spellCounters = breaker.spellCounters || 0;
    const atkBonus = spellCounters * 300;
    breaker.spellCounterBonusAtk = atkBonus;
    
    logger.info(`✨ [processBreakerRemoveCounter] Breaker: Marcador removido. Marcadores restantes: ${spellCounters}, ATK bonus: +${atkBonus}`);

    // Determinar qual campo tem o alvo
    const targetField = targetPlayer === 'player' ? playerField : (isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field);
    const targetIsPlayer1 = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;

    // Verificar se há spell/trap na zona alvo
    if (!targetField.spellTrap || !targetField.spellTrap[targetZoneIndex]) {
      return { success: false, message: 'Não há spell/trap na zona selecionada' };
    }

    const targetCard = targetField.spellTrap[targetZoneIndex];
    const targetCardId = targetCard.idCarta || targetCard.id || targetCard.cardId;

    logger.info(`✨ [processBreakerRemoveCounter] Destruindo spell/trap: ${targetCard.name || targetCard.cardName || 'Desconhecida'}`);

    // Verificar se é ChangeOfHeart, BrainControl, UnitedWeStand ou MagePower - processar efeitos especiais
    if (this.isExactCard(targetCard, 'ChangeOfHeart')) {
      logger.info(`💥 [processBreakerRemoveCounter] ChangeOfHeart destruída - devolvendo monstros controlados`);
      await this.returnChangeOfHeartMonsters(duelIdStr, duel, targetIsPlayer1);
    } else if (this.isExactCard(targetCard, 'BrainControl')) {
      logger.info(`💥 [processBreakerRemoveCounter] BrainControl destruída - devolvendo monstros controlados`);
      await this.returnChangeOfHeartMonsters(duelIdStr, duel, targetIsPlayer1);
    } else if (this.isExactCard(targetCard, 'UnitedWeStand')) {
      logger.info(`💥 [processBreakerRemoveCounter] UnitedWeStand destruída - removendo equipamento`);
      await this.handleEquipmentDestruction(duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else if (this.isExactCard(targetCard, 'MagePower')) {
      logger.info(`💥 [processBreakerRemoveCounter] MagePower destruída - removendo equipamento`);
      await this.handleEquipmentDestruction(duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else {
      // Se outra spell/trap foi destruída, recalcular ATK do MagePower ANTES de remover
      await this.recalculateMagePowerAtk(duelIdStr, duel, targetIsPlayer1);
    }

    // Remover do campo
    targetField.spellTrap[targetZoneIndex] = null;

    // Mover para o cemitério
    if (!targetField.graveyard) targetField.graveyard = [];
    targetField.graveyard.push(targetCard);

    // Recalcular ATK do Breaker após remover marcador
    await this.recalculateBreakerAtk(duelIdStr, duel, isPlayer1);

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [processBreakerRemoveCounter] Spell/Trap destruída com sucesso!`);
    return { success: true };
  }

  /**
   * Processa a escolha de alvo para Mystical Space Typhoon
   */
  async processMysticalSpaceTyphoonChoice(duelId: string | number, userId: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Validar índice da zona
    if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    // Verificar se há pendingChoice
    if (!duel.pendingChoice || duel.pendingChoice.type !== 'MYSTICAL_SPACE_TYPHOON') {
      return { success: false, message: 'Não há escolha pendente de Mystical Space Typhoon' };
    }

    const spellTrapZoneIndex = duel.pendingChoice.data?.spellTrapZoneIndex;
    if (spellTrapZoneIndex === undefined || spellTrapZoneIndex === null) {
      return { success: false, message: 'Índice da zona de Mystical Space Typhoon não encontrado' };
    }

    // Determinar qual campo tem o alvo
    const targetField = targetPlayer === 'player' ? playerField : opponentField;
    const targetIsPlayer1 = targetPlayer === 'player' ? isPlayer1 : !isPlayer1;
    
    // Garantir que spellTrap seja um array válido
    if (!targetField.spellTrap || !Array.isArray(targetField.spellTrap)) {
      targetField.spellTrap = [null, null, null, null, null];
    }
    while (targetField.spellTrap.length < 5) {
      targetField.spellTrap.push(null);
    }
    targetField.spellTrap = targetField.spellTrap.slice(0, 5);

    // Verificar se há spell/trap na zona alvo
    if (!targetField.spellTrap || !targetField.spellTrap[targetZoneIndex]) {
      return { success: false, message: 'Não há spell/trap na zona selecionada' };
    }

    const targetCard = targetField.spellTrap[targetZoneIndex];
    const targetCardId = targetCard.idCarta || targetCard.id || targetCard.cardId;

    // Não pode destruir a própria Mystical Space Typhoon
    if (targetPlayer === 'player' && targetZoneIndex === spellTrapZoneIndex) {
      const mstCardId = targetCardId;
      const isMST = this.isExactCard({ idCarta: mstCardId }, 'MysticalSpaceTyphoon');
      if (isMST) {
        return { success: false, message: 'Você não pode escolher Mystical Space Typhoon como alvo' };
      }
    }

    logger.info(`✨ [processMysticalSpaceTyphoonChoice] Destruindo spell/trap: ${targetCard.name || targetCard.cardName || 'Desconhecida'}`);

    // Verificar se é ChangeOfHeart, BrainControl, UnitedWeStand ou MagePower - processar efeitos especiais
    if (this.isExactCard(targetCard, 'ChangeOfHeart')) {
      logger.info(`💥 [processMysticalSpaceTyphoonChoice] ChangeOfHeart destruída - devolvendo monstros controlados`);
      await this.returnChangeOfHeartMonsters(duelIdStr, duel, targetIsPlayer1);
    } else if (this.isExactCard(targetCard, 'BrainControl')) {
      logger.info(`💥 [processMysticalSpaceTyphoonChoice] BrainControl destruída - devolvendo monstros controlados`);
      await this.returnChangeOfHeartMonsters(duelIdStr, duel, targetIsPlayer1);
    } else if (this.isExactCard(targetCard, 'UnitedWeStand')) {
      logger.info(`💥 [processMysticalSpaceTyphoonChoice] UnitedWeStand destruída - removendo equipamento`);
      await this.handleEquipmentDestruction(duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else if (this.isExactCard(targetCard, 'MagePower')) {
      logger.info(`💥 [processMysticalSpaceTyphoonChoice] MagePower destruída - removendo equipamento`);
      await this.handleEquipmentDestruction(duelIdStr, duel, targetIsPlayer1, undefined, targetCard, targetZoneIndex);
    } else {
      // Se outra spell/trap foi destruída, recalcular ATK do MagePower ANTES de remover
      await this.recalculateMagePowerAtk(duelId, duel, targetIsPlayer1);
    }

    // Remover do campo
    targetField.spellTrap[targetZoneIndex] = null;

    // Mover para o cemitério
    if (!targetField.graveyard) targetField.graveyard = [];
    targetField.graveyard.push(targetCard);

    // Mover Mystical Space Typhoon para o cemitério
    if (playerField && playerField.spellTrap && playerField.spellTrap[spellTrapZoneIndex]) {
      const mstCard = playerField.spellTrap[spellTrapZoneIndex];
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(mstCard);
      playerField.spellTrap[spellTrapZoneIndex] = null;
      logger.info(`✅ [processMysticalSpaceTyphoonChoice] Mystical Space Typhoon movida para o cemitério`);
    }

    // Limpar pendingChoice e salvar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    logger.info(`✅ [processMysticalSpaceTyphoonChoice] Spell/Trap destruída com sucesso!`);
    return { success: true };
  }

  /**
   * Processa a escolha de alvo do SnowmanEater
   * Destrói o monstro face-up escolhido
   */
  async processSnowmanEaterChoice(duelId: string | number, userId: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Buscar duelo do banco
    let duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    // Verificar se há pendingChoice
    if (!duel.pendingChoice || duel.pendingChoice.type !== 'SNOWMAN_EATER') {
      return { success: false, message: 'Não há escolha pendente do SnowmanEater' };
    }

    // Verificar se é o jogador correto
    if (duel.pendingChoice.userId !== userId) {
      return { success: false, message: 'Não é sua vez de escolher' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;

    // Obter campo do alvo
    const targetField = targetPlayer === 'player' 
      ? (isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field)
      : (isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field);

    if (!targetField || !targetField.monsters || !Array.isArray(targetField.monsters)) {
      return { success: false, message: 'Campo do alvo não encontrado' };
    }

    // Verificar se o índice é válido
    if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    const targetMonster = targetField.monsters[targetZoneIndex];
    if (!targetMonster || targetMonster === null) {
      return { success: false, message: 'Não há monstro na zona especificada' };
    }

    // Verificar se o monstro está face-up (attack ou defense)
    if (targetMonster.position !== 'attack' && targetMonster.position !== 'defense') {
      return { success: false, message: 'O monstro alvo deve estar face-up (ataque ou defesa)' };
    }

    // Obter dados do SnowmanEater
    const snowmanEaterZoneIndex = duel.pendingChoice.data?.monsterZoneIndex;
    if (snowmanEaterZoneIndex === undefined || snowmanEaterZoneIndex < 0 || snowmanEaterZoneIndex >= 5) {
      return { success: false, message: 'Zona do SnowmanEater inválida' };
    }

    const snowmanEaterField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const snowmanEater = snowmanEaterField?.monsters?.[snowmanEaterZoneIndex];
    
    if (!snowmanEater) {
      return { success: false, message: 'SnowmanEater não encontrado no campo' };
    }

    const snowmanEaterId = snowmanEater.idCarta || snowmanEater.id || snowmanEater.cardId;
    const snowmanEaterName = (snowmanEater.name || snowmanEater.cardName || '').toLowerCase();
    const isSnowmanEater = this.isExactCard(snowmanEater, 'SnowmanEater');

    if (!isSnowmanEater) {
      return { success: false, message: 'Carta no campo não é SnowmanEater' };
    }

    logger.info(`✨ [processSnowmanEaterChoice] Destruindo monstro: ${targetMonster.name || targetMonster.cardName || 'Desconhecido'}`);

    // Verificar se o monstro tinha equipamento antes de destruir
    await this.handleEquipmentDestruction(duelId, duel, targetPlayer === 'player' ? isPlayer1 : !isPlayer1, targetMonster);

    // Mover monstro alvo para o cemitério
    targetField.monsters[targetZoneIndex] = null;
    if (!targetField.graveyard) {
      targetField.graveyard = [];
    }
    targetField.graveyard.push(targetMonster);

    logger.info(`✅ [processSnowmanEaterChoice] Monstro destruído com sucesso!`);

    // Limpar pendingChoice e salvar no banco
    await this.updateDuelInDatabase(duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return { success: true };
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
      
      // Coletar todos os índices de zonas spell/trap que precisam ser verificadas
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
      
      // Busca alternativa: verificar todas as zonas spell/trap para encontrar equipamentos órfãos
      // Um equipamento é órfão se:
      // 1. É do tipo Equip
      // 2. Está referenciando uma zona de monstro que está vazia (null)
      // Isso garante que mesmo se os dados do monstro não tiverem as referências corretas, ainda encontraremos os equipamentos
      logger.info(`🔍 [handleEquipmentDestruction] Verificando todas as zonas spell/trap para encontrar equipamentos órfãos`);
      
      for (let i = 0; i < playerField.spellTrap.length; i++) {
        const spellTrapCard = playerField.spellTrap[i];
        if (spellTrapCard && spellTrapCard !== null) {
          const cardId = spellTrapCard.idCarta || spellTrapCard.id || spellTrapCard.cardId;
          const spellType = spellTrapCard.spellType;
          const isEquipSpell = spellType === 'Equip' || 
                              (cardId && (
                                cardId.toLowerCase().includes('unitedwestand') ||
                                cardId.toLowerCase().includes('magepower') ||
                                cardId.toLowerCase().includes('equip')
                              ));
          
          if (isEquipSpell) {
            // Verificar se o equipamento está referenciando uma zona de monstro vazia
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
          const equipCardId = equipCard.idCarta || equipCard.id || equipCard.cardId;
          const equipCardName = equipCard.name || equipCard.cardName || equipCardId;
          
          // Verificar se é realmente um equipamento (UnitedWeStand, MagePower, etc)
          const isEquipSpell = equipCard.spellType === 'Equip' || 
                              (equipCardId && (
                                equipCardId.toLowerCase().includes('unitedwestand') ||
                                equipCardId.toLowerCase().includes('magepower') ||
                                equipCardId.toLowerCase().includes('equip')
                              ));
          
          if (isEquipSpell) {
            // Mover para o cemitério
            playerField.graveyard.push(equipCard);
            playerField.spellTrap[zoneIndex] = null;
            movedCount++;
            logger.info(`💥 [handleEquipmentDestruction] Equipamento ${equipCardName} (zona ${zoneIndex}) movido para o cemitério`);
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
            const cardId = spellTrapCard.idCarta || spellTrapCard.id || spellTrapCard.cardId;
            const spellType = spellTrapCard.spellType;
            const isEquipSpell = spellType === 'Equip' || 
                                (cardId && (
                                  cardId.toLowerCase().includes('unitedwestand') ||
                                  cardId.toLowerCase().includes('magepower') ||
                                  cardId.toLowerCase().includes('equip')
                                ));
            
            if (isEquipSpell) {
              const equippedToZone = spellTrapCard.equippedToMonsterZoneIndex;
              
              // Se o equipamento referencia uma zona de monstro que está vazia, é um equipamento órfão
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
    
    // Se UnitedWeStand ou MagePower foi destruída, remover equipamento de todos os monstros
    if (destroyedSpellTrap && spellTrapZoneIndex !== undefined && spellTrapZoneIndex !== null) {
      const cardId = destroyedSpellTrap.idCarta || destroyedSpellTrap.id || destroyedSpellTrap.cardId;
      
      if (this.isExactCard({ idCarta: cardId }, 'UnitedWeStand')) {
        
        // Encontrar e remover equipamento do monstro usando referência única
        if (playerField && playerField.monsters) {
          const uniqueEquipRef = `${cardId}:${spellTrapZoneIndex}`;
          
          playerField.monsters.forEach((monster: any) => {
            if (monster) {
              // Remover do array de equips se existir
              if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
                // Procurar pela referência única primeiro
                let index = monster.equippedCards.indexOf(uniqueEquipRef);
                
                // Se não encontrou, procurar apenas pelo cardId (compatibilidade)
                if (index === -1) {
                  index = monster.equippedCards.indexOf(cardId);
                }
                
                if (index > -1) {
                  monster.equippedCards.splice(index, 1);
                  logger.info(`💥 [handleEquipmentDestruction] Removendo UnitedWeStand (${uniqueEquipRef}) do array de equips do monstro ${monster.name || monster.cardName}`);
                  
                  // Se não há mais equips, limpar propriedades
                  if (monster.equippedCards.length === 0) {
                    delete monster.equippedBy;
                    delete monster.equippedCardId;
                    delete monster.equippedSpellTrapZoneIndex;
                    delete monster.equipmentBonusAtk;
                    delete monster.equippedCards;
                  } else {
                    // Atualizar equippedCardId para o último equip restante (extrair cardId da referência)
                    const lastEquipRef = monster.equippedCards[monster.equippedCards.length - 1];
                    const lastCardId = lastEquipRef.includes(':') ? lastEquipRef.split(':')[0] : lastEquipRef;
                    monster.equippedCardId = lastCardId;
                    // Recalcular bônus total
                    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
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
              }
            }
          });
        }
      } else if (this.isExactCard({ idCarta: cardId }, 'MagePower')) {
        
        // Encontrar e remover equipamento do monstro usando referência única
        if (playerField && playerField.monsters) {
          const uniqueEquipRef = `${cardId}:${spellTrapZoneIndex}`;
          
          playerField.monsters.forEach((monster: any) => {
            if (monster) {
              // Remover do array de equips se existir
              if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
                // Procurar pela referência única primeiro
                let index = monster.equippedCards.indexOf(uniqueEquipRef);
                
                // Se não encontrou, procurar apenas pelo cardId (compatibilidade)
                if (index === -1) {
                  index = monster.equippedCards.indexOf(cardId);
                }
                
                if (index > -1) {
                  monster.equippedCards.splice(index, 1);
                  logger.info(`💥 [handleEquipmentDestruction] Removendo MagePower (${uniqueEquipRef}) do array de equips do monstro ${monster.name || monster.cardName}`);
                  
                  // Se não há mais equips, limpar propriedades
                  if (monster.equippedCards.length === 0) {
                    delete monster.equippedBy;
                    delete monster.equippedCardId;
                    delete monster.equippedSpellTrapZoneIndex;
                    delete monster.equipmentBonusAtk;
                    delete monster.equippedCards;
                  } else {
                    // Atualizar equippedCardId para o último equip restante (extrair cardId da referência)
                    const lastEquipRef = monster.equippedCards[monster.equippedCards.length - 1];
                    const lastCardId = lastEquipRef.includes(':') ? lastEquipRef.split(':')[0] : lastEquipRef;
                    monster.equippedCardId = lastCardId;
                    // Recalcular bônus total
                    monster.equipmentBonusAtk = this.calculateTotalEquipmentBonus(monster, playerField);
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
    }
  }

  /**
   * Calcula o bônus de ATK do equipamento de um monstro
   * Segundo as regras do Yu-Gi-Oh, apenas uma carta de equipamento pode estar ativa por vez
   */
  private calculateTotalEquipmentBonus(monster: any, playerField: any): number {
    if (!monster) return 0;
    
    let totalBonus = 0;
    
    // Suportar array de equips (novo sistema) ou equippedCardId único (compatibilidade)
    const equippedCards: string[] = [];
    
    if (monster.equippedCards && Array.isArray(monster.equippedCards)) {
      // Novo sistema: array de equips (apenas um equipamento por vez)
      equippedCards.push(...monster.equippedCards);
    } else if (monster.equippedCardId) {
      // Sistema antigo: equip único (compatibilidade)
      equippedCards.push(monster.equippedCardId);
    }
    
    logger.info(`🔍 [calculateTotalEquipmentBonus] Monstro: ${monster.name || monster.cardName}, Equips: ${equippedCards.length} (${equippedCards.join(', ')})`);
    
    // Calcular bônus do equipamento (apenas um equipamento por vez)
    equippedCards.forEach((equippedCardRef: string, index: number) => {
      // A referência pode ser "cardId:zoneIndex" ou apenas "cardId" (compatibilidade)
      const parts = (equippedCardRef || '').split(':');
      const cardId = parts[0];
      const cardIdLower = cardId.toLowerCase();
      
      // UnitedWeStand: +800 ATK por cada monstro face-up no campo
      if (cardIdLower.includes('unitedwestand')) {
        const faceUpMonsters = playerField?.monsters?.filter((m: any) => 
          m !== null && m !== undefined && (m.position === 'attack' || m.position === 'defense')
        ) || [];
        const bonusAtk = faceUpMonsters.length * 800;
        totalBonus += bonusAtk;
        logger.info(`📊 [calculateTotalEquipmentBonus] [${index + 1}/${equippedCards.length}] UnitedWeStand (${equippedCardRef}): ${faceUpMonsters.length} monstros face-up = +${bonusAtk} ATK (total: ${totalBonus})`);
      }
      
      // MagePower: +500 ATK por cada carta na zona spell/trap
      if (cardIdLower.includes('magepower')) {
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
        const bonusAtk = spellTrapCards.length * 500;
        totalBonus += bonusAtk;
        logger.info(`📊 [calculateTotalEquipmentBonus] [${index + 1}/${equippedCards.length}] MagePower (${equippedCardRef}): ${spellTrapCards.length} cartas spell/trap = +${bonusAtk} ATK (total: ${totalBonus})`);
        logger.info(`🔍 [calculateTotalEquipmentBonus] Spell/Trap cards: ${spellTrapCards.map((c: any) => c?.name || 'null').join(', ')}`);
      }
    });
    
    logger.info(`✅ [calculateTotalEquipmentBonus] Monstro ${monster.name || monster.cardName} - Bônus total final: +${totalBonus} ATK`);
    return totalBonus;
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
   * Recalcula UnitedWeStand para ambos os jogadores (quando o número de monstros face-up muda)
   */
  private async recalculateUnitedWeStandForBothPlayers(duelId: string | number, duel: Duel): Promise<void> {
    logger.info(`🔄 [recalculateUnitedWeStandForBothPlayers] Recalculando UnitedWeStand para ambos os jogadores`);
    await this.recalculateUnitedWeStandAtk(duelId, duel, true);
    await this.recalculateUnitedWeStandAtk(duelId, duel, false);
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
   * Processa efeitos de flip (quando monstro é virado de face-down para face-up)
   */
  private async processFlipEffect(duelId: string | number, duel: Duel, isPlayer1: boolean, card: any, zoneIndex: number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    try {
      const cardId = card.idCarta || card.id || card.cardId;
      const cardName = (card.name || card.cardName || '').toLowerCase();
      
      // SnowmanEater - Escolher 1 monstro face-up no campo e destruí-lo
      const isSnowmanEater = this.isExactCard(card, 'SnowmanEater');
      
      if (isSnowmanEater) {
        logger.info(`✨ [processFlipEffect] Processando efeito de flip do SnowmanEater`);
        
        // Verificar se há monstros face-up no campo
        const player1Field = (duel as any).player1Field;
        const player2Field = (duel as any).player2Field;
        
        let hasFaceUpMonsters = false;
        
        // Verificar monstros do Player 1
        if (player1Field && player1Field.monsters && Array.isArray(player1Field.monsters)) {
          for (const monster of player1Field.monsters) {
            if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
              hasFaceUpMonsters = true;
              break;
            }
          }
        }
        
        // Verificar monstros do Player 2
        if (!hasFaceUpMonsters && player2Field && player2Field.monsters && Array.isArray(player2Field.monsters)) {
          for (const monster of player2Field.monsters) {
            if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
              hasFaceUpMonsters = true;
              break;
            }
          }
        }
        
        if (!hasFaceUpMonsters) {
          logger.info(`ℹ️ [processFlipEffect] SnowmanEater: Não há monstros face-up no campo para destruir`);
          return;
        }
        
        // Criar pendingChoice para seleção de alvo
        const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
        await this.setPendingChoice(duelIdStr, {
          type: 'SNOWMAN_EATER',
          userId: userId,
          data: {
            monsterZoneIndex: zoneIndex, // Zona onde está SnowmanEater
          },
          turnWhenStarted: duel.currentTurn,
          phaseWhenStarted: duel.currentPhase,
        });
        
        logger.info(`✅ [processFlipEffect] PendingChoice criado para SnowmanEater`);
        
        // Atualizar no banco
        await this.updateDuelInDatabase(duelIdStr, {
          player1Field: player1Field,
          player2Field: player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelIdStr, duel);
        return;
      }
      
      // Fiber Jar - Todas as cartas voltam para os decks e cada jogador compra 5 cartas
      if (this.isExactCard(card, 'FiberJar')) {
        logger.info(`✨ [processFlipEffect] Processando efeito de flip do Fiber Jar`);
        
        const player1Field = (duel as any).player1Field;
        const player2Field = (duel as any).player2Field;
        
        // Coletar todas as cartas de ambos os jogadores
        const allPlayer1Cards: any[] = [];
        const allPlayer2Cards: any[] = [];
        
        // PRIMEIRO: Incluir o deck atual (se existir)
        if (player1Field.deck && Array.isArray(player1Field.deck)) {
          allPlayer1Cards.push(...player1Field.deck);
        }
        
        if (player2Field.deck && Array.isArray(player2Field.deck)) {
          allPlayer2Cards.push(...player2Field.deck);
        }
        
        // Cartas do campo (monstros) - incluir TODAS, incluindo o próprio Fiber Jar
        // O Fiber Jar está no campo e será coletado junto com os outros monstros
        if (player1Field.monsters) {
          for (let i = 0; i < player1Field.monsters.length; i++) {
            if (player1Field.monsters[i] !== null && player1Field.monsters[i] !== undefined) {
              // Coletar TODAS as cartas do campo, incluindo o Fiber Jar
              allPlayer1Cards.push(player1Field.monsters[i]);
              player1Field.monsters[i] = null;
            }
          }
        }
        
        if (player2Field.monsters) {
          for (let i = 0; i < player2Field.monsters.length; i++) {
            if (player2Field.monsters[i] !== null && player2Field.monsters[i] !== undefined) {
              // Coletar TODAS as cartas do campo, incluindo o Fiber Jar
              allPlayer2Cards.push(player2Field.monsters[i]);
              player2Field.monsters[i] = null;
            }
          }
        }
        
        // Cartas spell/trap
        if (player1Field.spellTrap) {
          for (let i = 0; i < player1Field.spellTrap.length; i++) {
            if (player1Field.spellTrap[i] !== null && player1Field.spellTrap[i] !== undefined) {
              allPlayer1Cards.push(player1Field.spellTrap[i]);
              player1Field.spellTrap[i] = null;
            }
          }
        }
        
        if (player2Field.spellTrap) {
          for (let i = 0; i < player2Field.spellTrap.length; i++) {
            if (player2Field.spellTrap[i] !== null && player2Field.spellTrap[i] !== undefined) {
              allPlayer2Cards.push(player2Field.spellTrap[i]);
              player2Field.spellTrap[i] = null;
            }
          }
        }
        
        // Cartas da mão
        if (player1Field.hand && Array.isArray(player1Field.hand)) {
          allPlayer1Cards.push(...player1Field.hand);
          player1Field.hand = [];
        }
        
        if (player2Field.hand && Array.isArray(player2Field.hand)) {
          allPlayer2Cards.push(...player2Field.hand);
          player2Field.hand = [];
        }
        
        // Cartas do cemitério
        if (player1Field.graveyard && Array.isArray(player1Field.graveyard)) {
          allPlayer1Cards.push(...player1Field.graveyard);
          player1Field.graveyard = [];
        }
        
        if (player2Field.graveyard && Array.isArray(player2Field.graveyard)) {
          allPlayer2Cards.push(...player2Field.graveyard);
          player2Field.graveyard = [];
        }
        
        // Embaralhar as cartas
        const shuffleArray = (array: any[]) => {
          const shuffled = [...array];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          return shuffled;
        };
        
        // Embaralhar e definir como novo deck
        const shuffledPlayer1Deck = shuffleArray(allPlayer1Cards);
        const shuffledPlayer2Deck = shuffleArray(allPlayer2Cards);
        
        player1Field.deck = shuffledPlayer1Deck;
        player2Field.deck = shuffledPlayer2Deck;
        
        logger.info(`✅ [processFlipEffect] Fiber Jar: ${allPlayer1Cards.length} cartas do Player 1 e ${allPlayer2Cards.length} cartas do Player 2 voltaram para os decks`);
        
        // ATUALIZAR NO BANCO ANTES DE COMPRAR CARTAS
        await this.updateDuelInDatabase(duelIdStr, {
          player1Field: player1Field,
          player2Field: player2Field,
        } as any);
        
        // Atualizar cache
        this.activeDuels.set(duelIdStr, duel);
        
        // AGORA cada jogador compra 5 cartas (usando o deck atualizado)
        const player1Id = duel.player1Id;
        const player2Id = duel.player2Id;
        
        // Comprar 5 cartas para cada jogador
        for (let i = 0; i < 5; i++) {
          // Buscar duelo atualizado do cache/banco antes de cada compra
          let currentDuel = this.activeDuels.get(duelIdStr);
          if (!currentDuel) {
            const duelFromDb = await this.findDuelByIdFromDatabase(duelIdStr);
            if (duelFromDb) {
              currentDuel = duelFromDb;
              this.activeDuels.set(duelIdStr, currentDuel);
            }
          }
          
          if (currentDuel) {
            const p1Field = (currentDuel as any).player1Field;
            const p2Field = (currentDuel as any).player2Field;
            
            // Comprar carta do Player 1
            if (p1Field && p1Field.deck && p1Field.deck.length > 0) {
              const card1 = p1Field.deck.shift();
              if (card1) {
                if (!p1Field.hand) p1Field.hand = [];
                p1Field.hand.push(card1);
              }
            }
            
            // Comprar carta do Player 2
            if (p2Field && p2Field.deck && p2Field.deck.length > 0) {
              const card2 = p2Field.deck.shift();
              if (card2) {
                if (!p2Field.hand) p2Field.hand = [];
                p2Field.hand.push(card2);
              }
            }
            
            // Atualizar no banco após cada compra
            await this.updateDuelInDatabase(duelIdStr, {
              player1Field: p1Field,
              player2Field: p2Field,
            } as any);
            
            // Atualizar cache
            this.activeDuels.set(duelIdStr, currentDuel);
          }
        }
        
        logger.info(`✅ [processFlipEffect] Fiber Jar: Cada jogador comprou 5 cartas`);
        
        // Buscar duelo final atualizado
        const finalDuel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (finalDuel) {
          Object.assign(duel, finalDuel);
          this.activeDuels.set(duelIdStr, duel);
        }
      }
    } catch (error) {
      logger.error(`❌ [processFlipEffect] Erro ao processar efeito de flip:`, error);
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

    // Verificar se SwordsOfRevealingLight está bloqueando ataques
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    if (opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
      for (const spellTrap of opponentField.spellTrap) {
        if (spellTrap && spellTrap !== null && spellTrap.position === 'face-up') {
          const cardId = spellTrap.idCarta || spellTrap.id || spellTrap.cardId;
          const cardName = (spellTrap.name || spellTrap.cardName || '').toLowerCase();
          const isSwordsOfRevealingLight = this.isExactCard(spellTrap, 'SwordsOfRevealingLight');
          
          if (isSwordsOfRevealingLight) {
            logger.info(`🛡️ [attackMonster] SwordsOfRevealingLight bloqueando ataque do oponente`);
            return { success: false, message: 'SwordsOfRevealingLight está bloqueando seus ataques!' };
          }
        }
      }
    }

    let attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    let defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    if (!attackerField || !attackerField.monsters) {
      return { success: false, message: 'Campo do atacante não encontrado' };
    }

    // Verificar se o monstro atacante existe e está em posição de ataque
    let attacker = attackerField.monsters[attackerZoneIndex];
    if (!attacker || attacker.position !== 'attack') {
      return { success: false, message: 'Monstro atacante inválido ou não está em posição de ataque' };
    }

    // Verificar se ChaosSorcerer não pode atacar (efeito usado neste turno)
    if (attacker.cannotAttackThisTurn === true) {
      return { success: false, message: 'ChaosSorcerer não pode atacar no turno em que você ativar seu efeito!' };
    }

    // Verificar se é MatazaTheZapper (pode atacar 2 vezes)
    const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
    const attackerName = (attacker.name || attacker.cardName || '').toLowerCase();
    const isMatazaTheZapper = attackerCardId === 'MatazaTheZapper' || 
                              attackerCardId === 'matazathezapper' ||
                              attackerName === 'mataza the zapper' ||
                              attackerName === 'matazathezapper' ||
                              this.isExactCard(attacker, 'MatazaTheZapper');
    
    // Inicializar contador de ataques se não existir
    if (attacker.attacksThisTurn === undefined || attacker.attacksThisTurn === null) {
      attacker.attacksThisTurn = 0;
    }
    
    // Inicializar attackedThisTurn se não existir (para compatibilidade)
    if (attacker.attackedThisTurn === undefined || attacker.attackedThisTurn === null) {
      attacker.attackedThisTurn = false;
    }

    // Verificar se o monstro já atacou o máximo permitido neste turno
    const maxAttacks = isMatazaTheZapper ? 2 : 1;
    logger.info(`🔍 [attackMonster] Verificando ataques - Monstro: ${attacker.name || attacker.cardName}, CardId: ${attackerCardId}, isMatazaTheZapper: ${isMatazaTheZapper}, attacksThisTurn: ${attacker.attacksThisTurn}, maxAttacks: ${maxAttacks}`);
    
    if (attacker.attacksThisTurn >= maxAttacks) {
      const message = isMatazaTheZapper 
        ? 'Mataza The Zapper já atacou 2 vezes neste turno!'
        : 'Este monstro já atacou neste turno. Cada monstro só pode atacar uma vez por turno!';
      logger.info(`❌ [attackMonster] Bloqueando ataque - ${message}`);
      return { success: false, message };
    }
    
    logger.info(`✅ [attackMonster] Ataque permitido - ${attacker.name || attacker.cardName} pode atacar (${attacker.attacksThisTurn}/${maxAttacks})`);

    // Verificar Mirror Force do oponente ANTES de processar o ataque
    const mirrorForceActivated = await this.checkAndActivateMirrorForce(duelId, duel, isPlayer1);
    if (mirrorForceActivated) {
      // Se Mirror Force foi ativada, o ataque é cancelado e os monstros já foram destruídos
      // Re-buscar o duelo do banco após verificar Mirror Force (pode ter mudado)
      duel = await this.findDuelByIdFromDatabase(duelIdStr);
      if (duel) {
        const updatedAttackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
        const updatedAttacker = updatedAttackerField?.monsters?.[attackerZoneIndex];
        
        if (!updatedAttacker || updatedAttacker.position !== 'attack') {
          // O atacante foi destruído pelo Mirror Force
          logger.info(`🪞 [attackMonster] Ataque cancelado - Mirror Force destruiu o monstro atacante`);
          return { success: false, message: 'Mirror Force foi ativada! Todos os seus monstros em modo de ataque foram destruídos.' };
        }
      }
    }

    // Re-buscar o duelo do banco após verificar Mirror Force (pode ter mudado)
    duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    // Re-obter referências após atualização
    attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    defenderField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Verificar se o atacante ainda existe e está em posição de ataque
    attacker = attackerField?.monsters?.[attackerZoneIndex];
    if (!attacker || attacker.position !== 'attack') {
      logger.info(`🪞 [attackMonster] Ataque cancelado - monstro atacante foi destruído pelo Mirror Force`);
      return { success: false, message: 'Mirror Force foi ativada! Seu monstro atacante foi destruído.' };
    }

    // Calcular ATK total incluindo equipamentos
    const attackerBaseAtk = attacker.atk || 0;
    const attackerEquipmentBonus = attacker.equipmentBonusAtk || 0;
    const attackerSpellCounterBonus = attacker.spellCounterBonusAtk || 0;
    const attackerBannerOfCourageBonus = this.getBannerOfCourageBonus(duel, isPlayer1, duel.currentPhase);
    const attackerAtk = attackerBaseAtk + attackerEquipmentBonus + attackerSpellCounterBonus + attackerBannerOfCourageBonus;

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

      // Ataque direto: reduzir LP do oponente pelo ATK do atacante
      const defenderLifePoints = isPlayer1 ? duel.player2LifePoints : duel.player1LifePoints;
      const newLifePoints = Math.max(0, defenderLifePoints - attackerAtk);
      const damageDealt = defenderLifePoints - newLifePoints;
      
      if (isPlayer1) {
        duel.player2LifePoints = newLifePoints;
      } else {
        duel.player1LifePoints = newLifePoints;
      }

      // Verificar se o duelo terminou
      if (newLifePoints <= 0) {
        await this.finishDuel(duelId, isPlayer1 ? DuelResult.PLAYER1_WIN : DuelResult.PLAYER2_WIN, userId);
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

      // Processar efeito do AxeDragonute: mudar para defesa no final da Etapa de Dano (ataque direto)
      attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      const attackerAfterDirectAttack = attackerField?.monsters?.[attackerZoneIndex];
      
      if (attackerAfterDirectAttack) {
        const attackerCardId = attackerAfterDirectAttack.idCarta || attackerAfterDirectAttack.id || attackerAfterDirectAttack.cardId;
        const attackerName = (attackerAfterDirectAttack.name || attackerAfterDirectAttack.cardName || '').toLowerCase();
        const isAxeDragonute = attackerCardId === 'AxeDragonute' || 
                              attackerCardId === 'axedragonute' ||
                              attackerName === 'axedragonute' ||
                              (typeof attackerCardId === 'string' && attackerCardId.toLowerCase().includes('axedragonute'));
        
        if (isAxeDragonute && attackerAfterDirectAttack.position === 'attack') {
          logger.info(`🪓 [attackMonster] AxeDragonute atacou diretamente - mudando para posição de defesa no final da Etapa de Dano`);
          attackerAfterDirectAttack.position = 'defense';
          logger.info(`✅ [attackMonster] AxeDragonute mudado para posição de defesa (ataque direto)`);
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
    if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Alvo inválido' };
    }

    const target = opponentMonsters[targetZoneIndex];
    if (!target) {
      return { success: false, message: 'Não há monstro no alvo especificado' };
    }

    let damage = 0;
    let destroyed = false;
    const targetPosition = target.position;

    if (targetPosition === 'attack') {
      // Ataque vs Ataque: comparar ATK (incluindo equipamentos e marcadores)
      const targetBaseAtk = target.atk || 0;
      const targetEquipmentBonus = target.equipmentBonusAtk || 0;
      const targetSpellCounterBonus = target.spellCounterBonusAtk || 0;
      const targetBannerOfCourageBonus = this.getBannerOfCourageBonus(duel, !isPlayer1, duel.currentPhase);
      const targetAtk = targetBaseAtk + targetEquipmentBonus + targetSpellCounterBonus + targetBannerOfCourageBonus;
      
      // Verificar se é Marshmallon
      const targetCardId = target.idCarta || target.id || target.cardId;
      const targetName = (target.name || target.cardName || '').toLowerCase();
      const isMarshmallon = targetCardId === 'Marshmallon' || 
                           targetCardId === 'marshmallon' ||
                           targetName === 'marshmallon' ||
                           (typeof targetCardId === 'string' && targetCardId.toLowerCase().includes('marshmallon'));
      
      if (attackerAtk > targetAtk) {
        // Atacante vence: normalmente destruiria o alvo
        // MAS: Marshmallon não pode ser destruído em batalha
        if (isMarshmallon) {
          // Marshmallon não é destruído em batalha
          destroyed = false;
          damage = attackerAtk - targetAtk;
          
          // Aplicar dano ao oponente normalmente
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
          
          // Processar efeito do WhiteMagicalHat e MaskedSorcerer se causou dano ao oponente
          if (damage > 0) {
            await this.processWhiteMagicalHatEffect(duelIdStr, duel, isPlayer1, attacker);
            await this.processMaskedSorcererEffect(duelIdStr, duel, isPlayer1, attacker);
          }
          
          logger.info(`🛡️ [attackMonster] Marshmallon não pode ser destruído em batalha - permanece no campo`);
        } else {
          // Monstro normal: destruir alvo, diferença reduz LP do oponente
          destroyed = true;
          damage = attackerAtk - targetAtk;
          
          // IMPORTANTE: Verificar se o monstro alvo tinha equipamento ANTES de remover do campo
          await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, target);
          
          // Agora remover do campo e mover para o cemitério
          defenderField.monsters[targetZoneIndex] = null;
          
          // Mover para o cemitério
          if (!defenderField.graveyard) defenderField.graveyard = [];
          defenderField.graveyard.push(target);
          
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
      } else if (targetAtk > attackerAtk) {
        // Alvo vence: destruir atacante, diferença reduz LP do atacante
        destroyed = true;
        damage = targetAtk - attackerAtk;
        
        // IMPORTANTE: Verificar se o atacante tinha equipamento ANTES de remover do campo
        await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
        
        // Agora remover do campo e mover para o cemitério
        attackerField.monsters[attackerZoneIndex] = null;
        
        // Mover para o cemitério
        if (!attackerField.graveyard) attackerField.graveyard = [];
        attackerField.graveyard.push(attacker);
        
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
      } else {
        // Empate: normalmente ambos seriam destruídos
        // MAS: Marshmallon não pode ser destruído em batalha
        if (isMarshmallon) {
          // Marshmallon não é destruído, mas o atacante é destruído normalmente
          destroyed = true;
          attackerField.monsters[attackerZoneIndex] = null;
          
          // Verificar se o atacante é Fiber Jar
          const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
          const attackerIsFiberJar = this.isExactCard(attacker, 'FiberJar');
          
          // Mover atacante para o cemitério (exceto Fiber Jar se foi processado)
          if (!attackerField.graveyard) attackerField.graveyard = [];
          if (!attackerIsFiberJar || !fiberJarActivated) {
            // Verificar se o atacante tinha equipamento antes de destruir
            await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
            attackerField.graveyard.push(attacker);
          } else {
            logger.info(`✅ [attackMonster] Atacante Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
          }
          
          // Marshmallon permanece no campo
          logger.info(`🛡️ [attackMonster] Marshmallon não pode ser destruído em batalha (empate) - permanece no campo`);
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
          
          // Mover para os cemitérios (exceto Fiber Jar se foi processado)
          if (!attackerField.graveyard) attackerField.graveyard = [];
          if (!defenderField.graveyard) defenderField.graveyard = [];
          
          // Se o atacante não for Fiber Jar processado, enviar para o cemitério
          if (!attackerIsFiberJar || !fiberJarActivated) {
            // Verificar se o atacante tinha equipamento ANTES de remover do campo
            await this.handleEquipmentDestruction(duelId, duel, isPlayer1, attacker);
            // Agora remover do campo
            attackerField.monsters[attackerZoneIndex] = null;
            attackerField.graveyard.push(attacker);
          } else {
            logger.info(`✅ [attackMonster] Atacante Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
            attackerField.monsters[attackerZoneIndex] = null;
          }
          
          // Se o defensor não for Fiber Jar processado, enviar para o cemitério
          if (!targetIsFiberJar || !fiberJarActivated) {
            // Verificar se o defensor tinha equipamento ANTES de remover do campo
            await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, target);
            // Agora remover do campo
            defenderField.monsters[targetZoneIndex] = null;
            defenderField.graveyard.push(target);
          } else {
            logger.info(`✅ [attackMonster] Defensor Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
            defenderField.monsters[targetZoneIndex] = null;
          }
        }
      }
    } else if (targetPosition === 'defense' || targetPosition === 'set') {
      // Ataque vs Defesa: comparar ATK do atacante vs DEF do defensor
      // Verificar se é Marshmallon ANTES de virar (para verificar se estava face-down)
      const targetCardId = target.idCarta || target.id || target.cardId;
      const targetName = (target.name || target.cardName || '').toLowerCase();
      const isMarshmallon = targetCardId === 'Marshmallon' || 
                           targetCardId === 'marshmallon' ||
                           targetName === 'marshmallon' ||
                           (typeof targetCardId === 'string' && targetCardId.toLowerCase().includes('marshmallon'));
      const wasFaceDown = targetPosition === 'set'; // Salvar se estava face-down antes de virar
      
      // PRIMEIRO: virar a carta de face-down (set) para face-up em defesa (defense)
      // Se já estiver em defense (face-up), manter em defense
      if (targetPosition === 'set') {
        defenderField.monsters[targetZoneIndex].position = 'defense';
        
        // Verificar se é Fiber Jar ou SnowmanEater e processar efeito de flip
        const flippedCard = defenderField.monsters[targetZoneIndex];
        const flippedCardId = flippedCard.idCarta || flippedCard.id || flippedCard.cardId;
        const flippedCardName = (flippedCard.name || flippedCard.cardName || '').toLowerCase();
        const isFiberJar = this.isExactCard(flippedCard, 'FiberJar');
        const isSnowmanEater = this.isExactCard(flippedCard, 'SnowmanEater');
        
        if (isFiberJar || isSnowmanEater) {
          const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
          await this.processFlipEffect(duelIdStr, duel, !isPlayer1, flippedCard, targetZoneIndex);
          if (isFiberJar) {
            fiberJarActivated = true;
            // O Fiber Jar já foi removido do campo e colocado no deck pelo processFlipEffect
            // Não devemos enviá-lo para o cemitério
          }
        }
      }
      
      const targetDef = target.def || 0;
      
      if (attackerAtk > targetDef) {
        // ATK > DEF: Normalmente o monstro em defesa seria destruído
        // MAS: Marshmallon não pode ser destruído em batalha
        if (isMarshmallon) {
          // Marshmallon não é destruído em batalha
          destroyed = false;
          damage = 0;
          logger.info(`🛡️ [attackMonster] Marshmallon não pode ser destruído em batalha - permanece no campo`);
        } else {
          // Monstro normal: destruir
          destroyed = true;
          
          // Verificar se é Fiber Jar e se o efeito foi ativado
          const isFiberJar = this.isExactCard(target, 'FiberJar');
          
          // Se for Fiber Jar e o efeito foi ativado, não enviar para o cemitério (já está no deck)
          if (isFiberJar && fiberJarActivated) {
            // Fiber Jar foi processado e já está no deck, apenas limpar o campo
            defenderField.monsters[targetZoneIndex] = null;
            logger.info(`✅ [attackMonster] Fiber Jar foi processado e colocado no deck, não enviado para o cemitério`);
          } else {
            // Monstro normal: enviar para o cemitério
            defenderField.monsters[targetZoneIndex] = null;
            
            // Verificar se o monstro ainda está no campo antes de enviar (pode ter sido removido por outro efeito)
            // Verificar se o defensor tinha equipamento antes de destruir
            await this.handleEquipmentDestruction(duelId, duel, !isPlayer1, target);
            if (!defenderField.graveyard) defenderField.graveyard = [];
            defenderField.graveyard.push(target);
            
            // Recalcular UnitedWeStand para ambos os jogadores (número de monstros face-up mudou)
            await this.recalculateUnitedWeStandForBothPlayers(duelId, duel);
          }
        }
        
        // Nenhum dano aos LP quando ATK > DEF (monstro em defesa destruído ou Marshmallon)
        damage = 0;
      } else {
        // ATK <= DEF: Monstro em defesa NÃO é destruído
        // Se DEF > ATK: diferença (DEF - ATK) é descontada dos LP do atacante
        // Se DEF == ATK: nenhum dano
        destroyed = false;
        
        if (targetDef > attackerAtk) {
          // DEF > ATK: diferença reduz LP do atacante
          damage = targetDef - attackerAtk;
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
        } else {
          // Empate (ATK == DEF): nenhum é destruído, nenhum dano
          damage = 0;
        }
        // O monstro permanece no campo em posição 'defense' (face-up em defesa)
      }
      
      // Processar efeito do Marshmallon APÓS o cálculo de dano
      // Se o Marshmallon foi atacado e estava face-down no começo da Etapa de Dano, o atacante sofre 1000 de dano
      if (isMarshmallon && wasFaceDown) {
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

    // Marcar que o monstro atacante já atacou neste turno
    attacker.attackedThisTurn = true;
    attacker.attacksThisTurn = (attacker.attacksThisTurn || 0) + 1;
    logger.info(`✅ [attackMonster] Flag attackedThisTurn marcada para ${attacker.name} - ataques neste turno: ${attacker.attacksThisTurn}`);

    // Processar efeito do AxeDragonute: mudar para defesa no final da Etapa de Dano
    // Re-obter referências do campo após possíveis destruições
    attackerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const attackerAfterBattle = attackerField?.monsters?.[attackerZoneIndex];
    
    if (attackerAfterBattle) {
      const attackerCardId = attackerAfterBattle.idCarta || attackerAfterBattle.id || attackerAfterBattle.cardId;
      const attackerName = (attackerAfterBattle.name || attackerAfterBattle.cardName || '').toLowerCase();
      const isAxeDragonute = attackerCardId === 'AxeDragonute' || 
                            attackerCardId === 'axedragonute' ||
                            attackerName === 'axedragonute' ||
                            (typeof attackerCardId === 'string' && attackerCardId.toLowerCase().includes('axedragonute'));
      
      if (isAxeDragonute && attackerAfterBattle.position === 'attack') {
        logger.info(`🪓 [attackMonster] AxeDragonute atacou - mudando para posição de defesa no final da Etapa de Dano`);
        attackerAfterBattle.position = 'defense';
        logger.info(`✅ [attackMonster] AxeDragonute mudado para posição de defesa`);
      }
    }

    // Atualizar no banco
    await this.updateDuelInDatabase(duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    } as any);

    this.activeDuels.set(duelIdStr, duel);
    
    logger.info(`⚔️ [attackMonster] Player ${isPlayer1 ? 1 : 2} atacou com ${attacker.name} (ATK: ${attackerAtk})`);
    
    return { success: true, damage, destroyed };
  }

  /**
   * Processa o efeito do WhiteMagicalHat: quando causa dano ao oponente, descarta uma carta aleatória da mão dele
   */
  private async processWhiteMagicalHatEffect(duelId: string, duel: Duel, isAttackerPlayer1: boolean, attacker: any): Promise<void> {
    try {
      const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
      
      // Verificar se o atacante é WhiteMagicalHat
      if (attackerCardId !== 'WhiteMagicalHat') {
        return;
      }
      
      logger.info(`✨ [processWhiteMagicalHatEffect] WhiteMagicalHat causou dano - processando efeito`);
      
      const opponentField = isAttackerPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
      
      // Verificar se o oponente tem cartas na mão
      if (!opponentField || !opponentField.hand || !Array.isArray(opponentField.hand) || opponentField.hand.length === 0) {
        logger.info(`ℹ️ [processWhiteMagicalHatEffect] Oponente não tem cartas na mão para descartar`);
        return;
      }
      
      // Escolher uma carta aleatória da mão do oponente
      const randomIndex = Math.floor(Math.random() * opponentField.hand.length);
      const cardToDiscard = opponentField.hand.splice(randomIndex, 1)[0];
      
      // Adicionar ao cemitério do oponente
      if (!opponentField.graveyard) {
        opponentField.graveyard = [];
      }
      opponentField.graveyard.push(cardToDiscard);
      
      logger.info(`✅ [processWhiteMagicalHatEffect] Carta "${cardToDiscard.name || cardToDiscard.cardName || 'Desconhecida'}" foi descartada da mão do oponente`);
      
      // Atualizar cache (a atualização no banco será feita pelo método chamador)
      this.activeDuels.set(duelId, duel);
    } catch (error) {
      logger.error(`❌ [processWhiteMagicalHatEffect] Erro ao processar efeito do WhiteMagicalHat:`, error);
    }
  }

  /**
   * Processa o efeito do MaskedSorcerer: quando causa dano ao oponente, compra uma carta
   */
  private async processMaskedSorcererEffect(duelId: string | number, duel: Duel, isAttackerPlayer1: boolean, attacker: any): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    try {
      const attackerCardId = attacker.idCarta || attacker.id || attacker.cardId;
      const attackerName = (attacker.name || attacker.cardName || '').toLowerCase();
      
      // Verificar se o atacante é MaskedSorcerer
      const isMaskedSorcerer = this.isExactCard(attacker, 'MaskedSorcerer');
      
      if (!isMaskedSorcerer) {
        return;
      }
      
      logger.info(`✨ [processMaskedSorcererEffect] MaskedSorcerer causou dano - processando efeito`);
      
      // Identificar o jogador que atacou (quem tem o MaskedSorcerer)
      const attackerPlayerId = isAttackerPlayer1 ? duel.player1Id : duel.player2Id;
      
      // Comprar uma carta para o jogador que tem o MaskedSorcerer
      await this.drawCard(duelId, attackerPlayerId);
      
      logger.info(`✅ [processMaskedSorcererEffect] MaskedSorcerer: Jogador comprou 1 carta após causar dano`);
      
      // Atualizar cache (a atualização no banco será feita pelo método chamador)
      this.activeDuels.set(duelIdStr, duel);
    } catch (error) {
      logger.error(`❌ [processMaskedSorcererEffect] Erro ao processar efeito do MaskedSorcerer:`, error);
    }
  }

  /**
   * Inicia a invocação especial do ChaosSorcerer
   * Cria pendingChoice para o jogador escolher 1 monstro LIGHT e 1 monstro DARK do cemitério
   */
  async startChaosSorcererSpecialSummon(duelId: string | number, userId: number, cardId: string): Promise<{ success: boolean; message?: string }> {
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
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    
    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser invocada em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode invocar ChaosSorcerer nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.hand) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Buscar a carta na mão
    const cardIndex = playerField.hand.findIndex((c: any) => {
      const cId = c.idCarta || c.id || c.cardId;
      const cName = (c.name || c.cardName || '').toLowerCase();
      return cId === cardId || 
             String(cId) === String(cardId) ||
             cName === 'chaossorcerer' || 
             cName === 'chaos sorcerer';
    });
    
    if (cardIndex === -1) {
      return { success: false, message: 'ChaosSorcerer não encontrado na mão' };
    }

    const card = playerField.hand[cardIndex];
    
    // Verificar se é realmente ChaosSorcerer
    const cardName = (card.name || card.cardName || '').toLowerCase();
    const cardIdCheck = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
    const isChaosSorcerer = this.isExactCard(card, 'ChaosSorcerer');
    
    if (!isChaosSorcerer) {
      return { success: false, message: 'Esta carta não é ChaosSorcerer' };
    }

    // Verificar se o cemitério tem monstros LIGHT e DARK
    if (!playerField.graveyard || !Array.isArray(playerField.graveyard)) {
      return { success: false, message: 'Cemitério não encontrado ou vazio' };
    }

    // Filtrar apenas monstros
    const monstersInGraveyard = playerField.graveyard
      .map((c: any, index: number) => ({ card: c, index }))
      .filter((item: any) => {
        const cardType = item.card.type || item.card.cardType;
        return cardType === 'Monster';
      });

    // Separar por atributo
    const lightMonsters = monstersInGraveyard.filter((item: any) => {
      const attribute = (item.card.attribute || '').toUpperCase();
      return attribute === 'LIGHT';
    });

    const darkMonsters = monstersInGraveyard.filter((item: any) => {
      const attribute = (item.card.attribute || '').toUpperCase();
      return attribute === 'DARK';
    });

    if (lightMonsters.length === 0) {
      return { success: false, message: 'Você precisa de pelo menos 1 monstro LIGHT no cemitério' };
    }

    if (darkMonsters.length === 0) {
      return { success: false, message: 'Você precisa de pelo menos 1 monstro DARK no cemitério' };
    }

    // Criar pendingChoice para escolha dos monstros
    await this.setPendingChoice(duelIdStr, {
      type: 'CHAOS_SORCERER_SUMMON',
      userId: userId,
      data: {
        cardId: cardId,
        lightMonsters: lightMonsters.map((item: any) => ({
          ...item.card,
          graveyardIndex: item.index,
        })),
        darkMonsters: darkMonsters.map((item: any) => ({
          ...item.card,
          graveyardIndex: item.index,
        })),
      },
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase,
    });

    logger.info(`✅ [startChaosSorcererSpecialSummon] PendingChoice criado para ChaosSorcerer - ${lightMonsters.length} LIGHT, ${darkMonsters.length} DARK`);

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
   * Invoca ChaosSorcerer por invocação especial
   * Requer: banir 1 monstro LIGHT e 1 monstro DARK do cemitério
   */
  async specialSummonChaosSorcerer(duelId: string | number, userId: number, cardId: string, lightMonsterIndex: number, darkMonsterIndex: number, zoneIndex: number, position: 'attack' | 'defense'): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    
    // Buscar duelo do banco
    let duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
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
      return { success: false, message: 'Você só pode invocar ChaosSorcerer nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField || !playerField.hand) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Buscar a carta na mão
    const cardIndex = playerField.hand.findIndex((c: any) => {
      const cId = c.idCarta || c.id || c.cardId;
      const cName = (c.name || c.cardName || '').toLowerCase();
      return cId === cardId || 
             String(cId) === String(cardId) ||
             cName === 'chaossorcerer' || 
             cName === 'chaos sorcerer';
    });
    
    if (cardIndex === -1) {
      return { success: false, message: 'ChaosSorcerer não encontrado na mão' };
    }

    const card = playerField.hand[cardIndex];
    
    // Verificar se é realmente ChaosSorcerer
    const cardName = (card.name || card.cardName || '').toLowerCase();
    const cardIdCheck = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();
    const isChaosSorcerer = this.isExactCard(card, 'ChaosSorcerer');
    
    if (!isChaosSorcerer) {
      return { success: false, message: 'Esta carta não é ChaosSorcerer' };
    }

    // Verificar se o cemitério tem monstros
    if (!playerField.graveyard || !Array.isArray(playerField.graveyard)) {
      return { success: false, message: 'Cemitério não encontrado ou vazio' };
    }

    // Buscar pendingChoice para obter os dados originais
    let duelWithChoice = await this.findDuelByIdFromDatabase(duelIdStr);
    if (!duelWithChoice || !duelWithChoice.pendingChoice || duelWithChoice.pendingChoice.type !== 'CHAOS_SORCERER_SUMMON') {
      return { success: false, message: 'Escolha pendente não encontrada ou inválida' };
    }

    const pendingChoice = duelWithChoice.pendingChoice;
    const lightMonsters = pendingChoice.data?.lightMonsters || [];
    const darkMonsters = pendingChoice.data?.darkMonsters || [];

    // Encontrar os monstros escolhidos pelos índices fornecidos
    if (lightMonsterIndex < 0 || lightMonsterIndex >= lightMonsters.length) {
      return { success: false, message: 'Índice de monstro LIGHT inválido' };
    }

    if (darkMonsterIndex < 0 || darkMonsterIndex >= darkMonsters.length) {
      return { success: false, message: 'Índice de monstro DARK inválido' };
    }

    const selectedLightMonster = lightMonsters[lightMonsterIndex];
    const selectedDarkMonster = darkMonsters[darkMonsterIndex];

    // Encontrar os monstros no graveyard atual usando os graveyardIndex salvos
    const lightGraveyardIndex = selectedLightMonster.graveyardIndex;
    const darkGraveyardIndex = selectedDarkMonster.graveyardIndex;

    // Verificar se são monstros diferentes
    if (lightGraveyardIndex === darkGraveyardIndex) {
      return { success: false, message: 'Você deve banir 2 monstros diferentes (1 LIGHT e 1 DARK)' };
    }

    // Verificar se os índices ainda são válidos
    if (lightGraveyardIndex < 0 || lightGraveyardIndex >= playerField.graveyard.length ||
        darkGraveyardIndex < 0 || darkGraveyardIndex >= playerField.graveyard.length) {
      return { success: false, message: 'Índices de monstros inválidos no cemitério' };
    }

    const lightMonster = playerField.graveyard[lightGraveyardIndex];
    const darkMonster = playerField.graveyard[darkGraveyardIndex];

    // Verificar se são monstros
    const lightIsMonster = (lightMonster.type || lightMonster.cardType) === 'Monster';
    const darkIsMonster = (darkMonster.type || darkMonster.cardType) === 'Monster';

    if (!lightIsMonster || !darkIsMonster) {
      return { success: false, message: 'Ambas as cartas devem ser monstros' };
    }

    // Verificar atributos
    const lightAttribute = (lightMonster.attribute || '').toUpperCase();
    const darkAttribute = (darkMonster.attribute || '').toUpperCase();

    if (lightAttribute !== 'LIGHT') {
      return { success: false, message: 'A primeira carta deve ser um monstro LIGHT' };
    }

    if (darkAttribute !== 'DARK') {
      return { success: false, message: 'A segunda carta deve ser um monstro DARK' };
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
    
    logger.info(`✅ [specialSummonChaosSorcerer] ChaosSorcerer invocado por invocação especial:`, {
      name: cardToSummon.name,
      position: finalPosition,
      zoneIndex: zoneIndex,
      banishedLight: banishedMonsters.find(m => (m.attribute || '').toUpperCase() === 'LIGHT')?.name,
      banishedDark: banishedMonsters.find(m => (m.attribute || '').toUpperCase() === 'DARK')?.name,
    });

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
   * Inicia o efeito do ChaosSorcerer (banir monstro face-up)
   * Cria pendingChoice para o jogador escolher o alvo
   */
  async startChaosSorcererEffect(duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    
    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser usado em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode usar este efeito nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se o ChaosSorcerer existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do ChaosSorcerer inválida' };
    }

    const chaosSorcerer = playerField.monsters[monsterZoneIndex];
    if (!chaosSorcerer || chaosSorcerer === null) {
      return { success: false, message: 'ChaosSorcerer não encontrado no campo' };
    }

    // Verificar se é realmente ChaosSorcerer
    const cardId = chaosSorcerer.idCarta || chaosSorcerer.id || chaosSorcerer.cardId;
    const cardName = (chaosSorcerer.name || chaosSorcerer.cardName || '').toLowerCase();
    const isChaosSorcerer = cardId === 'ChaosSorcerer' || 
                           cardId === 'chaossorcerer' ||
                           cardName === 'chaos sorcerer' ||
                           (typeof cardId === 'string' && cardId.toLowerCase().includes('chaossorcerer'));

    if (!isChaosSorcerer) {
      return { success: false, message: 'Carta no campo não é ChaosSorcerer' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (chaosSorcerer.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do ChaosSorcerer já foi usado neste turno' };
    }

    // Verificar se há monstros face-up no campo
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;
    
    let hasFaceUpMonsters = false;
    
    // Verificar monstros do Player1
    if (player1Field && player1Field.monsters && Array.isArray(player1Field.monsters)) {
      for (const monster of player1Field.monsters) {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          hasFaceUpMonsters = true;
          break;
        }
      }
    }
    
    // Verificar monstros do Player2
    if (!hasFaceUpMonsters && player2Field && player2Field.monsters && Array.isArray(player2Field.monsters)) {
      for (const monster of player2Field.monsters) {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          hasFaceUpMonsters = true;
          break;
        }
      }
    }
    
    if (!hasFaceUpMonsters) {
      return { success: false, message: 'Não há monstros face-up no campo para banir' };
    }

    // Criar pendingChoice para seleção de alvo
    await this.setPendingChoice(duelIdStr, {
      type: 'CHAOS_SORCERER_EFFECT',
      userId: userId,
      data: {
        monsterZoneIndex: monsterZoneIndex, // Zona onde está ChaosSorcerer
      },
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase,
    });

    logger.info(`✅ [startChaosSorcererEffect] PendingChoice criado para ChaosSorcerer`);

    // Atualizar no banco
    await this.updateDuelInDatabase(duelIdStr, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return { success: true };
  }

  /**
   * Processa o efeito do ChaosSorcerer: banir 1 monstro face-up do campo
   */
  async processChaosSorcererEffect(duelId: string | number, userId: number, monsterZoneIndex: number, targetPlayer: 'player' | 'opponent', targetZoneIndex: number): Promise<{ success: boolean; message?: string }> {
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
      return { success: false, message: 'Você só pode usar este efeito nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se há pendingChoice
    if (!duel.pendingChoice || duel.pendingChoice.type !== 'CHAOS_SORCERER_EFFECT') {
      return { success: false, message: 'Não há escolha pendente do efeito do ChaosSorcerer' };
    }

    // Verificar se é o jogador correto
    if (duel.pendingChoice.userId !== userId) {
      return { success: false, message: 'Não é sua vez de escolher' };
    }

    // Verificar se o ChaosSorcerer existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do ChaosSorcerer inválida' };
    }

    const chaosSorcerer = playerField.monsters[monsterZoneIndex];
    if (!chaosSorcerer || chaosSorcerer === null) {
      return { success: false, message: 'ChaosSorcerer não encontrado no campo' };
    }

    // Verificar se é realmente ChaosSorcerer
    const cardId = chaosSorcerer.idCarta || chaosSorcerer.id || chaosSorcerer.cardId;
    const cardName = (chaosSorcerer.name || chaosSorcerer.cardName || '').toLowerCase();
    const isChaosSorcerer = cardId === 'ChaosSorcerer' || 
                           cardId === 'chaossorcerer' ||
                           cardName === 'chaos sorcerer' ||
                           (typeof cardId === 'string' && cardId.toLowerCase().includes('chaossorcerer'));

    if (!isChaosSorcerer) {
      return { success: false, message: 'Carta no campo não é ChaosSorcerer' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (chaosSorcerer.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do ChaosSorcerer já foi usado neste turno' };
    }

    // Obter campo do alvo
    const targetField = targetPlayer === 'player' 
      ? playerField
      : opponentField;

    if (!targetField || !targetField.monsters || !Array.isArray(targetField.monsters)) {
      return { success: false, message: 'Campo do alvo não encontrado' };
    }

    // Verificar se o índice é válido
    if (targetZoneIndex < 0 || targetZoneIndex >= 5) {
      return { success: false, message: 'Índice de zona inválido' };
    }

    const targetMonster = targetField.monsters[targetZoneIndex];
    if (!targetMonster || targetMonster === null) {
      return { success: false, message: 'Não há monstro na zona especificada' };
    }

    // Verificar se o monstro está face-up (attack ou defense)
    if (targetMonster.position !== 'attack' && targetMonster.position !== 'defense') {
      return { success: false, message: 'O monstro alvo deve estar face-up (ataque ou defesa)' };
    }

    // Inicializar banished se não existir
    if (!playerField.banished) {
      playerField.banished = [];
    }

    logger.info(`✨ [processChaosSorcererEffect] Banindo monstro: ${targetMonster.name || targetMonster.cardName || 'Desconhecido'}`);

    // Verificar se o monstro tinha equipamento antes de banir
    await this.handleEquipmentDestruction(duelId, duel, targetPlayer === 'player' ? isPlayer1 : !isPlayer1, targetMonster);

    // Banir o monstro (remover do campo e adicionar ao banished)
    targetField.monsters[targetZoneIndex] = null;
    playerField.banished.push(targetMonster);

    // Marcar que o efeito foi usado neste turno e que não pode atacar
    chaosSorcerer.effectUsedThisTurn = true;
    chaosSorcerer.cannotAttackThisTurn = true; // Não pode atacar neste turno

    logger.info(`✅ [processChaosSorcererEffect] Monstro banido com sucesso! ChaosSorcerer não pode atacar neste turno`);

    // Limpar pendingChoice e atualizar no banco
    await this.updateDuelInDatabase(duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);

    // Atualizar cache
    this.activeDuels.set(duelIdStr, duel);

    return { success: true };
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
    
    // Verificar se é Fiber Jar ou SnowmanEater e processar efeito de flip
    const cardId = monster.idCarta || monster.id || monster.cardId;
    const cardName = (monster.name || monster.cardName || '').toLowerCase();
    const isFiberJar = this.isExactCard(monster, 'FiberJar');
    const isSnowmanEater = this.isExactCard(monster, 'SnowmanEater');
    
    if (isFiberJar || isSnowmanEater) {
      await this.processFlipEffect(duelIdStr, duel, isPlayer1, monster, zoneIndex);
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

  async nextPhase(duelId: string | number): Promise<Duel | null> {
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
    
    // Verificar se é o primeiro turno do primeiro jogador (player1 começa)
    // No primeiro turno, o jogador que começa não pode atacar, então pula a fase BATTLE
    const currentTurnCounter = duel.turnCounter || 1;
    const isFirstTurn = currentTurnCounter === 1;
    const isPlayer1Turn = duel.currentTurn === 1;
    const shouldSkipBattle = isFirstTurn && isPlayer1Turn && duel.currentPhase === TurnPhase.MAIN1;
    
    // Se está em MAIN2 ou antes, avançar normalmente
    // Quando chegar em END, verificar se precisa descartar antes de avançar turno
    if (currentIndex < phases.length - 2) {
      // Se deve pular BATTLE (primeiro turno do primeiro jogador), pular direto para MAIN2
      if (shouldSkipBattle) {
        logger.info(`⏭️ [nextPhase] Primeiro turno do primeiro jogador - pulando fase BATTLE`);
        duel.currentPhase = TurnPhase.MAIN2;
      } else {
        // Avançar para a próxima fase normalmente (até MAIN2)
        duel.currentPhase = phases[currentIndex + 1];
      }
    } else {
      // Se está em MAIN2, verificar se precisa descartar antes de ir para END
      if (duel.currentPhase === TurnPhase.MAIN2) {
        // Verificar quantas cartas o jogador atual tem na mão
        const currentPlayer = duel.currentTurn;
        const playerField = currentPlayer === 1 ? (duel as any).player1Field : (duel as any).player2Field;
        const hand = playerField?.hand || [];
        
        // Se tem mais de 6 cartas, mudar para END mas NÃO avançar turno - jogador precisa descartar primeiro
        if (hand.length > 6) {
          logger.info(`⚠️ [nextPhase] Player ${currentPlayer} tem ${hand.length} cartas na mão. Mudando para END mas não avançando turno - jogador precisa descartar primeiro.`);
          duel.currentPhase = TurnPhase.END;
          await this.updateDuelInDatabase(duelId, {
            currentPhase: TurnPhase.END,
          } as any);
          this.activeDuels.set(duelIdStr, duel);
          return duel;
        }
        
        // Se tem 6 ou menos cartas, pode avançar para END e depois avançar turno normalmente
        logger.info(`✅ [nextPhase] Player ${currentPlayer} tem ${hand.length} cartas (≤6). Avançando para END e depois para próximo turno.`);
        duel.currentPhase = TurnPhase.END;
      }
      
      // Se está em END, verificar SwordsOfRevealingLight antes de mudar turno
      if (duel.currentPhase === TurnPhase.END) {
        await this.checkAndDestroySwordsOfRevealingLight(duelId, duel);
        // Re-buscar duelo após verificar SwordsOfRevealingLight
        const updatedDuel = await this.findDuelByIdFromDatabase(duelIdStr);
        if (updatedDuel) {
          duel = updatedDuel;
        }
        
        // Verificar novamente se precisa descartar (pode ter mudado após verificar SwordsOfRevealingLight)
        const currentPlayer = duel.currentTurn;
        const playerField = currentPlayer === 1 ? (duel as any).player1Field : (duel as any).player2Field;
        const hand = playerField?.hand || [];
        
        // Se ainda tem mais de 6 cartas, não avançar turno - jogador precisa descartar primeiro
        if (hand.length > 6) {
          logger.info(`⚠️ [nextPhase] Player ${currentPlayer} ainda tem ${hand.length} cartas na mão. Não avançando turno - jogador precisa descartar primeiro.`);
          await this.updateDuelInDatabase(duelId, {
            currentPhase: TurnPhase.END,
          } as any);
          this.activeDuels.set(duelIdStr, duel);
          return duel;
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
    const newHand = hand.filter((card: any) => {
      const cardId = card.id || card.cardId || card.idCarta;
      return !cardsToRemove.some((removed: any) => {
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

    logger.info(`✅ [discardCards] Player ${player} descartou ${cardsToRemove.length} cartas. Mão: ${hand.length} -> ${newHand.length}`);

    return duel;
  }

  /**
   * Finaliza o turno do jogador, verificando se precisa descartar cartas
   * @param duelId - ID do duelo
   * @param userId - ID do usuário que está finalizando o turno
   * @param cardIdsToDiscard - IDs das cartas a descartar (opcional, se não fornecido, solicita ao jogador)
   */
  async endTurn(duelId: string | number, userId: number, cardIdsToDiscard?: string[]): Promise<{ needsDiscard: boolean; cardsToDiscard?: number; duel?: Duel }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
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

    // Se tem mais de 6 cartas, precisa descartar
    if (hand.length > 6) {
      const cardsToDiscard = hand.length - 6;

      // Se já forneceu as cartas a descartar, descartar agora
      if (cardIdsToDiscard && cardIdsToDiscard.length === cardsToDiscard) {
        const updatedDuel = await this.discardCards(duelId, player, cardIdsToDiscard, false);
        if (updatedDuel) {
          // Após descartar, avançar para o próximo turno
          return await this.advanceToNextTurn(duelId);
        }
      }

      // Se não forneceu as cartas, retornar que precisa descartar
      return {
        needsDiscard: true,
        cardsToDiscard: cardsToDiscard,
      };
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
    
    // SEMPRE buscar do banco para garantir dados atualizados (especialmente para monstros controlados)
    let duel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    
    if (!duel) {
      logger.error(`❌ [advanceToNextTurn] Duelo ${duelIdStr} não encontrado no banco`);
      return { needsDiscard: false };
    }
    
    // Atualizar cache com dados do banco
    this.activeDuels.set(duelIdStr, duel);

    // Resetar flag de invocação normal, mudança de posição e ataque para ambos os jogadores ao mudar de turno
    // Também devolver monstros controlados por ChangeOfHeart ao oponente quando o turno do jogador que controla acaba
    const currentTurnBeforeChange = duel.currentTurn; // Turno que está terminando
    
    logger.info(`🔄 [advanceToNextTurn] Iniciando devolução de monstros controlados por ChangeOfHeart`);
    logger.info(`   - currentTurnBeforeChange: ${currentTurnBeforeChange}`);
    logger.info(`   - player1Field.monsters: ${(duel as any).player1Field?.monsters?.length || 0} slots`);
    logger.info(`   - player2Field.monsters: ${(duel as any).player2Field?.monsters?.length || 0} slots`);
    
    // Verificar e mover ChangeOfHeart e BrainControl para o cemitério quando o turno acaba
    if (currentTurnBeforeChange === 1 && (duel as any).player1Field) {
      const player1Field = (duel as any).player1Field;
      if (player1Field.spellTrap && Array.isArray(player1Field.spellTrap)) {
        for (let i = 0; i < player1Field.spellTrap.length; i++) {
          const card = player1Field.spellTrap[i];
          if (card) {
            const cardId = card.idCarta || card.id || card.cardId;
            if (cardId === 'ChangeOfHeart' || 
                cardId === 'changeofheart' ||
                (typeof cardId === 'string' && cardId.toLowerCase().includes('changeofheart'))) {
              logger.info(`🔄 [advanceToNextTurn] Movendo ChangeOfHeart do Player 1 para o cemitério`);
              if (!player1Field.graveyard) {
                player1Field.graveyard = [];
              }
              player1Field.graveyard.push(card);
              player1Field.spellTrap[i] = null;
            } else if (cardId === 'BrainControl' || 
                       cardId === 'braincontrol' ||
                       (typeof cardId === 'string' && cardId.toLowerCase().includes('braincontrol'))) {
              logger.info(`🔄 [advanceToNextTurn] Movendo BrainControl do Player 1 para o cemitério`);
              if (!player1Field.graveyard) {
                player1Field.graveyard = [];
              }
              player1Field.graveyard.push(card);
              player1Field.spellTrap[i] = null;
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
          if (card) {
            const cardId = card.idCarta || card.id || card.cardId;
            if (cardId === 'ChangeOfHeart' || 
                cardId === 'changeofheart' ||
                (typeof cardId === 'string' && cardId.toLowerCase().includes('changeofheart'))) {
              logger.info(`🔄 [advanceToNextTurn] Movendo ChangeOfHeart do Player 2 para o cemitério`);
              if (!player2Field.graveyard) {
                player2Field.graveyard = [];
              }
              player2Field.graveyard.push(card);
              player2Field.spellTrap[i] = null;
            } else if (cardId === 'BrainControl' || 
                       cardId === 'braincontrol' ||
                       (typeof cardId === 'string' && cardId.toLowerCase().includes('braincontrol'))) {
              logger.info(`🔄 [advanceToNextTurn] Movendo BrainControl do Player 2 para o cemitério`);
              if (!player2Field.graveyard) {
                player2Field.graveyard = [];
              }
              player2Field.graveyard.push(card);
              player2Field.spellTrap[i] = null;
            }
          }
        }
      }
    }
    
    if ((duel as any).player1Field) {
      (duel as any).player1Field.normalSummonUsed = false;
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
            if (monster.attackedThisTurn === true) {
              resetAttackCount++;
            }
            monster.attackedThisTurn = false;
            monster.attacksThisTurn = 0;
          }
        });
        if (resetPositionCount > 0 || resetAttackCount > 0) {
          logger.info(`🔄 [advanceToNextTurn] Resetando positionChangedThisTurn para ${resetPositionCount} monstro(s) e attackedThisTurn para ${resetAttackCount} monstro(s) do Player 2`);
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
    } as any);
    
    // Recarregar do banco para garantir que está sincronizado
    const updatedDuel = await this.findDuelByIdFromDatabase(duelIdStr, true);
    if (updatedDuel) {
      // Garantir que o duelo atualizado está no cache
      this.activeDuels.set(duelIdStr, updatedDuel);
      logger.info(`✅ [advanceToNextTurn] Duelo recarregado do banco - turnCounter: ${updatedDuel.turnCounter}, player1Field.turnCounter: ${(updatedDuel as any).player1Field?.turnCounter}, player2Field.turnCounter: ${(updatedDuel as any).player2Field?.turnCounter}, currentTurn: ${updatedDuel.currentTurn}`);
    } else {
      // Se não conseguiu recarregar, usar o que temos
      this.activeDuels.set(duelIdStr, duel);
      logger.info(`⚠️ [advanceToNextTurn] Não conseguiu recarregar do banco, usando duelo em memória`);
    }

    // Retornar o duelo em DRAW - o gateway vai processar automaticamente
    return { needsDiscard: false, duel: updatedDuel || duel };
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
    
    duel.status = DuelStatus.FINISHED;
    duel.result = result;
    duel.winnerId = winnerId;
    duel.finishedAt = new Date();
    
    await this.updateDuelInDatabase(duelId, {
      status: DuelStatus.FINISHED,
      result: result,
      winnerId: winnerId,
      finishedAt: new Date(),
    } as any);
    
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

      // Calcular score baseado na origem do duelo
      // Regras: Random Duel = 1.7, Chat = 1.0, Torneio = 10.0
      let scoreEarned = 0;
      if (result !== DuelResult.DRAW && result !== DuelResult.CANCELLED && winnerId) {
        if (duel.origin === DuelOrigin.RANDOM) {
          scoreEarned = 1.7; // Random Duel: 1.7 score por vitória
        } else if (duel.origin === DuelOrigin.CHAT) {
          scoreEarned = 1.0; // Chat: 1.0 score por vitória
        } else if (duel.origin === DuelOrigin.TOURNAMENT) {
          scoreEarned = 10.0; // Torneio: 10.0 score por vitória
        } else if (duel.origin === DuelOrigin.ARENA) {
          scoreEarned = 2.0; // Arena: 2.0 score por vitória
        } else {
          scoreEarned = 1.0; // Outros tipos de duelo: 1.0 score por vitória
        }
        logger.info(`📊 [finishDuel] Score calculado: ${scoreEarned} para origem ${duel.origin}`);
      } else {
        logger.info(`📊 [finishDuel] Sem score (result: ${result}, winnerId: ${winnerId})`);
      }

      // Converter origem do duelo para origem do histórico
      let historyOrigin: DuelHistoryOrigin = DuelHistoryOrigin.OTHER;
      if (duel.origin === DuelOrigin.RANDOM) {
        historyOrigin = DuelHistoryOrigin.RANDOM;
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
        
        // ========== ATUALIZAR SCORE DO DUELISTA E DO CLÃ (GRUPO) ==========
        // REGRA CRÍTICA: Quando o duelista ganha score, o clã recebe EXATAMENTE o mesmo score
        // 1. O duelista ganha scoreEarned no seu totalScore
        // 2. IMEDIATAMENTE APÓS, se o duelista estiver em um clã ativo, o clã também ganha o mesmo scoreEarned
        // 3. O score é adicionado ao member.totalScore e depois o group.totalScore é recalculado
        
        // Atualizar score do duelista (usar query direta para garantir precisão decimal)
        logger.info(`📊 [finishDuel] ========== ATUALIZANDO SCORE DO DUELISTA ==========`);
        logger.info(`📊 [finishDuel] Adicionando ${scoreEarned} score para jogador ${winnerIdNum} (origem: ${duel.origin})`);
        let newUserTotalScore = 0;
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
        
        // ========== ATUALIZAR SCORE DO CLÃ (GRUPO) IMEDIATAMENTE APÓS ==========
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
        
        // Perdedor ganha derrota
        await this.usersRepository.increment({ id: loserId }, 'lossesGeral', 1);
        
        // Atualizar score da season ativa (além do score geral)
        try {
          await this.seasonsService.updateUserRanking(winnerIdNum, scoreEarned, true);
          await this.seasonsService.updateUserRanking(loserId, 0, false);
          logger.info(`📊 [finishDuel] Season score atualizado para vencedor ${winnerIdNum}`);
        } catch (error: any) {
          logger.error(`⚠️ [finishDuel] Erro ao atualizar season score:`, error.message || error);
          // Não falhar o duelo se houver erro na season
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
        
        logger.info(`📊 [finishDuel] Estatísticas atualizadas: Jogador ${winnerIdNum} venceu (+${scoreEarned} score), Jogador ${loserId} perdeu`);
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
        
        // Encerrar como empate (DRAW) já que não houve movimento
        await this.finishDuel(duel.id, DuelResult.DRAW, null);
        
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
      const logs = await this.duelLogsRepository.find({
        where: { duelId: duelIdStr },
        order: { createdAt: 'ASC' },
        take: 100,
      });
      return logs;
    } catch (error) {
      logger.error(`❌ [getDuelLogs] Erro ao buscar logs do duelo ${duelIdStr}:`, error);
      return [];
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
            rating: true,
          },
          player2: {
            id: true,
            nickname: true,
            username: true,
            clanTag: true,
            profileImage: true,
            rating: true,
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
  private readonly COUNT_CACHE_MS = 1000; // Cache por 1 segundo

  getActiveDuelsCount(): number {
    // CRÍTICO: Cache o resultado para evitar leituras excessivas do Map
    // Isso reduz carga quando há muitas verificações simultâneas
    const now = Date.now();
    if (now - this.lastCountUpdate > this.COUNT_CACHE_MS) {
      this.activeDuelsCountCache = this.activeDuels.size;
      this.lastCountUpdate = now;
    }
    return this.activeDuelsCountCache;
  }

  async createDuel(player1Id: number, player2Id: number, origin: DuelOrigin = DuelOrigin.OTHER): Promise<Duel | null> {
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
    
    // Validação prévia: verificar se ambos os jogadores têm deck equipado
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
    
    const duelKey = `${Math.min(player1Id, player2Id)}_${Math.max(player1Id, player2Id)}`;
    logger.info(`🎮 [createDuel] DuelKey: ${duelKey}`);
    
    const existingCreation = this.creatingDuels.get(duelKey);
    if (existingCreation) {
      logger.info(`🎮 [createDuel] Já existe criação em andamento para este par, aguardando...`);
      return await existingCreation;
    }
    
    logger.info(`🎮 [createDuel] Criando nova promise de criação...`);
    const creationPromise = (async (): Promise<Duel | null> => {
      try {
        logger.info(`🎮 [createDuel] Promise iniciada, chamando createDuelInternal...`);
      const duel = await Promise.race([
          this.createDuelInternal(player1Id, player2Id, origin),
        new Promise<null>((_, reject) => 
            setTimeout(() => {
              logger.error(`⏱️ [createDuel] TIMEOUT ao criar duelo após 30 segundos!`);
              reject(new Error('Timeout ao criar duelo'));
            }, 30000)
          )
        ]).catch((error) => {
          logger.error(`❌ [createDuel] Erro:`, error);
          // Se o erro for sobre deck não equipado, relançar o erro
          if (error instanceof Error && error.message.includes('deck equipado')) {
            throw error;
          }
          return null;
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
      }
      
      return duel;
    } catch (error) {
        logger.error(`❌ [createDuel] Erro ao criar duelo:`, error);
        // Se o erro for sobre deck não equipado, relançar o erro
        if (error instanceof Error && error.message.includes('deck equipado')) {
          throw error;
        }
        return null;
    }
    })();
    
    this.creatingDuels.set(duelKey, creationPromise);
    const result = await creationPromise;
    this.creatingDuels.delete(duelKey);
    return result;
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

  private async createDuelInternal(player1Id: number, player2Id: number, origin: DuelOrigin = DuelOrigin.OTHER): Promise<Duel | null> {
    logger.info(`🚀 [createDuelInternal] ==========================================`);
    logger.info(`🚀 [createDuelInternal] INICIANDO criação de duelo`);
    logger.info(`🚀 [createDuelInternal] Player1Id: ${player1Id}, Player2Id: ${player2Id}, Origin: ${origin}`);
    try {
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
              'avatar',
              'profileImage',
              'equippedPlaymatId',
              'equippedPlaymatImage',
              'equippedSkinId',
              'equippedSkinImage',
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
              'avatar',
              'profileImage',
              'equippedPlaymatId',
              'equippedPlaymatImage',
              'equippedSkinId',
              'equippedSkinImage',
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
        equippedDeckName: (player1 as any).equippedDeckName,
      }, null, 2));
      logger.info(`🔍 [createDuelInternal] P2 completo:`, JSON.stringify({
        id: player2.id,
        username: player2.username,
        equippedDeckName: (player2 as any).equippedDeckName,
      }, null, 2));
      
      // Validar se ambos os jogadores têm deck equipado
      const player1DeckName = (player1 as any).equippedDeckName;
      const player2DeckName = (player2 as any).equippedDeckName;
      
      if (!player1DeckName || player1DeckName.trim() === '') {
        logger.error(`❌ [createDuelInternal] Player1 (${player1.username}) não tem deck equipado!`);
        throw new Error(`Jogador ${player1.username} não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.`);
      }
      
      if (!player2DeckName || player2DeckName.trim() === '') {
        logger.error(`❌ [createDuelInternal] Player2 (${player2.username}) não tem deck equipado!`);
        throw new Error(`Jogador ${player2.username} não tem deck equipado. Por favor, equipe um deck antes de entrar no duelo.`);
      }
      
      logger.info(`🚀 [createDuelInternal] Preparando decks...`);
      logger.info(`🔍 [createDuelInternal] P1 equippedDeckName: ${player1DeckName}`);
      logger.info(`🔍 [createDuelInternal] P2 equippedDeckName: ${player2DeckName}`);
      logger.info(`🔍 [createDuelInternal] Usando deckName P1: "${player1DeckName}"`);
      logger.info(`🔍 [createDuelInternal] Usando deckName P2: "${player2DeckName}"`);
      
      const player1Deck = await this.preparePlayerDeck(player1Id, player1DeckName);
      logger.info(`✅ [createDuelInternal] Deck P1 preparado: ${player1Deck.deck.length} cartas no deck, ${player1Deck.hand.length} na mão, ${player1Deck.extraDeck.length} no extra deck`);
      
      // Validação adicional: garantir que o deck tenha cartas
      if (player1Deck.deck.length === 0 && player1Deck.hand.length === 0) {
        logger.error(`❌ [createDuelInternal] Deck P1 está vazio após preparação!`);
        throw new Error(`Deck "${player1DeckName}" do jogador ${player1.username} está vazio. Por favor, adicione cartas ao deck.`);
      }
      
      // Validar tamanho mínimo (40 cartas no total: deck + mão) - extra deck não conta
      const totalCardsP1 = player1Deck.deck.length + player1Deck.hand.length;
      if (totalCardsP1 < 40) {
        logger.error(`❌ [createDuelInternal] Deck P1 tem apenas ${totalCardsP1} cartas (mínimo: 40)`);
        throw new Error(`Deck "${player1DeckName}" do jogador ${player1.username} tem apenas ${totalCardsP1} cartas. O mínimo é 40 cartas.`);
      }
      
      await new Promise(resolve => setImmediate(resolve));
      const player2Deck = await this.preparePlayerDeck(player2Id, player2DeckName);
      logger.info(`✅ [createDuelInternal] Deck P2 preparado: ${player2Deck.deck.length} cartas no deck, ${player2Deck.hand.length} na mão, ${player2Deck.extraDeck.length} no extra deck`);
      
      // Validação adicional: garantir que o deck tenha cartas
      if (player2Deck.deck.length === 0 && player2Deck.hand.length === 0) {
        logger.error(`❌ [createDuelInternal] Deck P2 está vazio após preparação!`);
        throw new Error(`Deck "${player2DeckName}" do jogador ${player2.username} está vazio. Por favor, adicione cartas ao deck.`);
      }
      
      // Validar tamanho mínimo (40 cartas no total: deck + mão) - extra deck não conta
      const totalCardsP2 = player2Deck.deck.length + player2Deck.hand.length;
      if (totalCardsP2 < 40) {
        logger.error(`❌ [createDuelInternal] Deck P2 tem apenas ${totalCardsP2} cartas (mínimo: 40)`);
        throw new Error(`Deck "${player2DeckName}" do jogador ${player2.username} tem apenas ${totalCardsP2} cartas. O mínimo é 40 cartas.`);
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
        // Armazenar turnCounter no JSON para validação de cartas
        turnCounter: 1,
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
        // Armazenar turnCounter no JSON para validação de cartas
        turnCounter: 1,
      };
      
      logger.info(`🔍 [createDuelInternal] ANTES de atribuir ao duelData:`);
      logger.info(`  - p1FieldObj.deck.length: ${p1FieldObj.deck.length}`);
      logger.info(`  - p1FieldObj.hand.length: ${p1FieldObj.hand.length}`);
      logger.info(`  - p2FieldObj.deck.length: ${p2FieldObj.deck.length}`);
      logger.info(`  - p2FieldObj.hand.length: ${p2FieldObj.hand.length}`);
      
      // Atribuir usando (duelData as any) para garantir que o TypeORM reconheça
      (duelData as any).player1Field = p1FieldObj;
      (duelData as any).player2Field = p2FieldObj;
      
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
      
      (savedDuel as any).player1 = player1;
      (savedDuel as any).player2 = player2;
      const cachedDuel = { ...savedDuel } as any;
      
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
      
      // NÃO processar DRAW aqui - deixar o handleJoinDuelRoom fazer isso quando alguém entrar
      // Isso garante que o frontend receba as atualizações corretas
      
        const duelKey = `${Math.min(player1Id, player2Id)}_${Math.max(player1Id, player2Id)}`;
        this.creatingDuels.delete(duelKey);
      logger.info(`✅ [createDuelInternal] Duelo criado e adicionado ao cache em memória`);
      logger.info(`✅ [createDuelInternal] ==========================================`);
        
      return cachedDuel;
      } catch (error) {
      logger.error(`❌ [createDuelInternal] Erro ao criar duelo interno (catch externo):`, error);
      logger.error(`❌ [createDuelInternal] Tipo:`, error?.constructor?.name);
      logger.error(`❌ [createDuelInternal] Mensagem:`, error instanceof Error ? error.message : String(error));
      logger.error(`❌ [createDuelInternal] Stack:`, error instanceof Error ? error.stack : 'N/A');
      
      // Remover do Map de criação em andamento em caso de erro
      const duelKey = `${Math.min(player1Id, player2Id)}_${Math.max(player1Id, player2Id)}`;
      this.creatingDuels.delete(duelKey);
      
      return null;
    }
  }

  private async preparePlayerDeck(userId: number, deckName: string): Promise<{deck: any[], hand: any[], extraDeck: any[]}> {
    try {
      // Timeout aumentado para dar mais tempo para buscar o deck
      const activeDuels = this.getActiveDuelsCount();
      const timeout = activeDuels > 0 ? 5000 : 10000; // Timeout aumentado
      
      logger.info(`🔍 [preparePlayerDeck] Buscando deck para usuário ${userId} com nome "${deckName}" (timeout: ${timeout}ms)...`);
      
      const deck = await Promise.race([
        this.decksService.getCurrentDeck(userId, deckName),
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
        logger.error(`❌ [preparePlayerDeck] Deck não encontrado ou timeout para usuário ${userId} com nome "${deckName}"`);
        throw new Error(`Deck "${deckName}" não encontrado para o usuário ${userId}. Por favor, verifique se o deck existe e está equipado.`);
      }
      
      logger.info(`🔍 [preparePlayerDeck] Estrutura do deck recebido:`, {
        hasCards: !!deck.cards,
        cardsIsArray: Array.isArray(deck.cards),
        cardsLength: deck.cards?.length || 0,
        deckKeys: Object.keys(deck || {}),
      });
      
      // Debug: Verificar se as cartas têm descrição
      if (deck.cards && deck.cards.length > 0) {
        const firstCard = deck.cards[0]?.card || deck.cards[0];
        logger.info(`🔍 [preparePlayerDeck] Primeira carta do deck:`, {
          name: firstCard?.name,
          hasDescription: !!firstCard?.description,
          description: firstCard?.description ? firstCard.description.substring(0, 50) + '...' : 'N/A',
          cardKeys: firstCard ? Object.keys(firstCard) : [],
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
      const extractedCards = mainDeckCards.map((deckCard: any) => {
        // Se tem card.card, usar ele, senão usar deckCard diretamente
        if (deckCard.card) {
          const card = deckCard.card;
          // Usar spread operator para pegar TODOS os campos, depois remover apenas cardImage
          const cardData = { ...card };
          
          // Garantir campos críticos
          cardData.cardId = deckCard.cardId || card.id;
          cardData.idCarta = card.idCarta || card.id; // CRÍTICO: idCarta é necessário para CardImage
          cardData.cardType = card.cardType || card.type; // Garantir compatibilidade
          // instanceId será gerado no shuffleDeck para cada instância única
          
          // Remover apenas cardImage para economizar espaço
          delete cardData.cardImage;
          
          // Log de debug para primeira carta
          if (deck.cards.indexOf(deckCard) === 0) {
            logger.info(`🔍 [preparePlayerDeck] Primeira carta processada:`, {
              name: cardData.name,
              hasDescription: !!cardData.description,
              descriptionPreview: cardData.description ? cardData.description.substring(0, 50) + '...' : 'N/A',
              keys: Object.keys(cardData),
            });
          }
          
          return cardData;
        } else {
          // Se não tem card.card, usar deckCard diretamente mas garantir idCarta
          return {
            ...deckCard,
            idCarta: deckCard.idCarta || deckCard.id || deckCard.cardId,
          };
        }
      }).filter((card: any) => card !== null && card !== undefined);
      
      logger.info(`🔍 [preparePlayerDeck] Cartas do deck principal extraídas: ${extractedCards.length} cartas`);
      if (extractedCards.length > 0) {
        logger.info(`🔍 [preparePlayerDeck] Primeira carta extraída do deck principal:`, {
          id: extractedCards[0].id,
          idCarta: extractedCards[0].idCarta,
          cardId: extractedCards[0].cardId,
          name: extractedCards[0].name,
          type: extractedCards[0].type,
        });
      }
      
      // Extrair cartas do extra deck
      const extractedExtraDeck = extraDeckCards.map((deckCard: any) => {
        if (deckCard.card) {
          const card = deckCard.card;
          const cardData = { ...card };
          
          // Garantir campos críticos
          cardData.cardId = deckCard.cardId || card.id;
          cardData.idCarta = card.idCarta || card.id;
          cardData.cardType = card.cardType || card.type;
          
          // Remover apenas cardImage para economizar espaço
          delete cardData.cardImage;
          
          return cardData;
        } else {
          return {
            ...deckCard,
            idCarta: deckCard.idCarta || deckCard.id || deckCard.cardId,
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
      attribute: actualCard.attribute || card.attribute || null,
      race: actualCard.race || card.race || null,
      rarity: actualCard.rarity || card.rarity || null,
      description: actualCard.description || card.description || null, // Preservar descrição
      // Preservar posição (attack, defense, set, face-up) - sempre incluir se existir
      position: card.position !== undefined ? card.position : (actualCard.position !== undefined ? actualCard.position : undefined),
      // NÃO incluir cardImage (muito grande, será gerado no frontend usando idCarta)
    };
    
    // Remover campos nulos ou indefinidos (exceto idCarta que pode ser 0 e position que deve ser preservada)
    for (const key in compacted) {
      if (compacted.hasOwnProperty(key) && (compacted[key] === null || compacted[key] === undefined)) {
        // NÃO remover position mesmo se for null/undefined, pois pode ser necessário para cartas no campo
        if (key !== 'position') {
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
    
    // CRÍTICO: Garantir que idCarta existe (necessário para CardImage)
    if (!compacted.idCarta && compacted.id) {
      compacted.idCarta = compacted.id;
    }
    if (!compacted.idCarta && compacted.cardId) {
      compacted.idCarta = compacted.cardId;
    }
    
    return compacted;
  }

  /**
   * Define uma escolha pendente no duelo
   */
  async setPendingChoice(duelId: string | number, choice: {
    type: 'CONFISCATION' | 'GRACEFUL_CHARITY' | 'FORCEFUL_SENTRY' | 'MONSTER_REBORN' | 'CHANGE_OF_HEART' | 'BRAIN_CONTROL' | 'UNITED_WE_STAND' | 'MAGE_POWER' | 'MYSTICAL_SPACE_TYPHOON' | 'SNOWMAN_EATER' | 'CHAOS_SORCERER_SUMMON' | 'CHAOS_SORCERER_EFFECT';
    userId: number;
    turnWhenStarted: number;
    phaseWhenStarted: string;
    data: any;
  }): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    await this.updateDuelInDatabase(duelIdStr, {
      pendingChoice: choice
    } as any);
    
    // Atualizar cache
    const duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (duel) {
      this.activeDuels.set(duelIdStr, duel);
    }
  }

  /**
   * Limpa a escolha pendente do duelo
   */
  async clearPendingChoice(duelId: string | number): Promise<void> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    await this.updateDuelInDatabase(duelIdStr, {
      pendingChoice: null
    } as any);
    
    // Atualizar cache
    const duel = await this.findDuelByIdFromDatabase(duelIdStr);
    if (duel) {
      this.activeDuels.set(duelIdStr, duel);
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
              username: opponent.username,
              clanTag: opponent.clanTag,
              profileImage: opponent.profileImage,
            } : {
              id: h.opponentId,
              nickname: h.opponentNickname,
              username: h.opponentUsername,
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
              username: h.opponentUsername,
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
      // Ignorar duelos cancelados
      if (match.result === DuelHistoryResult.CANCELLED) {
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
      } else if (match.result === DuelHistoryResult.DRAW) {
        stats.total.draws++;
        stats.byOrigin[origin].draws++;
      }
    }

    return {
      player1: {
        id: player1.id,
        nickname: player1.nickname,
        profileImage: player1.profileImage
      },
      player2: {
        id: player2.id,
        nickname: player2.nickname,
        profileImage: player2.profileImage
      },
      total: stats.total,
      byOrigin: stats.byOrigin
    };
  }
}
