import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
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
  id: string; // UUID interno para relações (mantido para compatibilidade)

  @Column({ unique: true })
  idCarta: string; // ID único da skin (diferencia cada versão/skin da carta)

  @Column()
  @Index()
  name: string; // Nome da carta (compartilhado entre skins - define o efeito)

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

  @Column({ nullable: true })
  archetype?: string; // Blue-Eyes, Dark Magician, Elemental HERO, etc.

  @Column({ type: 'int', nullable: true })
  level?: number;

  @Column({ type: 'int', nullable: true })
  rank?: number; // Para Xyz

  @Column({ type: 'int', nullable: true })
  atk?: number;

  @Column({ type: 'int', nullable: true })
  def?: number;

  @Column({ type: 'enum', enum: CardRarity, default: CardRarity.COMMON })
  rarity: CardRarity;

  @Column({ default: true })
  @Index()
  isActive: boolean;

  /** Quando a carta foi ativada no jogo (ordem da coleção). */
  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  activatedAt?: Date | null;

  /** Admin marcou o efeito desta carta (por nome) como implementado corretamente. */
  @Column({ default: false })
  @Index()
  effectVerified: boolean;

  @Column({ default: false })
  isBanned: boolean; // Carta banida (proibida em duelos)

  @Column({ type: 'int', default: 3 })
  maxCopiesInDeck: number; // Quantas cópias podem ter no deck

  // ==================== PREÇOS DA CARTA ====================
  // REMOVIDO: Sistema de moedas desativado - apenas Cash e Créditos
  // @Column({ type: 'int', nullable: true, default: null })
  // priceCoins?: number; // Preço em moedas (DESATIVADO)

  @Column({ type: 'int', nullable: true, default: null })
  priceCredits?: number; // Preço em créditos (moeda premium)

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: null })
  priceCash?: number; // Preço em dinheiro real (R$)

  @Column({ default: false })
  @Index()
  isForSale: boolean; // Se está disponível na loja

  // Índice composto para queries da loja
  @Index(['isActive', 'isForSale'])
  @Index(['rarity', 'createdAt'])
  // Índice para buscar cartas pelo nome (para pegar efeitos)
  @Index(['name'])

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
