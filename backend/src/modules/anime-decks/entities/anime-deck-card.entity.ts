import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AnimeDeck } from './anime-deck.entity';
import { Card } from '../../cards/entities/card.entity';

@Entity('anime_deck_cards')
export class AnimeDeckCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  animeDeckId: string;

  @Column()
  cardId: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  isExtraDeck: boolean;

  @ManyToOne(() => AnimeDeck, (animeDeck) => animeDeck.cards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'animeDeckId' })
  animeDeck: AnimeDeck;

  @ManyToOne(() => Card, { eager: true })
  @JoinColumn({ name: 'cardId' })
  card: Card;
}
