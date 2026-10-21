import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Card } from '../../cards/entities/card.entity';

@Entity('user_cards')
@Index('IDX_user_cards_user_id', ['userId'])
@Index('IDX_user_cards_user_card', ['userId', 'cardId'])
export class UserCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column()
  cardId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  // Sem eager: inventário já faz relations: ['card'] só quando precisa
  @ManyToOne(() => Card, { eager: false })
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
