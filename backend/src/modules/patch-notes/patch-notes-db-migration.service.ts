import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PatchNotesDbMigrationService implements OnModuleInit {
  private readonly logger = new Logger(PatchNotesDbMigrationService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await this.ensurePatchNotesTable();
      await this.ensureSiteTab();
    } catch (error) {
      this.logger.error('Erro ao migrar patch_notes:', error);
    }
  }

  private async ensurePatchNotesTable() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();

      const tables = await queryRunner.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'patch_notes'
      `);

      if (tables.length > 0) {
        return;
      }

      try {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      } catch {
        // ignore
      }

      let uuidFunction = 'gen_random_uuid()';
      try {
        await queryRunner.query(`SELECT gen_random_uuid();`);
      } catch {
        uuidFunction = 'uuid_generate_v4()';
      }

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "patch_notes" (
          "id" UUID PRIMARY KEY DEFAULT ${uuidFunction},
          "title" VARCHAR(255) NOT NULL,
          "content" TEXT NOT NULL,
          "version" VARCHAR(64) NULL,
          "category" VARCHAR(32) NOT NULL DEFAULT 'other',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "isPinned" BOOLEAN NOT NULL DEFAULT false,
          "authorId" INTEGER NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT "FK_patch_notes_author" FOREIGN KEY ("authorId")
            REFERENCES "users"("id") ON DELETE CASCADE
        )
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_patch_notes_createdAt" ON "patch_notes"("createdAt")
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_patch_notes_isActive" ON "patch_notes"("isActive")
      `);

      this.logger.log('Tabela patch_notes criada');
    } finally {
      await queryRunner.release();
    }
  }

  /** Garante a aba pública de Patch Notes no site_tabs */
  private async ensureSiteTab() {
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();

      const tables = await queryRunner.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'site_tabs'
      `);
      if (tables.length === 0) return;

      const existing = await queryRunner.query(`
        SELECT id FROM "site_tabs" WHERE "key" = 'patch-notes' LIMIT 1
      `);
      if (existing.length > 0) return;

      let uuidFunction = 'gen_random_uuid()';
      try {
        await queryRunner.query(`SELECT gen_random_uuid();`);
      } catch {
        uuidFunction = 'uuid_generate_v4()';
      }

      await queryRunner.query(`
        INSERT INTO "site_tabs" ("id", "key", "label", "route", "icon", "order", "isActive", "createdAt", "updatedAt")
        VALUES (${uuidFunction}, 'patch-notes', 'Patch Notes', '/patch-notes', '/images/Icones/PatchNotes.png', 85, true, NOW(), NOW())
      `);
      this.logger.log('Aba site_tabs patch-notes criada');
    } catch (error: any) {
      this.logger.warn(
        `Não foi possível garantir aba patch-notes: ${error?.message || error}`,
      );
    } finally {
      await queryRunner.release();
    }
  }
}
