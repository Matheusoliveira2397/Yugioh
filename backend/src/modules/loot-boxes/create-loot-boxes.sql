CREATE TABLE IF NOT EXISTS loot_boxes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name varchar(120) NOT NULL,
 description text,
 "cardsPerOpening" integer NOT NULL DEFAULT 1,
 "priceCredits" integer NOT NULL DEFAULT 0,
 "priceCash" integer NOT NULL DEFAULT 0,
 "isActive" boolean NOT NULL DEFAULT false,
 chances jsonb NOT NULL,
 pool jsonb NOT NULL,
 "createdAt" timestamp NOT NULL DEFAULT now(),
 "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loot_box_openings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "lootBoxId" uuid NOT NULL REFERENCES loot_boxes(id),
 "userId" integer NOT NULL REFERENCES users(id),
 currency varchar(8) NOT NULL,
 price integer NOT NULL,
 rewards jsonb NOT NULL,
 "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loot_box_openings_user ON loot_box_openings ("userId", "createdAt");
