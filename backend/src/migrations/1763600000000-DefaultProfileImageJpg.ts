import { MigrationInterface, QueryRunner } from 'typeorm';

export class DefaultProfileImageJpg1763600000000 implements MigrationInterface {
  name = 'DefaultProfileImageJpg1763600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users"
      SET "profileImage" = '/images/default.jpg'
      WHERE "profileImage" IS NULL
         OR TRIM("profileImage") = ''
         OR "profileImage" = '/images/default.png'
    `);
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "profileImage" SET DEFAULT '/images/default.jpg'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "profileImage" SET DEFAULT '/images/default.png'
    `);
    await queryRunner.query(`
      UPDATE "users"
      SET "profileImage" = '/images/default.png'
      WHERE "profileImage" = '/images/default.jpg'
    `);
  }
}
