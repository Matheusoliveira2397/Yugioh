import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTalismans1762600000000 implements MigrationInterface {
  name = 'CreateTalismans1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "talisman_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(120) NOT NULL,
        "description" text,
        "image" character varying(500),
        "bonusScorePct" integer NOT NULL DEFAULT 0,
        "bonusCashPct" integer NOT NULL DEFAULT 0,
        "bonusArenaPointsPct" integer NOT NULL DEFAULT 0,
        "priceCredits" integer DEFAULT 0,
        "priceCash" integer DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "isForSale" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_talisman_templates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_talismans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" integer NOT NULL,
        "talismanTemplateId" uuid NOT NULL,
        "equipped" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_talismans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_talismans_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_talismans_template" FOREIGN KEY ("talismanTemplateId") REFERENCES "talisman_templates"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_user_talismans_userId" ON "user_talismans" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_talismans_equipped" ON "user_talismans" ("userId", "equipped") WHERE "equipped" = true`);

    // Inserir talismãs iniciais na loja
    await queryRunner.query(`
      INSERT INTO "talisman_templates" ("id", "name", "description", "image", "bonusScorePct", "bonusCashPct", "bonusArenaPointsPct", "priceCredits", "priceCash", "isActive", "isForSale")
      VALUES
        (uuid_generate_v4(), 'Talismã do Iniciante', 'Bônus modestos na Arena.', NULL, 5, 5, 10, 500, 50, true, true),
        (uuid_generate_v4(), 'Talismã do Guerreiro', 'Aumenta recompensas da Arena.', NULL, 10, 10, 15, 1500, 150, true, true),
        (uuid_generate_v4(), 'Talismã do Mestre', 'Grandes bônus em Score, Cash e Arena Points.', NULL, 15, 15, 20, 4000, 400, true, true),
        (uuid_generate_v4(), 'Talismã Lendário', 'Máximos bônus na Arena de Duelos.', NULL, 25, 25, 30, 10000, 1000, true, true)
    `);

    console.log('✅ Tabelas talisman_templates e user_talismans criadas com sucesso');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_user_talismans_equipped"`);
    await queryRunner.query(`DROP INDEX "IDX_user_talismans_userId"`);
    await queryRunner.query(`DROP TABLE "user_talismans"`);
    await queryRunner.query(`DROP TABLE "talisman_templates"`);
    console.log('✅ Tabelas de talismãs removidas');
  }
}
