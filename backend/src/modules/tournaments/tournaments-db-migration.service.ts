import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class TournamentsDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(TournamentsDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      await this.ensureMinLevelColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração minLevel em tournaments:', error);
    }
    try {
      await this.ensureMaxLevelColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração maxLevel em tournaments:', error);
    }
    try {
      await this.ensureTournamentMatchThirdPlaceColumns();
    } catch (error) {
      this.logger.error('Erro ao executar migração third place em tournament_matches:', error);
    }
    try {
      await this.ensurePrizeDetailsColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração prizeDetails em tournaments:', error);
    }
    try {
      await this.ensureEntryFeeTypeColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração entryFeeType em tournaments:', error);
    }
    try {
      await this.ensureTournamentTypesTable();
    } catch (error) {
      this.logger.error('Erro ao executar migração tournament_types:', error);
    }
    try {
      await this.ensureTournamentTypeIdColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração tournamentTypeId em tournaments:', error);
    }
    try {
      await this.ensureUserTournamentPointsColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração tournament_points em users:', error);
    }
    try {
      await this.ensureTournamentClassesTable();
    } catch (error) {
      this.logger.error('Erro ao executar migração tournament_classes:', error);
    }
  }

  private async ensureUserTournamentPointsColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND LOWER(column_name) = 'tournament_points'
      `);
      if (result.length === 0) {
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "tournament_points" INTEGER NOT NULL DEFAULT 0`);
        this.logger.log('Coluna users.tournament_points criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureTournamentClassesTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const tableExists = await queryRunner.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tournament_classes'
      `);
      if (tableExists.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "tournament_classes" (
            "id" UUID NOT NULL DEFAULT gen_random_uuid(),
            "name" VARCHAR NOT NULL,
            "minPoints" INTEGER NOT NULL,
            "maxPlayers" INTEGER NULL,
            "order" INTEGER NOT NULL DEFAULT 1,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_tournament_classes" PRIMARY KEY ("id")
          )
        `);
        this.logger.log('Tabela tournament_classes criada.');
        await queryRunner.query(`
          INSERT INTO "tournament_classes" ("id", "name", "minPoints", "maxPlayers", "order")
          VALUES
            (gen_random_uuid(), 'Obelisco', 500, 50, 1),
            (gen_random_uuid(), 'Rá', 200, 100, 2),
            (gen_random_uuid(), 'Slifer', 50, NULL, 3)
        `);
        this.logger.log('Classes Obelisco, Rá, Slifer inseridas.');
      }
    } catch (error: any) {
      if (error?.code !== '42P07' && !error?.message?.includes('already exists')) throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureTournamentTypesTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tournament_types'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "tournament_types" (
            "id" UUID NOT NULL DEFAULT gen_random_uuid(),
            "name" VARCHAR NOT NULL,
            "description" TEXT NULL,
            "defaultBanlist" JSON NULL,
            "defaultEntryFee" INTEGER NOT NULL DEFAULT 0,
            "defaultEntryFeeType" VARCHAR(10) NOT NULL DEFAULT 'credit',
            "defaultMaxParticipants" INTEGER NOT NULL DEFAULT 16,
            "defaultMinLevel" INTEGER NOT NULL DEFAULT 1,
            "defaultMaxLevel" INTEGER NULL,
            "defaultPrizeDetails" JSONB NULL,
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            CONSTRAINT "PK_tournament_types" PRIMARY KEY ("id")
          )
        `);
        this.logger.log('Tabela tournament_types criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42P07' && !error?.message?.includes('already exists')) throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureTournamentTypeIdColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tournaments' AND LOWER(column_name) = 'tournamenttypeid'
      `);
      if (result.length === 0) {
        await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN "tournamentTypeId" UUID NULL`);
        this.logger.log('Coluna tournaments.tournamentTypeId criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureEntryFeeTypeColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tournaments' AND LOWER(column_name) = 'entryfeetype'
      `);
      if (result.length === 0) {
        await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN "entryFeeType" VARCHAR(10) NOT NULL DEFAULT 'credit'`);
        this.logger.log('Coluna tournaments.entryFeeType criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensurePrizeDetailsColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tournaments' AND LOWER(column_name) = 'prizedetails'
      `);
      if (result.length === 0) {
        await queryRunner.query(`ALTER TABLE "tournaments" ADD COLUMN "prizeDetails" JSONB NULL`);
        this.logger.log('Coluna tournaments.prizeDetails criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureTournamentMatchThirdPlaceColumns() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const cols = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'tournament_matches'
        AND LOWER(column_name) IN ('nextconsolationmatchid', 'isthirdplacematch')
      `);
      const names = (cols || []).map((r: any) => (r.column_name || '').toLowerCase());
      if (!names.includes('nextconsolationmatchid')) {
        await queryRunner.query(`ALTER TABLE "tournament_matches" ADD COLUMN "nextConsolationMatchId" UUID NULL`);
        this.logger.log('Coluna tournament_matches.nextConsolationMatchId criada.');
      }
      if (!names.includes('isthirdplacematch')) {
        await queryRunner.query(`ALTER TABLE "tournament_matches" ADD COLUMN "isThirdPlaceMatch" BOOLEAN NOT NULL DEFAULT false`);
        this.logger.log('Coluna tournament_matches.isThirdPlaceMatch criada.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureMaxLevelColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tournaments'
        AND LOWER(column_name) = 'maxlevel'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "tournaments"
          ADD COLUMN "maxLevel" INTEGER NULL
        `);
        this.logger.log('Coluna tournaments.maxLevel criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureMinLevelColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tournaments'
        AND LOWER(column_name) = 'minlevel'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "tournaments"
          ADD COLUMN "minLevel" INTEGER NOT NULL DEFAULT 1
        `);
        this.logger.log('Coluna tournaments.minLevel criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }
}
