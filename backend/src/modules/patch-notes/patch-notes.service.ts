import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatchNote } from './entities/patch-note.entity';
import { CreatePatchNoteDto } from './dto/create-patch-note.dto';
import { UpdatePatchNoteDto } from './dto/update-patch-note.dto';

const AUTHOR_SELECT = {
  id: true,
  nickname: true,
  username: true,
  clanTag: true,
} as const;

@Injectable()
export class PatchNotesService {
  constructor(
    @InjectRepository(PatchNote)
    private readonly patchNotesRepository: Repository<PatchNote>,
  ) {}

  async create(dto: CreatePatchNoteDto, userId: number): Promise<PatchNote> {
    const note = this.patchNotesRepository.create({
      title: dto.title.trim(),
      content: dto.content.trim(),
      version: dto.version?.trim() || null,
      category: dto.category || 'other',
      isPinned: dto.isPinned ?? false,
      isActive: dto.isActive ?? true,
      authorId: userId,
    });
    const saved = await this.patchNotesRepository.save(note);
    return this.findOne(saved.id, true);
  }

  async findAllPublic(): Promise<PatchNote[]> {
    return this.patchNotesRepository.find({
      where: { isActive: true },
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      relations: ['author'],
      select: {
        id: true,
        title: true,
        content: true,
        version: true,
        category: true,
        isActive: true,
        isPinned: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        author: AUTHOR_SELECT as any,
      },
      take: 100,
    });
  }

  async findAllAdmin(): Promise<PatchNote[]> {
    return this.patchNotesRepository.find({
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      relations: ['author'],
      select: {
        id: true,
        title: true,
        content: true,
        version: true,
        category: true,
        isActive: true,
        isPinned: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        author: AUTHOR_SELECT as any,
      },
      take: 200,
    });
  }

  async findOne(id: string, allowInactive = false): Promise<PatchNote> {
    const note = await this.patchNotesRepository.findOne({
      where: allowInactive ? { id } : { id, isActive: true },
      relations: ['author'],
      select: {
        id: true,
        title: true,
        content: true,
        version: true,
        category: true,
        isActive: true,
        isPinned: true,
        authorId: true,
        createdAt: true,
        updatedAt: true,
        author: AUTHOR_SELECT as any,
      },
    });

    if (!note) {
      throw new NotFoundException('Patch note não encontrado');
    }

    return note;
  }

  async update(
    id: string,
    dto: UpdatePatchNoteDto,
    userId: number,
    isAdmin: boolean,
  ): Promise<PatchNote> {
    const note = await this.findOne(id, true);

    if (!isAdmin && note.authorId !== userId) {
      throw new ForbiddenException('Você não tem permissão para editar este patch note');
    }

    if (dto.title !== undefined) note.title = dto.title.trim();
    if (dto.content !== undefined) note.content = dto.content.trim();
    if (dto.version !== undefined) note.version = dto.version?.trim() || null;
    if (dto.category !== undefined) note.category = dto.category;
    if (dto.isPinned !== undefined) note.isPinned = dto.isPinned;
    if (dto.isActive !== undefined) note.isActive = dto.isActive;

    await this.patchNotesRepository.save(note);
    return this.findOne(id, true);
  }

  async remove(id: string, userId: number, isAdmin: boolean): Promise<void> {
    const note = await this.findOne(id, true);

    if (!isAdmin && note.authorId !== userId) {
      throw new ForbiddenException('Você não tem permissão para remover este patch note');
    }

    await this.patchNotesRepository.remove(note);
  }
}
