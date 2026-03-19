import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSystemNotifications1763200000000 implements MigrationInterface {
  name = 'CreateUserSystemNotifications1763200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      `CREATE INDEX "IDX_user_system_notifications_userId_createdAt" ON "user_system_notifications" ("userId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_system_notifications_userId_createdAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_system_notifications"`);
  }
}
