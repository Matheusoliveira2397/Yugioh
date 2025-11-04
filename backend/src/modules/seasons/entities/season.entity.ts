import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { SeasonRanking } from './season-ranking.entity';

@Entity('seasons')
export class Season {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  seasonNumber: number;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  prizes: {
    first: { trophy: string; coins: number; credits: number };
    second: { trophy: string; coins: number; credits: number };
    third: { trophy: string; coins: number; credits: number };
  };

  @OneToMany(() => SeasonRanking, ranking => ranking.season)
  rankings: SeasonRanking[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
