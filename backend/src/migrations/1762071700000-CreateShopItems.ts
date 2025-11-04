import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateShopItems1762071700000 implements MigrationInterface {
    name = 'CreateShopItems1762071700000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create shop_items table
        await queryRunner.query(`
            CREATE TABLE "shop_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "currency" character varying NOT NULL DEFAULT 'COINS',
                "price" integer NOT NULL,
                "discount" integer NOT NULL DEFAULT 0,
                "isAvailable" boolean NOT NULL DEFAULT true,
                "isFeatured" boolean NOT NULL DEFAULT false,
                "isLimited" boolean NOT NULL DEFAULT false,
                "stock" integer,
                "availableUntil" TIMESTAMP,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "cardId" uuid NOT NULL,
                CONSTRAINT "PK_shop_items" PRIMARY KEY ("id"),
                CONSTRAINT "FK_shop_items_card" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE
            )
        `);

        // Create index on cardId for faster lookups
        await queryRunner.query(`
            CREATE INDEX "IDX_shop_items_cardId" ON "shop_items" ("cardId")
        `);

        // Create index on currency for filtering
        await queryRunner.query(`
            CREATE INDEX "IDX_shop_items_currency" ON "shop_items" ("currency")
        `);

        // Create index on isAvailable for filtering
        await queryRunner.query(`
            CREATE INDEX "IDX_shop_items_isAvailable" ON "shop_items" ("isAvailable")
        `);

        // Create index on isFeatured for filtering
        await queryRunner.query(`
            CREATE INDEX "IDX_shop_items_isFeatured" ON "shop_items" ("isFeatured")
        `);

        console.log('✅ Tabela shop_items criada com sucesso');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes
        await queryRunner.query(`DROP INDEX "IDX_shop_items_isFeatured"`);
        await queryRunner.query(`DROP INDEX "IDX_shop_items_isAvailable"`);
        await queryRunner.query(`DROP INDEX "IDX_shop_items_currency"`);
        await queryRunner.query(`DROP INDEX "IDX_shop_items_cardId"`);
        
        // Drop table
        await queryRunner.query(`DROP TABLE "shop_items"`);
        
        console.log('✅ Tabela shop_items removida');
    }
}
