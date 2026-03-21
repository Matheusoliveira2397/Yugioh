import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class LoginBroadcastMigrationService implements OnModuleInit {
  private readonly logger = new Logger(LoginBroadcastMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      await this.ensureSchema();
    } catch (error: any) {
      this.logger.error('Erro ao garantir schema login_broadcasts:', error?.message || error);
    }
  }

  private async ensureSchema(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();

      const tbl = await queryRunner.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'login_broadcasts'
      `);
      if (tbl.length === 0) {
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "login_broadcasts" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "title" character varying(200) NOT NULL DEFAULT '',
            "bodyHtml" text NOT NULL,
            "isActive" boolean NOT NULL DEFAULT false,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_login_broadcasts" PRIMARY KEY ("id")
          )
        `);
        await queryRunner.query(
          `CREATE INDEX IF NOT EXISTS "IDX_login_broadcasts_isActive_createdAt" ON "login_broadcasts" ("isActive", "createdAt")`,
        );
        this.logger.log('✅ Tabela login_broadcasts criada.');
      }

      const col = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'dismissedLoginBroadcastId'
      `);
      if (col.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users" ADD COLUMN "dismissedLoginBroadcastId" uuid NULL
        `);
        this.logger.log('✅ Coluna users.dismissedLoginBroadcastId adicionada.');
      }
    } finally {
      await queryRunner.release();
    }
  }
}
