import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PromoCode } from './promo-code.entity';

@Entity('promo_code_redemptions')
@Index(['promoCodeId', 'userId'])
export class PromoCodeRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  promoCodeId: string;

  @ManyToOne(() => PromoCode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'promoCodeId' })
  promoCode: PromoCode;

  @Column({ type: 'int' })
  userId: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
