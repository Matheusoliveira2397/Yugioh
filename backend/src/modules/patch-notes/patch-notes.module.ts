import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatchNote } from './entities/patch-note.entity';
import { PatchNotesController } from './patch-notes.controller';
import { PatchNotesAdminController } from './patch-notes-admin.controller';
import { PatchNotesService } from './patch-notes.service';
import { PatchNotesDbMigrationService } from './patch-notes-db-migration.service';

@Module({
  imports: [TypeOrmModule.forFeature([PatchNote])],
  controllers: [PatchNotesController, PatchNotesAdminController],
  providers: [PatchNotesService, PatchNotesDbMigrationService],
  exports: [PatchNotesService],
})
export class PatchNotesModule {}
