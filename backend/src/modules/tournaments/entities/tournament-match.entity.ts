import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tournament } from './tournament.entity';
import { User } from '../../users/entities/user.entity';
import { Duel } from '../../duels/entities/duel.entity';

export enum MatchStatus {
  SCHEDULED = 'scheduled',     // Agendado
  READY = 'ready',            // Pronto para começar
  IN_PROGRESS = 'in_progress', // Em andamento
  FINISHED = 'finished',       // Finalizado
  WALKOVER = 'walkover',       // W.O. (um jogador não compareceu)
  CANCELLED = 'cancelled',     // Cancelado
}

@Entity('tournament_matches')
export class TournamentMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tournament, (tournament) => tournament.matches)
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @Column()
  tournamentId: string;

  @Column({ type: 'int' })
  round: number; // Rodada (1 = oitavas, 2 = quartas, 3 = semi, 4 = final)

  @Column({ type: 'int' })
  matchNumber: number; // Número da partida na rodada

  // Jogadores
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'player1Id' })
  player1: User;

  @Column({ nullable: true })
  player1Id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'player2Id' })
  player2: User;

  @Column({ nullable: true })
  player2Id: string;

  // Vencedor
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'winnerId' })
  winner: User;

  @Column({ nullable: true })
  winnerId: string;

  @Column({ type: 'enum', enum: MatchStatus, default: MatchStatus.SCHEDULED })
  status: MatchStatus;

  // Duelo associado
  @ManyToOne(() => Duel, { nullable: true })
  @JoinColumn({ name: 'duelId' })
  duel: Duel;

  @Column({ nullable: true })
  duelId: string;

  // Horário
  @Column({ type: 'timestamp' })
  scheduledAt: Date; // Quando a partida deve começar

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date;

  // Próxima partida (para chaves)
  @Column({ nullable: true })
  nextMatchId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
