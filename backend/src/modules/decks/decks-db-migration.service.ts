import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DecksDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(DecksDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      await this.ensureCoverCardIdColumn();
    } catch (error: any) {
      this.logger.error('Erro ao adicionar coluna coverCardId em decks:', error?.message || error);
    }
  }

  private async ensureCoverCardIdColumn(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();

      const hasCover = await queryRunner.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'decks' AND column_name = 'coverCardId'
      `);
      if (hasCover.length === 0) {
        this.logger.log('🔧 Adicionando coluna coverCardId em decks...');
        await queryRunner.query(`ALTER TABLE "decks" ADD COLUMN "coverCardId" uuid NULL`);
        await queryRunner.query(`
          ALTER TABLE "decks" ADD CONSTRAINT "FK_decks_cover_card"
          FOREIGN KEY ("coverCardId") REFERENCES "cards"("id") ON DELETE SET NULL
        `).catch(() => {});
        this.logger.log('✅ Coluna coverCardId adicionada em decks.');
      }
    } finally {
      await queryRunner.release();
    }
  }
}
