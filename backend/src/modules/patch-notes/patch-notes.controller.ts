import { Controller, Get, Param } from '@nestjs/common';
import { PatchNotesService } from './patch-notes.service';

@Controller('patch-notes')
export class PatchNotesController {
  constructor(private readonly patchNotesService: PatchNotesService) {}

  @Get()
  findAll() {
    return this.patchNotesService.findAllPublic();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.patchNotesService.findOne(id);
  }
}
