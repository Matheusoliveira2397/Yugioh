import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(AuthDbMigrationService.name);

  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await this.ensureRefreshTokensTable();
    } catch (error) {
      this.logger.error('Erro ao executar migração de refresh_tokens:', error);
    }
    try {
      await this.ensureBannedUntilColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração bannedUntil:', error);
    }
    try {
      await this.ensureEquippedDeckIdColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração equipped_deck_id:', error);
    }
    try {
      await this.ensureStarsColumn();
    } catch (error) {
      this.logger.error('Erro ao executar migração stars:', error);
    }
    try {
      await this.ensureGoogleAuthColumns();
    } catch (error) {
      this.logger.error('Erro ao executar migração Google Auth:', error);
    }
  }

  private async ensureRefreshTokensTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'refresh_tokens'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          CREATE TABLE "refresh_tokens" (
            "id" SERIAL NOT NULL,
            "userId" integer NOT NULL,
            "tokenHash" character varying NOT NULL,
            "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "lastUsedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
            CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
          )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")`);
        await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`);
        this.logger.log('Tabela refresh_tokens criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42P07' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureBannedUntilColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'bannedUntil'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users"
          ADD COLUMN "bannedUntil" TIMESTAMP NULL
        `);
        this.logger.log('Coluna users.bannedUntil criada com sucesso.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureEquippedDeckIdColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'equipped_deck_id'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users"
          ADD COLUMN IF NOT EXISTS "equipped_deck_id" uuid NULL
        `);
        this.logger.log('Coluna users.equipped_deck_id criada com sucesso.');
        const fillResult = await queryRunner.query(`
          UPDATE "users" u
          SET "equipped_deck_id" = (
            SELECT d.id FROM "decks" d
            WHERE d."userId" = u.id AND d.name = u."equippedDeckName"
            LIMIT 1
          )
          WHERE u."equippedDeckName" IS NOT NULL AND u."equippedDeckName" <> ''
        `);
        this.logger.log('Preenchido equipped_deck_id para usuários com deck equipado por nome.');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  private async ensureStarsColumn() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const result = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'stars'
      `);
      if (result.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users"
          ADD COLUMN "stars" integer NOT NULL DEFAULT 0
        `);
        this.logger.log('Coluna users.stars criada com sucesso (premiação torneios/outros).');
      }
    } catch (error: any) {
      if (error?.code !== '42701' && !error?.message?.includes('already exists')) {
        throw error;
      }
    } finally {
      await queryRunner.release();
    }
  }

  /** Colunas OAuth Google + senha nullable para contas só-Google. */
  private async ensureGoogleAuthColumns() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();

      const googleIdCol = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'googleId'
      `);
      if (googleIdCol.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users" ADD COLUMN "googleId" character varying(64) NULL
        `);
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_googleId" ON "users" ("googleId")
          WHERE "googleId" IS NOT NULL
        `);
        this.logger.log('Coluna users.googleId criada com sucesso.');
      }

      const authProviderCol = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'authProvider'
      `);
      if (authProviderCol.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users" ADD COLUMN "authProvider" character varying(32) NOT NULL DEFAULT 'local'
        `);
        this.logger.log('Coluna users.authProvider criada com sucesso.');
      }

      const passwordNullable = await queryRunner.query(`
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password'
      `);
      if (passwordNullable.length > 0 && passwordNullable[0].is_nullable === 'NO') {
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`);
        this.logger.log('Coluna users.password agora aceita NULL (contas OAuth).');
      }

      const setupCol = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'profileSetupCompleted'
      `);
      if (setupCol.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users" ADD COLUMN "profileSetupCompleted" boolean NOT NULL DEFAULT true
        `);
        this.logger.log('Coluna users.profileSetupCompleted criada com sucesso.');
      }

      const frameCol = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'equippedAvatarFrame'
      `);
      if (frameCol.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "users" ADD COLUMN "equippedAvatarFrame" character varying(32) NULL
        `);
        this.logger.log('Coluna users.equippedAvatarFrame criada com sucesso.');
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
