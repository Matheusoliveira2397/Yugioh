import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCardPromotions1762700000000 implements MigrationInterface {
  name = 'CreateCardPromotions1762700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "card_promotions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cardId" uuid NOT NULL,
        "discountPercent" integer NOT NULL DEFAULT 0,
        "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "label" character varying(120),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_card_promotions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_card_promotions_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_card_promotions_cardId" ON "card_promotions" ("cardId")`);
    await queryRunner.query(`CREATE INDEX "IDX_card_promotions_dates" ON "card_promotions" ("startsAt", "endsAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_card_promotions_dates"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_card_promotions_cardId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "card_promotions"`);
  }
}
