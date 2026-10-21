import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const PATCH_NOTE_CATEGORIES = [
  'bugfix',
  'cards',
  'features',
  'balance',
  'other',
] as const;

export class CreatePatchNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  version?: string;

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
