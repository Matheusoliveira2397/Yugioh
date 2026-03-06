import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveExperienceFromUsers1762072000000 implements MigrationInterface {
  name = 'RemoveExperienceFromUsers1762072000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN IF EXISTS "experience"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "experience" integer NOT NULL DEFAULT 0
    `);
  }
}
