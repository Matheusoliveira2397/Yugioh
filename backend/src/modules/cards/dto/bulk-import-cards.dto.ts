import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MonsterType, SpellType, TrapType } from '../entities/card.entity';

const MONSTER_SUBTYPE_VALUES = Object.values(MonsterType) as string[];
const SPELL_SUBTYPE_VALUES = Object.values(SpellType) as string[];
const TRAP_SUBTYPE_VALUES = Object.values(TrapType) as string[];

export type BulkImportOnConflict = 'skip' | 'update';

export class BulkImportCardsDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** Máximo de registros a processar (útil para testes). Sem limite = todo o catálogo. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50000)
  limit?: number;

  /** Traduz descrições (en→pt); muito lento em catálogo grande. Padrão: false. */
  @IsOptional()
  @IsBoolean()
  translate?: boolean;

  /** Baixa imagens para disco; extremamente lento. Padrão: false (mantém URL YGOPRODeck). */
  @IsOptional()
  @IsBoolean()
  downloadImages?: boolean;

  @IsOptional()
  @IsIn(['skip', 'update'])
  onConflict?: BulkImportOnConflict;

  /** Uma linha por arte alternativa (id de card_images). Padrão: false = uma linha por carta lógica. */
  @IsOptional()
  @IsBoolean()
  alternateArts?: boolean;

  /**
   * Filtrar por tipo no jogo (Monster / Spell / Trap).
   * Omitido ou vazio = importar todos os tipos.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['Monster', 'Spell', 'Trap'], { each: true })
  cardTypes?: ('Monster' | 'Spell' | 'Trap')[];

  /** Filtrar monstro por subtipo (Normal, Effect, Fusion, …). Omitido = todos. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(MONSTER_SUBTYPE_VALUES, { each: true })
  monsterSubtypes?: string[];

  /** Filtrar magia por subtipo (Normal, Continuous, Quick-Play, …). Omitido = todas. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SPELL_SUBTYPE_VALUES, { each: true })
  spellSubtypes?: string[];

  /** Filtrar armadilha por subtipo. Omitido = todas. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(TRAP_SUBTYPE_VALUES, { each: true })
  trapSubtypes?: string[];

  /** Se true, grava com isActive=false (revise e ative manualmente no painel). */
  @IsOptional()
  @IsBoolean()
  importAsInactive?: boolean;
}
