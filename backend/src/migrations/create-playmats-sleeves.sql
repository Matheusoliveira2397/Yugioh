-- Criar tabela playmats
CREATE TABLE IF NOT EXISTS "playmats" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" character varying NOT NULL,
    "description" text,
    "image" character varying NOT NULL,
    "priceCredits" integer,
    "priceCash" integer,
    "isActive" boolean NOT NULL DEFAULT true,
    "isForSale" boolean NOT NULL DEFAULT false,
    "stock" integer,
    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "PK_playmats" PRIMARY KEY ("id")
);

-- Criar tabela sleeves
CREATE TABLE IF NOT EXISTS "sleeves" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" character varying NOT NULL,
    "description" text,
    "image" character varying NOT NULL,
    "priceCredits" integer,
    "priceCash" integer,
    "isActive" boolean NOT NULL DEFAULT true,
    "isForSale" boolean NOT NULL DEFAULT false,
    "stock" integer,
    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT "PK_sleeves" PRIMARY KEY ("id")
);

-- Criar índices
CREATE INDEX IF NOT EXISTS "IDX_playmats_isActive" ON "playmats" ("isActive");
CREATE INDEX IF NOT EXISTS "IDX_playmats_isForSale" ON "playmats" ("isForSale");
CREATE INDEX IF NOT EXISTS "IDX_sleeves_isActive" ON "sleeves" ("isActive");
CREATE INDEX IF NOT EXISTS "IDX_sleeves_isForSale" ON "sleeves" ("isForSale");










