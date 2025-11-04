import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Card } from '../../cards/entities/card.entity';

export enum ShopItemCurrency {
  COINS = 'coins',
  CREDITS = 'credits',
  GEMS = 'gems',
  CASH = 'cash',
}

@Entity('shop_items')
export class ShopItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Card, { eager: true })
  @JoinColumn({ name: 'card_id' })
  card: Card;

  @Column({ type: 'enum', enum: ShopItemCurrency, default: ShopItemCurrency.COINS })
  currency: ShopItemCurrency;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int', default: 0 })
  discount: number; // Desconto em porcentagem (0-100)

  @Column({ default: true })
  isAvailable: boolean;

  @Column({ default: false })
  isFeatured: boolean; // Item em destaque

  @Column({ default: false })
  isLimited: boolean; // Edição limitada

  @Column({ type: 'int', nullable: true })
  stock: number; // null = estoque ilimitado

  @Column({ type: 'timestamp', nullable: true })
  availableUntil: Date; // Data de expiração da oferta

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
