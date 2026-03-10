import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AdminDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(AdminDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await this.ensureCreditPaymentLogsTable();
    } catch (error) {
      this.logger.error('Erro ao executar migração de credit_payment_logs:', error);
    }
  }

  private async ensureCreditPaymentLogsTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'credit_payment_logs'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "credit_payment_logs" (
            "id" SERIAL NOT NULL,
            "userId" integer NOT NULL,
            "adminId" integer NOT NULL,
            "amount" integer NOT NULL,
            "note" character varying(500),
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_credit_payment_logs" PRIMARY KEY ("id"),
            CONSTRAINT "FK_credit_payment_logs_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_credit_payment_logs_admin" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE CASCADE
          )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_credit_payment_logs_userId" ON "credit_payment_logs" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_credit_payment_logs_adminId" ON "credit_payment_logs" ("adminId")`);
        await queryRunner.query(`CREATE INDEX "IDX_credit_payment_logs_createdAt" ON "credit_payment_logs" ("createdAt")`);
        this.logger.log('Tabela credit_payment_logs criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42P07' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
