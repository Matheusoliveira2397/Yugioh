import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { User } from '../users/entities/user.entity';
import { Duel } from '../duels/entities/duel.entity';
import { Card } from '../cards/entities/card.entity';

/**
 * Sistema de Índices e Otimizações de Performance
 * Monitora e otimiza queries lentas
 */
@Injectable()
export class DatabaseOptimizationService {
  private readonly logger = new Logger(DatabaseOptimizationService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Duel)
    private duelRepository: Repository<Duel>,
    @InjectRepository(Card)
    private cardRepository: Repository<Card>,
  ) {}

  /**
   * Cria índices otimizados no banco
   * Executa apenas uma vez ou quando necessário
   */
  async createOptimizedIndexes() {
    this.logger.log('🔧 Criando índices otimizados...');

    try {
      // ÍNDICES PARA TABELA USERS
      await this.userRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
        CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins);
        CREATE INDEX IF NOT EXISTS idx_users_created_at ON users("createdAt");
      `);

      // ÍNDICES PARA TABELA DUELS
      await this.duelRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_duels_status ON duels(status);
        CREATE INDEX IF NOT EXISTS idx_duels_player1 ON duels("player1Id");
        CREATE INDEX IF NOT EXISTS idx_duels_player2 ON duels("player2Id");
        CREATE INDEX IF NOT EXISTS idx_duels_created_at ON duels("createdAt");
        CREATE INDEX IF NOT EXISTS idx_duels_status_created ON duels(status, "createdAt");
      `);

      // ÍNDICES PARA TABELA CARDS
      await this.cardRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
        CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
        CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
        CREATE INDEX IF NOT EXISTS idx_cards_active ON cards("isActive");
        CREATE INDEX IF NOT EXISTS idx_cards_type_rarity ON cards(type, rarity);
      `);

      // ÍNDICES PARA DUEL_LOGS
      await this.duelRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_duel_logs_duel ON duel_logs("duelId");
        CREATE INDEX IF NOT EXISTS idx_duel_logs_created ON duel_logs("createdAt");
        CREATE INDEX IF NOT EXISTS idx_duel_logs_action ON duel_logs("actionType");
      `);

      // ÍNDICES PARA TOURNAMENTS
      await this.duelRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
        CREATE INDEX IF NOT EXISTS idx_tournaments_start_at ON tournaments("startAt");
        CREATE INDEX IF NOT EXISTS idx_tournaments_registration ON tournaments("registrationOpenAt", "registrationCloseAt");
      `);

      // ÍNDICES PARA TOURNAMENT_MATCHES
      await this.duelRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches("tournamentId");
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_scheduled ON tournament_matches("scheduledAt");
      `);

      this.logger.log('✅ Índices criados com sucesso!');
    } catch (error) {
      this.logger.error('❌ Erro ao criar índices:', error);
    }
  }

  /**
   * Analisa queries lentas toda segunda às 5:00
   */
  @Cron('0 5 * * 1')
  async analyzeSlowQueries() {
    this.logger.log('📊 Analisando queries lentas...');

    try {
      // PostgreSQL: pg_stat_statements extension
      const slowQueries = await this.userRepository.query(`
        SELECT 
          query,
          calls,
          total_exec_time / 1000 as total_time_seconds,
          mean_exec_time / 1000 as mean_time_seconds
        FROM pg_stat_statements
        WHERE mean_exec_time > 100
        ORDER BY mean_exec_time DESC
        LIMIT 10;
      `);

      if (slowQueries.length > 0) {
        this.logger.warn('⚠️  Queries lentas detectadas:', slowQueries);
      } else {
        this.logger.log('✅ Nenhuma query lenta detectada!');
      }
    } catch (error) {
      this.logger.error('❌ Erro ao analisar queries:', error);
    }
  }

  /**
   * Estatísticas de uso do banco
   */
  @Cron('0 6 * * *') // Todo dia às 6:00
  async getDatabaseStats() {
    try {
      const stats = await this.userRepository.query(`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10;
      `);

      this.logger.log('📊 Top 10 maiores tabelas:', stats);

      // Verificar tamanho total do banco
      const dbSize = await this.userRepository.query(`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size;
      `);

      this.logger.log(`💾 Tamanho total do banco: ${dbSize[0].size}`);
    } catch (error) {
      this.logger.error('❌ Erro ao obter estatísticas:', error);
    }
  }

  /**
   * Otimiza tabelas que cresceram muito
   */
  async optimizeTable(tableName: string) {
    try {
      this.logger.log(`🔧 Otimizando tabela ${tableName}...`);

      // VACUUM FULL + ANALYZE
      await this.userRepository.query(`VACUUM FULL ANALYZE ${tableName}`);

      // REINDEX
      await this.userRepository.query(`REINDEX TABLE ${tableName}`);

      this.logger.log(`✅ Tabela ${tableName} otimizada!`);
    } catch (error) {
      this.logger.error(`❌ Erro ao otimizar ${tableName}:`, error);
    }
  }
}
