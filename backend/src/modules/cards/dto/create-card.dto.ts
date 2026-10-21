import { 
  IsString, 
  IsNotEmpty, 
  IsEnum, 
  IsOptional, 
  IsInt, 
  IsBoolean, 
  Min, 
  Max
} from 'class-validator';
import { CardType, CardAttribute, CardRarity, MonsterType, SpellType, TrapType, MonsterRace } from '../entities/card.entity';

export class CreateCardDto {
  // ==================== INFORMAÇÕES BÁSICAS ====================
  @IsString()
  @IsNotEmpty()
  name: string; // Nome da carta (compartilhado entre skins - define o efeito)

  @IsString()
  @IsNotEmpty()
  idCarta: string; // ID único da skin (diferencia cada versão/skin da carta)

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
  @IsEnum(MonsterRace)
  race?: MonsterRace;

  @IsOptional()
  @IsEnum(SpellType)
  spellType?: SpellType;

  @IsOptional()
  @IsEnum(TrapType)
  trapType?: TrapType;

  // ==================== ARQUÉTIPO ====================
  @IsOptional()
  @IsString()
  archetype?: string;

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
  @Min(0)
  atk?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  def?: number;

  // ==================== RARIDADE E LIMITAÇÕES ====================
  @IsEnum(CardRarity)
  @IsNotEmpty()
  rarity: CardRarity;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isBanned?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  maxCopiesInDeck?: number;

  // ==================== PREÇOS ====================
  // REMOVIDO: Sistema de moedas foi desativado, apenas Cash e Créditos
  // @IsOptional()
  // @IsInt()
  // @Min(0)
  // priceCoins?: number; // Preço em moedas (DESATIVADO)

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCredits?: number; // Preço em créditos (moeda premium)

  @IsOptional()
  @IsInt()
  @Min(0)
  priceCash?: number; // Preço em cash (inteiro, sem centavos)

  @IsOptional()
  @IsBoolean()
  isForSale?: boolean; // Se está disponível na loja
}
