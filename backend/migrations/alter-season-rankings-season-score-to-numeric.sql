-- Permite que season_rankings.seasonScore armazene decimais (ex.: 1.7, 2.0, 10.0)
ALTER TABLE season_rankings
  ALTER COLUMN "seasonScore" TYPE numeric(10,2) USING COALESCE("seasonScore", 0)::numeric;
