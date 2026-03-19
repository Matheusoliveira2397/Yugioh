import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class UserSystemNotificationsDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(UserSystemNotificationsDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      await this.ensureTableExists();
    } catch (error: any) {
      this.logger.error('Erro ao criar tabela user_system_notifications:', error?.message || error);
    }
  }

  private async ensureTableExists(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();

      const exists = await queryRunner.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'user_system_notifications'
      `);

      if (exists.length === 0) {
        this.logger.log('🔧 Criando tabela user_system_notifications...');

        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "user_system_notifications" (
            "id" uuid NOT NULL DEFAULT gen_random_uuid(),
            "userId" integer NOT NULL,
            "type" character varying(64) NOT NULL,
            "content" text NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            "readAt" TIMESTAMP WITH TIME ZONE NULL,
            CONSTRAINT "PK_user_system_notifications" PRIMARY KEY ("id"),
            CONSTRAINT "FK_user_system_notifications_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
          )
        `);
        await queryRunner.query(
          `CREATE INDEX IF NOT EXISTS "IDX_user_system_notifications_userId_createdAt" ON "user_system_notifications" ("userId", "createdAt")`,
        );

        this.logger.log('✅ Tabela user_system_notifications criada.');
      }
    } catch (error: any) {
      if (error?.message?.includes('already exists')) {
        this.logger.log('✅ Tabela user_system_notifications já existe.');
      } else {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
