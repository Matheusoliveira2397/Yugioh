-- Alterar totalScore de int para numeric nas tabelas group_members e groups
ALTER TABLE group_members ALTER COLUMN "totalScore" TYPE numeric(10,2) USING "totalScore"::numeric;
ALTER TABLE groups ALTER COLUMN "totalScore" TYPE numeric(10,2) USING "totalScore"::numeric;

