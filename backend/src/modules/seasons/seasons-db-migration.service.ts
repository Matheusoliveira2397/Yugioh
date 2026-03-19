import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Migrações de DB do módulo de seasons (rodam na inicialização).
 * Ex.: alterar season_rankings.seasonScore de integer para numeric(10,2)
 * para que scores decimais (1.7 no random duel) sejam armazenados corretamente.
 */
@Injectable()
export class SeasonsDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(SeasonsDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    try {
      await this.ensureSeasonRankingsScoreIsNumeric();
    } catch (error: any) {
      this.logger.warn('Migração season_rankings.seasonScore:', error?.message || error);
    }
  }

  private async ensureSeasonRankingsScoreIsNumeric() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const tableExists = await queryRunner.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'season_rankings'
      `);
      if (!tableExists?.length) return;

      // Sempre executar ALTER: se a coluna já for numeric(10,2) é idempotente; se for integer corrige.
      this.logger.log('Garantindo season_rankings.seasonScore como numeric(10,2)...');
      await queryRunner.query(`
        ALTER TABLE "season_rankings"
        ALTER COLUMN "seasonScore" TYPE numeric(10,2) USING COALESCE("seasonScore", 0)::numeric
      `);
      this.logger.log('season_rankings.seasonScore definido como numeric(10,2).');
    } catch (error: any) {
      this.logger.warn('ensureSeasonRankingsScoreIsNumeric:', error?.message || error);
    } finally {
      await queryRunner.release();
    }
  }
}
