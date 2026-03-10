import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCreditPaymentLogs1762900000000 implements MigrationInterface {
  name = 'CreateCreditPaymentLogs1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "credit_payment_logs" (
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_payment_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_payment_logs_adminId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_payment_logs_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "credit_payment_logs"`);
  }
}
