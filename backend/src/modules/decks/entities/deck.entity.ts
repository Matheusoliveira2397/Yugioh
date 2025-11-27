import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DeckCard } from './deck-card.entity';

@Entity('decks')
export class Deck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => User, (user) => user.decks)
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => DeckCard, (deckCard) => deckCard.deck)
  cards: DeckCard[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
