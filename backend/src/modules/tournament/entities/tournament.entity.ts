import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { TournamentParticipant } from './tournament-participant.entity';

@Entity('tournaments')
export class Tournament {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  maxParticipants: number;

  @Column({ default: 'upcoming' })
  status: string; // upcoming, active, finished

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ nullable: true })
  winnerId: string;

  @OneToMany(() => TournamentParticipant, (participant) => participant.tournament)
  participants: TournamentParticipant[];

  @CreateDateColumn()
  createdAt: Date;
}
