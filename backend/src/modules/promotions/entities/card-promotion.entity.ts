import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Card } from '../../cards/entities/card.entity';

@Entity('card_promotions')
export class CardPromotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  cardId: string;

  @ManyToOne(() => Card, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cardId' })
  card?: Card;

  /** Desconto em percentual (0-100). Ex: 20 = 20% off */
  @Column('int', { default: 0 })
  discountPercent: number;

  @Column('timestamp with time zone')
  startsAt: Date;

  @Column('timestamp with time zone')
  endsAt: Date;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
