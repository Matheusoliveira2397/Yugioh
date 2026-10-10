import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CardRarity } from '../cards/entities/card.entity';

export interface LootPoolEntry { cardId: string; weight: number; quantity: number }
export type RarityChances = Record<CardRarity, number>;
@Entity('loot_boxes')
export class LootBox {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'int', default: 1 }) cardsPerOpening: number;
  @Column({ type: 'int', default: 0 }) priceCredits: number;
  @Column({ type: 'int', default: 0 }) priceCash: number;
  @Column({ type: 'boolean', default: false }) isActive: boolean;
  @Column({ type: 'jsonb' }) chances: RarityChances;
  @Column({ type: 'jsonb' }) pool: LootPoolEntry[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
@Entity('loot_box_openings')
export class LootBoxOpening {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) lootBoxId: string;
  @Column({ type: 'int' }) userId: number;
  @Column({ type: 'varchar', length: 8 }) currency: string;
  @Column({ type: 'int' }) price: number;
  @Column({ type: 'jsonb' }) rewards: Array<{cardId: string; name: string; rarity: CardRarity; quantity: number}>;
  @CreateDateColumn() createdAt: Date;
}
