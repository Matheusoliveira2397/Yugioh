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
import { TournamentType } from './tournament-type.entity';

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
  maxParticipants: number; // 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048 (potências de 2)

  @Column({ type: 'int', default: 0 })
  currentParticipants: number;

  @Column({ type: 'int', default: 1 })
  minLevel: number; // Nível mínimo para inscrição

  @Column({ type: 'int', nullable: true })
  maxLevel: number | null; // Nível máximo (null = sem limite, todos os níveis)

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

  // Premiação (valores numéricos = créditos; uso legado)
  @Column({ type: 'int', default: 0 })
  prizeFirst: number;

  @Column({ type: 'int', default: 0 })
  prizeSecond: number;

  @Column({ type: 'int', default: 0 })
  prizeThird: number;

  /** Premiação por lugar: 1..4 => { credit?, cash?, cardIds?, trophyTitle?, trophyIcon?, stars? } */
  @Column({ type: 'jsonb', nullable: true })
  prizeDetails: Record<number, { credit?: number; cash?: number; cardIds?: string[]; trophyTitle?: string; trophyIcon?: string; stars?: number }> | null;

  // Criador do torneio
  @ManyToOne(() => User)
  @JoinColumn({ name: 'createdBy' })
  creator: User;

  @Column({ type: 'int' })
  createdBy: number;

  // Taxa de inscrição
  @Column({ type: 'int', default: 0 })
  entryFee: number;

  /** Tipo da taxa: 'credit' = créditos, 'cash' = cash (moeda paga) */
  @Column({ type: 'varchar', length: 10, default: 'credit' })
  entryFeeType: 'credit' | 'cash';

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

  /** Tipo do torneio (opcional): usado para sequência e padrões */
  @ManyToOne(() => TournamentType, { nullable: true })
  @JoinColumn({ name: 'tournamentTypeId' })
  tournamentType: TournamentType;

  @Column({ type: 'uuid', nullable: true })
  tournamentTypeId: string | null;

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
