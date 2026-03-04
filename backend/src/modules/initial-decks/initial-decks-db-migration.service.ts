import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class InitialDecksDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(InitialDecksDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      await this.ensureIsExtraDeckColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração isExtraDeck em initial_deck_cards:', error);
    }
  }

  private async ensureIsExtraDeckColumn() {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'initial_deck_cards'
        AND column_name = 'isExtraDeck'
      `);

      if (result.length === 0) {
        this.logger.log('🔧 Coluna initial_deck_cards.isExtraDeck não existe. Criando...');

        await queryRunner.query(`
          ALTER TABLE "initial_deck_cards"
          ADD COLUMN IF NOT EXISTS "isExtraDeck" BOOLEAN NOT NULL DEFAULT false
        `);

        this.logger.log('✅ Coluna initial_deck_cards.isExtraDeck criada.');
      }
    } catch (error: any) {
      if (error?.message?.includes('already exists') || error?.code === '42701') {
        this.logger.log('✅ Coluna initial_deck_cards.isExtraDeck já existe.');
      } else {
        this.logger.error('Erro ao verificar/criar coluna isExtraDeck:', error?.message || error);
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
