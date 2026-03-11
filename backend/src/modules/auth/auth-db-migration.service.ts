import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(AuthDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await this.ensureRefreshTokensTable();
    } catch (error) {
      this.logger.error('Erro ao executar migração de refresh_tokens:', error);
    }
    try {
      await this.ensureBannedUntilColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração bannedUntil:', error);
    }
  }

  private async ensureRefreshTokensTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'refresh_tokens'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "refresh_tokens" (
            "id" SERIAL NOT NULL,
            "userId" integer NOT NULL,
            "tokenHash" character varying NOT NULL,
            "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "lastUsedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
            CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
          )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`);
        this.logger.log('Tabela refresh_tokens criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42P07' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureBannedUntilColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'bannedUntil'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users"
          ADD COLUMN "bannedUntil" TIMESTAMP NULL
        `);
        this.logger.log('Coluna users.bannedUntil criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
