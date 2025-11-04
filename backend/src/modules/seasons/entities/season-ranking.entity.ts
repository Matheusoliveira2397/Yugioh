import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Season } from './season.entity';

export enum Division {
  BRONZE = 'Bronze',
  SILVER = 'Silver',
  GOLD = 'Gold',
  PLATINUM = 'Platinum',
  DIAMOND = 'Diamond',
  MASTER = 'Master',
  LEGENDARY = 'Legendary'
}

@Entity('season_rankings')
@Index(['season', 'user'], { unique: true })
@Index(['season', 'seasonScore'], { unique: false })
export class SeasonRanking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Season, season => season.rankings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seasonId' })
  season: Season;

  @Column()
  seasonId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'int', default: 0 })
  seasonScore: number;

  @Column({ type: 'int', default: 0 })
  wins: number;

  @Column({ type: 'int', default: 0 })
  losses: number;

  @Column({ type: 'int', default: 0 })
  rank: number;

  @Column({ type: 'enum', enum: Division, default: Division.BRONZE })
  division: Division;

  @Column({ type: 'int', default: 0 })
  divisionPoints: number;

  @Column({ nullable: true })
  trophy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
