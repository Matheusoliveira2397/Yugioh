import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Card } from '../../cards/entities/card.entity';

@Entity('user_cards')
export class UserCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  cardId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Card, { eager: true })
  @JoinColumn({ name: 'cardId' })
  card: Card;

  @Column({ type: 'int', default: 1 })
  quantity: number; // Quantas cópias o usuário tem

  @Column({ type: 'enum', enum: ['PURCHASE', 'REWARD', 'DROP', 'GIFT'], default: 'PURCHASE' })
  acquiredBy: 'PURCHASE' | 'REWARD' | 'DROP' | 'GIFT';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
