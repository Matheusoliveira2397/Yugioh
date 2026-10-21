import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum DuelHistoryResult {
  WIN = 'WIN',
  LOSS = 'LOSS',
  DRAW = 'DRAW',
  CANCELLED = 'CANCELLED',
}

export enum DuelHistoryOrigin {
  RANDOM = 'RANDOM',
  RANDOM_ANIME = 'RANDOM_ANIME',
  RANKED = 'RANKED',
  ARENA = 'ARENA',
  TOURNAMENT = 'TOURNAMENT',
  CHAT = 'CHAT',
  OTHER = 'OTHER',
}

@Entity('duel_history')
@Index(['playerId', 'finishedAt'])
@Index(['opponentId', 'finishedAt'])
export class DuelHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  @Index()
  playerId: number;

  @Column({ type: 'int' })
  @Index()
  opponentId: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  opponentNickname: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  opponentUsername: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  opponentClanTag: string | null;

  @Column({ type: 'enum', enum: DuelHistoryResult })
  result: DuelHistoryResult;

  @Column({ type: 'enum', enum: DuelHistoryOrigin })
  origin: DuelHistoryOrigin;

  @Column({ type: 'int', default: 0 })
  playerLifePoints: number;

  @Column({ type: 'int', default: 0 })
  opponentLifePoints: number;

  @Column({ type: 'decimal', precision: 10, scale: 1, default: 0 })
  scoreEarned: number; // Score ganho neste duelo (1.7 para random, etc)

  @Column({ type: 'int', default: 0 })
  turns: number; // Número de turnos do duelo

  @Column({ type: 'int', default: 0 })
  duration: number; // Duração em segundos

  @Column({ type: 'varchar', length: 255, nullable: true })
  originalDuelId: string | null; // ID do duelo original (se ainda existir)

  @CreateDateColumn()
  finishedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'playerId' })
  player: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'opponentId' })
  opponent: User;
}
