import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DuelsDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DuelsDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    // Aguardar um pouco para garantir que a conexão está estabelecida
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      await this.ensureDuelOriginRANDOM_ANIME();
    } catch (error) {
      this.logger.warn('Migração duelorigin RANDOM_ANIME:', (error as Error)?.message ?? error);
    }

    try {
      await this.ensureDuelOriginRANKED();
    } catch (error) {
      this.logger.warn('Migração duelorigin RANKED:', (error as Error)?.message ?? error);
    }

    try {
      await this.ensureRankedPointsColumn();
    } catch (error) {
      this.logger.warn('Migração ranked_points:', (error as Error)?.message ?? error);
    }

    try {
      await this.ensureRankedScoreSettingsColumns();
    } catch (error) {
      this.logger.warn('Migração duel_score_settings ranked:', (error as Error)?.message ?? error);
    }

    try {
      await this.ensureTurnCounterColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração de turn_counter:', error);
      // Não lançar erro para não impedir o módulo de iniciar
    }
  }

  /** Add RANDOM_ANIME to duelorigin enum so Anime Deck matchmaking works. Safe to run every startup. */
  private async ensureDuelOriginRANDOM_ANIME() {
    await this.addEnumValueIfMissing('duelorigin', 'RANDOM_ANIME');
    await this.addEnumValueIfMissing('duelhistoryorigin', 'RANDOM_ANIME');
  }

  private async ensureDuelOriginRANKED() {
    await this.addEnumValueIfMissing('duelorigin', 'RANKED');
    await this.addEnumValueIfMissing('duelhistoryorigin', 'RANKED');
  }

  private async addEnumValueIfMissing(typeName: string, label: string) {
    try {
      const hasValue = await this.dataSource.query(
        `SELECT 1 FROM pg_enum e
         JOIN pg_type t ON e.enumtypid = t.oid
         WHERE t.typname = $1 AND e.enumlabel = $2`,
        [typeName, label],
      );
      if (Array.isArray(hasValue) && hasValue.length > 0) {
        return;
      }
      await this.dataSource.query(`ALTER TYPE "${typeName}" ADD VALUE '${label}'`);
      this.logger.log(`✅ Enum ${typeName}: valor ${label} adicionado.`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('already exists') || (error as { code?: string })?.code === '42701') {
        return;
      }
      // Alguns ambientes usam typname sem aspas / case diferente
      try {
        await this.dataSource.query(`ALTER TYPE ${typeName} ADD VALUE '${label}'`);
        this.logger.log(`✅ Enum ${typeName}: valor ${label} adicionado.`);
      } catch (e2: unknown) {
        const msg2 = e2 instanceof Error ? e2.message : String(e2);
        if (msg2.includes('already exists') || (e2 as { code?: string })?.code === '42701') {
          return;
        }
        throw error;
      }
    }
  }

  private async ensureRankedPointsColumn() {
    const cols = await this.dataSource.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'ranked_points'
    `);
    if (Array.isArray(cols) && cols.length > 0) return;
    await this.dataSource.query(`
      ALTER TABLE users ADD COLUMN ranked_points INTEGER NOT NULL DEFAULT 1000
    `);
    this.logger.log('✅ Coluna users.ranked_points criada (default 1000).');
  }

  private async ensureRankedScoreSettingsColumns() {
    const table = await this.dataSource.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'duel_score_settings'
    `);
    if (!Array.isArray(table) || table.length === 0) return;

    const addCol = async (name: string, ddl: string) => {
      const cols = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'duel_score_settings' AND column_name = $1`,
        [name],
      );
      if (Array.isArray(cols) && cols.length > 0) return;
      await this.dataSource.query(`ALTER TABLE duel_score_settings ADD COLUMN ${ddl}`);
      this.logger.log(`✅ Coluna duel_score_settings.${name} criada.`);
    };

    await addCol('scoreRanked', `"scoreRanked" NUMERIC(10,2) NOT NULL DEFAULT 2.0`);
    await addCol('rankedPointsOnWin', `"rankedPointsOnWin" INTEGER NOT NULL DEFAULT 25`);
    await addCol('rankedPointsOnLoss', `"rankedPointsOnLoss" INTEGER NOT NULL DEFAULT 20`);
  }

  private async ensureTurnCounterColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    
    try {
      await queryRunner.connect();
      
      // Verificar se a coluna existe
      const result = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'duels' 
        AND column_name = 'turn_counter'
      `);

      if (result.length === 0) {
        this.logger.log('🔧 Coluna turn_counter não existe. Criando...');
        
        // Criar a coluna (sem NOT NULL primeiro para permitir valores NULL temporariamente)
        await queryRunner.query(`
          ALTER TABLE duels 
          ADD COLUMN turn_counter INTEGER DEFAULT 1
        `);
        
        // Atualizar duelos existentes
        const updateResult = await queryRunner.query(`
          UPDATE duels 
          SET turn_counter = 1 
          WHERE turn_counter IS NULL
        `);
        
        this.logger.log(`✅ Coluna turn_counter criada! ${updateResult.rowCount || 0} duelos atualizados.`);
      } else {
        this.logger.log('✅ Coluna turn_counter já existe.');
      }
    } catch (error: any) {
      // Se o erro for "coluna já existe", ignorar
      if (error?.message?.includes('already exists') || error?.code === '42701') {
        this.logger.log('✅ Coluna turn_counter já existe (detectado via erro).');
      } else {
        this.logger.error('Erro ao verificar/criar coluna turn_counter:', error?.message || error);
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
