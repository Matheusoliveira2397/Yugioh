import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tournament } from './tournament.entity';
import { User } from '../../users/entities/user.entity';

export enum ParticipantStatus {
  REGISTERED = 'registered',   // Inscrito
  ACTIVE = 'active',           // Ativo no torneio
  ELIMINATED = 'eliminated',   // Eliminado
  WITHDRAWN = 'withdrawn',     // Desistiu
}

@Entity('tournament_participants')
export class TournamentParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tournament, (tournament) => tournament.participants)
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'enum', enum: ParticipantStatus, default: ParticipantStatus.REGISTERED })
  status: ParticipantStatus;

  @Column({ type: 'int', default: 0 })
  wins: number;

  @Column({ type: 'int', default: 0 })
  losses: number;

  @Column({ type: 'int', default: 0 })
  draws: number;

  @Column({ type: 'int', nullable: true })
  seed: number; // Posição no sorteio (1, 2, 3, etc.)

  @Column({ type: 'int', nullable: true })
  finalPosition: number; // Posição final (1º, 2º, 3º, etc.)

  @CreateDateColumn()
  registeredAt: Date;
}
