import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CardRarity } from '../cards/entities/card.entity';

/** Carta elegível no pacote: peso relativo dentro da raridade e cópias entregues. */
export interface LootPoolEntry {
  cardId: string;
  weight: number;
  quantity: number;
}

/** Quando o sorteio cai em "créditos", escolhe um valor desta lista pelo peso. */
export interface CreditRewardEntry {
  amount: number;
  weight: number;
}

export type RarityChances = Record<CardRarity, number>;

@Entity('loot_boxes')
export class LootBox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Quantidade de drops por abertura do pacote. */
  @Column({ type: 'int', default: 1 })
  cardsPerOpening: number;

  @Column({ type: 'int', default: 0 })
  priceCredits: number;

  @Column({ type: 'int', default: 0 })
  priceCash: number;

  @Column({ type: 'boolean', default: false })
  isActive: boolean;

  /** Chance % por raridade (soma com creditChance deve ser 100). */
  @Column({ type: 'jsonb' })
  chances: RarityChances;

  /**
   * Chance % de o drop ser créditos em vez de carta.
   * Coluna criada em runtime se ausente (ver LootBoxesService.ensureSchema).
   */
  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  creditChance: number;

  @Column({ type: 'jsonb' })
  pool: LootPoolEntry[];

  /** Pool de valores de crédito quando creditChance > 0. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  creditRewards: CreditRewardEntry[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export type PackReward =
  | {
      type: 'card';
      cardId: string;
      idCarta?: string;
      name: string;
      rarity: CardRarity;
      quantity: number;
      cardImage?: string | null;
    }
  | { type: 'credits'; amount: number };

@Entity('loot_box_openings')
export class LootBoxOpening {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  lootBoxId: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 8 })
  currency: string;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'jsonb' })
  rewards: PackReward[];

  @CreateDateColumn()
  createdAt: Date;
}
