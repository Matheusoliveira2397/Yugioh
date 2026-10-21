import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PATCH_NOTE_CATEGORIES } from './create-patch-note.dto';

export class UpdatePatchNoteDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  version?: string | null;

  @IsString()
  @IsOptional()
  @IsIn(PATCH_NOTE_CATEGORIES)
  category?: (typeof PATCH_NOTE_CATEGORIES)[number];

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
