import { MigrationInterface, QueryRunner } from 'typeorm';

export class LoginBroadcasts1763500000000 implements MigrationInterface {
  name = 'LoginBroadcasts1763500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "dismissedLoginBroadcastId" uuid NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "dismissedLoginBroadcastId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_login_broadcasts_isActive_createdAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "login_broadcasts"`);
  }
}
