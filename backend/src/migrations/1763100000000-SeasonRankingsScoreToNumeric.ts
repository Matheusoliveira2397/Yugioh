import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Altera season_rankings.seasonScore de integer para numeric(10,2)
 * para que vitórias em random duel (1.7) e outros scores decimais
 * sejam armazenados corretamente na season.
 */
export class SeasonRankingsScoreToNumeric1763100000000 implements MigrationInterface {
  name = 'SeasonRankingsScoreToNumeric1763100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "season_rankings"
      ALTER COLUMN "seasonScore" TYPE numeric(10,2) USING COALESCE("seasonScore", 0)::numeric
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "season_rankings"
      ALTER COLUMN "seasonScore" TYPE integer USING COALESCE("seasonScore", 0)::integer
    `);
  }
}
