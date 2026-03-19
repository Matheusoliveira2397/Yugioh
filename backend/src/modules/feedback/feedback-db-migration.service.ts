import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class FeedbackDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(FeedbackDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await this.ensureUserFeedbackTable();
    } catch (error) {
      this.logger.error('Erro ao executar migração user_feedback:', error);
    }
  }

  private async ensureUserFeedbackTable() {
    const q = this.dataSource.createQueryRunner();
    try {
      await q.connect();
      const exists = await q.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_feedback'`
      );
      if (exists.length === 0) {
        await q.query(`
          CREATE TABLE "user_feedback" (
            "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "userId" INTEGER NOT NULL,
            "type" VARCHAR(32) NOT NULL,
            "message" TEXT NOT NULL,
            "createdAt" TIMESTAMP DEFAULT NOW(),
            "readAt" TIMESTAMP NULL,
            "replyMessage" TEXT NULL,
            "repliedAt" TIMESTAMP NULL,
            "repliedByUserId" INTEGER NULL,
            CONSTRAINT "FK_user_feedback_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
          )
        `);
        await q.query(`CREATE INDEX "IDX_user_feedback_userId_createdAt" ON "user_feedback"("userId", "createdAt")`);
        await q.query(`CREATE INDEX "IDX_user_feedback_readAt" ON "user_feedback"("readAt")`);
        this.logger.log('Tabela user_feedback criada.');
        return;
      }

      const cols = await q.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_feedback'`
      );
      const names = (cols as { column_name: string }[]).map((c) => c.column_name);
      if (!names.includes('replyMessage')) {
        await q.query(`ALTER TABLE "user_feedback" ADD COLUMN "replyMessage" TEXT NULL`);
        await q.query(`ALTER TABLE "user_feedback" ADD COLUMN "repliedAt" TIMESTAMP NULL`);
        await q.query(`ALTER TABLE "user_feedback" ADD COLUMN "repliedByUserId" INTEGER NULL`);
        this.logger.log('Colunas de resposta adicionadas em user_feedback.');
      }
    } finally {
      await q.release();
    }
  }
}
