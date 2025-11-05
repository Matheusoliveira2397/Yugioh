import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CardType {
  MONSTER = 'Monster',
  SPELL = 'Spell',
  TRAP = 'Trap',
}

export enum CardAttribute {
  DARK = 'DARK',
  LIGHT = 'LIGHT',
  WATER = 'WATER',
  FIRE = 'FIRE',
  EARTH = 'EARTH',
  WIND = 'WIND',
  DIVINE = 'DIVINE',
}

export enum CardRarity {
  COMMON = 'Common',
  RARE = 'Rare',
  SUPER_RARE = 'Super Rare',
  ULTRA_RARE = 'Ultra Rare',
  SECRET_RARE = 'Secret Rare',
  LEGENDARY = 'Legendary',
}

export enum MonsterType {
  NORMAL = 'Normal',
  EFFECT = 'Effect',
  RITUAL = 'Ritual',
  FUSION = 'Fusion',
  SYNCHRO = 'Synchro',
  XYZ = 'Xyz',
  PENDULUM = 'Pendulum',
  LINK = 'Link',
}

export enum SpellType {
  NORMAL = 'Normal',
  CONTINUOUS = 'Continuous',
  EQUIP = 'Equip',
  FIELD = 'Field',
  QUICK_PLAY = 'Quick-Play',
  RITUAL = 'Ritual',
}

export enum TrapType {
  NORMAL = 'Normal',
  CONTINUOUS = 'Continuous',
  COUNTER = 'Counter',
}

export enum MonsterRace {
  WARRIOR = 'Warrior',
  SPELLCASTER = 'Spellcaster',
  FAIRY = 'Fairy',
  FIEND = 'Fiend',
  ZOMBIE = 'Zombie',
  MACHINE = 'Machine',
  AQUA = 'Aqua',
  PYRO = 'Pyro',
  ROCK = 'Rock',
  WINGED_BEAST = 'Winged Beast',
  PLANT = 'Plant',
  INSECT = 'Insect',
  THUNDER = 'Thunder',
  DRAGON = 'Dragon',
  BEAST = 'Beast',
  BEAST_WARRIOR = 'Beast-Warrior',
  DINOSAUR = 'Dinosaur',
  FISH = 'Fish',
  SEA_SERPENT = 'Sea Serpent',
  REPTILE = 'Reptile',
  PSYCHIC = 'Psychic',
  DIVINE_BEAST = 'Divine-Beast',
  CREATOR_GOD = 'Creator God',
  WYRM = 'Wyrm',
  CYBERSE = 'Cyberse',
}

@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  nameEn: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  cardImage: string; // URL ou path da imagem

  @Column({ type: 'enum', enum: CardType })
  type: CardType;

  @Column({ type: 'enum', enum: MonsterType, nullable: true })
  monsterType?: MonsterType;

  @Column({ type: 'enum', enum: CardAttribute, nullable: true })
  attribute?: CardAttribute;

  @Column({ type: 'enum', enum: MonsterRace, nullable: true })
  race?: MonsterRace;

  @Column({ type: 'enum', enum: SpellType, nullable: true })
  spellType?: SpellType;

  @Column({ type: 'enum', enum: TrapType, nullable: true })
  trapType?: TrapType;

  @Column({ type: 'int', nullable: true })
  level?: number;

  @Column({ type: 'int', nullable: true })
  rank?: number; // Para Xyz

  @Column({ type: 'int', nullable: true })
  linkRating?: number; // Para Link

  @Column({ type: 'int', nullable: true })
  atk?: number;

  @Column({ type: 'int', nullable: true })
  def?: number;

  @Column({ type: 'int', nullable: true })
  pendulumScale?: number;

  // Sistema de Efeitos (JSON flexível)
  @Column({ type: 'jsonb', nullable: true })
  effect?: {
    type: 'continuous' | 'trigger' | 'ignition' | 'quick' | 'flip';
    timing?: string[]; // ['summon', 'attack', 'end-phase']
    condition?: string; // Condição para ativar
    action: string; // 'draw', 'destroy', 'special-summon', etc.
    target?: string; // 'opponent', 'self', 'all', etc.
    params?: any; // Parâmetros específicos do efeito
    cost?: any; // Custo para ativar
  };

  @Column({ type: 'enum', enum: CardRarity, default: CardRarity.COMMON })
  rarity: CardRarity;

  @Column({ type: 'int', default: 0 })
  konamiId?: number; // ID oficial da Konami

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isLimited: boolean; // Carta limitada/banida

  @Column({ type: 'int', default: 3 })
  maxCopiesInDeck: number; // Quantas cópias podem ter no deck

  // ==================== PREÇOS DA CARTA ====================
  @Column({ type: 'int', nullable: true, default: null })
  priceCoins?: number; // Preço em moedas (in-game currency)

  @Column({ type: 'int', nullable: true, default: null })
  priceCredits?: number; // Preço em créditos (premium currency)

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: null })
  priceCash?: number; // Preço em dinheiro real (R$, USD, etc)

  @Column({ default: false })
  isForSale: boolean; // Se está disponível na loja

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
