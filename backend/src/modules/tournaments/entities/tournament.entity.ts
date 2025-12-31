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
import { TournamentParticipant } from './tournament-participant.entity';
import { TournamentMatch } from './tournament-match.entity';

export enum TournamentStatus {
  SCHEDULED = 'scheduled',        // Agendado
  REGISTRATION_OPEN = 'registration_open',  // Inscrições abertas
  REGISTRATION_CLOSED = 'registration_closed', // Inscrições fechadas
  IN_PROGRESS = 'in_progress',    // Em andamento
  FINISHED = 'finished',          // Finalizado
  CANCELLED = 'cancelled',        // Cancelado
}

export enum TournamentFormat {
  SINGLE_ELIMINATION = 'single_elimination', // Mata-mata
  DOUBLE_ELIMINATION = 'double_elimination', // Dupla eliminação
  SWISS = 'swiss',                          // Sistema Suíço
  ROUND_ROBIN = 'round_robin',              // Todos contra todos
}

@Entity('tournaments')
export class Tournament {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TournamentFormat, default: TournamentFormat.SINGLE_ELIMINATION })
  format: TournamentFormat;

  @Column({ type: 'int' })
  maxParticipants: number; // 8, 16, 32, 64, etc.

  @Column({ type: 'int', default: 0 })
  currentParticipants: number;

  @Column({ type: 'enum', enum: TournamentStatus, default: TournamentStatus.SCHEDULED })
  status: TournamentStatus;

  // Datas e Horários
  @Column({ type: 'timestamp' })
  registrationOpenAt: Date; // Quando abre inscrições

  @Column({ type: 'timestamp' })
  registrationCloseAt: Date; // Quando fecha inscrições

  @Column({ type: 'timestamp' })
  startAt: Date; // Quando o torneio inicia (sorteio automático)

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date;

  // Premiação
  @Column({ type: 'int', default: 0 })
  prizeFirst: number; // Prêmio 1º lugar (moedas)

  @Column({ type: 'int', default: 0 })
  prizeSecond: number; // Prêmio 2º lugar

  @Column({ type: 'int', default: 0 })
  prizeThird: number; // Prêmio 3º lugar

  // Criador do torneio
  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ type: 'int' })
  createdBy: number;

  // Taxa de inscrição
  @Column({ type: 'int', default: 0 })
  entryFee: number;

  // Configurações
  @Column({ type: 'int', default: 90 })
  turnDuration: number; // Duração do turno em segundos

  @Column({ type: 'int', default: 1800 })
  matchDuration: number; // Duração máxima da partida em segundos (30min)

  @Column({ default: true })
  autoStartMatches: boolean; // Iniciar partidas automaticamente

  @Column({ default: true })
  autoAdvancePhases: boolean; // Avançar fases automaticamente

  // Imagem do torneio
  @Column({ nullable: true })
  bannerImage: string;

  // Fase atual
  @Column({ type: 'int', default: 1 })
  currentRound: number;

  // Banlist (lista de IDs de cartas proibidas)
  @Column({ type: 'json', nullable: true })
  banlist: string[]; // Array de card IDs (idCarta)

  // Vencedor
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'winnerId' })
  winner: User;

  @Column({ type: 'int', nullable: true })
  winnerId: number;

  // Relações
  @OneToMany(() => TournamentParticipant, (participant) => participant.tournament)
  participants: TournamentParticipant[];

  @OneToMany(() => TournamentMatch, (match) => match.tournament)
  matches: TournamentMatch[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
