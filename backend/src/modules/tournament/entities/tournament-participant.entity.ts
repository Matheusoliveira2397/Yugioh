import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Tournament } from './tournament.entity';
import { User } from '../../users/entities/user.entity';

@Entity('tournament_participants')
export class TournamentParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tournamentId: string;

  @Column()
  userId: string;

  @Column({ default: false })
  eliminated: boolean;

  @ManyToOne(() => Tournament, (tournament) => tournament.participants)
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  joinedAt: Date;
}
