-- Alterar weeklyScore e seasonScore de int para numeric na tabela group_members
-- Isso permite que os scores suportem valores decimais, como o totalScore
ALTER TABLE group_members ALTER COLUMN "weeklyScore" TYPE numeric(10,2) USING "weeklyScore"::numeric;
ALTER TABLE group_members ALTER COLUMN "seasonScore" TYPE numeric(10,2) USING "seasonScore"::numeric;
