import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreatePatchNoteDto } from './dto/create-patch-note.dto';
import { UpdatePatchNoteDto } from './dto/update-patch-note.dto';
import { PatchNotesService } from './patch-notes.service';

@Controller('admin/patch-notes')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PatchNotesAdminController {
  constructor(private readonly patchNotesService: PatchNotesService) {}

  @Get()
  findAll() {
    return this.patchNotesService.findAllAdmin();
  }

  @Post()
  create(@Body() dto: CreatePatchNoteDto, @Request() req: any) {
    return this.patchNotesService.create(dto, Number(req.user.id));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePatchNoteDto, @Request() req: any) {
    return this.patchNotesService.update(id, dto, Number(req.user.id), true);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.patchNotesService.remove(id, Number(req.user.id), true);
  }
}
