-- Criar tipos enum para Spell e Trap
CREATE TYPE cards_spelltype_enum AS ENUM ('Normal', 'Continuous', 'Equip', 'Field', 'Quick-Play', 'Ritual');
CREATE TYPE cards_traptype_enum AS ENUM ('Normal', 'Continuous', 'Counter');
CREATE TYPE cards_monsterrace_enum AS ENUM ('Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse');

-- Adicionar novas colunas
ALTER TABLE cards ADD COLUMN "spellType" cards_spelltype_enum;
ALTER TABLE cards ADD COLUMN "trapType" cards_traptype_enum;
ALTER TABLE cards ADD COLUMN "pendulumEffect" character varying;
ALTER TABLE cards ADD COLUMN "archetype" character varying;
ALTER TABLE cards ADD COLUMN "isBanned" boolean NOT NULL DEFAULT false;

-- Converter coluna race para enum (com dados existentes)
ALTER TABLE cards ALTER COLUMN race TYPE cards_monsterrace_enum USING race::cards_monsterrace_enum;
