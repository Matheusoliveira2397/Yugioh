import { 
  IsString, 
  IsNotEmpty, 
  IsEnum, 
  IsOptional, 
  IsInt, 
  IsBoolean, 
  IsNumber, 
  Min, 
  Max,
  IsObject,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { CardType, CardAttribute, CardRarity, MonsterType } from '../entities/card.entity';

// DTO para Efeito da Carta
export class CardEffectDto {
  @IsEnum(['continuous', 'trigger', 'ignition', 'quick', 'flip'])
  type: 'continuous' | 'trigger' | 'ignition' | 'quick' | 'flip';

  @IsOptional()
  @IsString({ each: true })
  timing?: string[]; // ['summon', 'attack', 'end-phase']

  @IsOptional()
  @IsString()
  condition?: string; // Condição para ativar

  @IsString()
  @IsNotEmpty()
  action: string; // 'draw', 'destroy', 'special-summon', etc.

  @IsOptional()
  @IsString()
  target?: string; // 'opponent', 'self', 'all', etc.

  @IsOptional()
  params?: any; // Parâmetros específicos do efeito

  @IsOptional()
  cost?: any; // Custo para ativar
}

export class CreateCardDto {
  // ==================== INFORMAÇÕES BÁSICAS ====================
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  cardImage?: string;

  // ==================== TIPO DA CARTA ====================
  @IsEnum(CardType)
  @IsNotEmpty()
  type: CardType;

  @IsOptional()
  @IsEnum(MonsterType)
  monsterType?: MonsterType;

  @IsOptional()
  @IsEnum(CardAttribute)
  attribute?: CardAttribute;

  @IsOptional()
  @IsString()
  race?: string; // Warrior, Dragon, Spellcaster, etc.

  // ==================== ESTATÍSTICAS ====================
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  rank?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  linkRating?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  atk?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  def?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(13)
  pendulumScale?: number;

  // ==================== EFEITO ====================
  @IsOptional()
  @ValidateNested()
  @Type(() => CardEffectDto)
  effect?: CardEffectDto;

  // ==================== RARIDADE E LIMITAÇÕES ====================
  @IsEnum(CardRarity)
  @IsNotEmpty()
  rarity: CardRarity;

  @IsOptional()
  @IsInt()
  konamiId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isLimited?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  maxCopiesInDeck?: number;

  // ==================== PREÇOS ====================
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCoins?: number; // Preço em moedas

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCredits?: number; // Preço em créditos

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceCash?: number; // Preço em dinheiro real

  @IsOptional()
  @IsBoolean()
  isForSale?: boolean; // Se está disponível na loja
}
