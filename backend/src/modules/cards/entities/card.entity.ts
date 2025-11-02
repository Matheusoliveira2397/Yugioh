import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  type: string; // Monster, Spell, Trap

  @Column({ nullable: true })
  attribute: string; // DARK, LIGHT, WATER, FIRE, EARTH, WIND

  @Column({ nullable: true })
  level: number;

  @Column({ nullable: true })
  attack: number;

  @Column({ nullable: true })
  defense: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ default: 'common' })
  rarity: string; // common, rare, super, ultra
}
