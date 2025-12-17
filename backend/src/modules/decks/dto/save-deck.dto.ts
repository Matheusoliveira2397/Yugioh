import { IsArray, IsOptional, IsString, IsNotEmpty, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SaveDeckDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @IsString({ each: true }) // Cada item do array deve ser uma string
  @IsNotEmpty({ each: true }) // Cada item não pode ser vazio
  cardIds: string[]; // Array de cardIds do Deck Principal (pode ter duplicatas)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  extraDeckCardIds?: string[]; // Array de cardIds do Extra Deck (máximo 15, apenas Fusion)
}

