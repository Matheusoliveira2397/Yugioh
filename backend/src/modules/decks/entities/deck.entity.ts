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
import { Card } from '../../cards/entities/card.entity';

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

  /** ID da carta usada como imagem/capa do deck (opcional) */
  @Column({ type: 'uuid', nullable: true })
  coverCardId: string | null;

  @ManyToOne(() => Card, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'coverCardId' })
  coverCard: Card | null;

  @OneToMany(() => DeckCard, (deckCard) => deckCard.deck)
  cards: DeckCard[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
