import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum DuelStatus {
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED'
}

export enum DuelResult {
  PLAYER1_WIN = 'PLAYER1_WIN',
  PLAYER2_WIN = 'PLAYER2_WIN',
  DRAW = 'DRAW',
  CANCELLED = 'CANCELLED'
}

export enum TurnPhase {
  DRAW = 'DRAW',           // Fase de compras
  STANDBY = 'STANDBY',     // Fase de apoio
  MAIN1 = 'MAIN1',         // Fase principal 1
  BATTLE = 'BATTLE',       // Fase de batalha
  MAIN2 = 'MAIN2',         // Fase principal 2
  END = 'END'              // Fase final
}

export enum DuelOrigin {
  RANDOM = 'RANDOM',
  CHAT = 'CHAT',
  TOURNAMENT = 'TOURNAMENT',
  ARENA = 'ARENA',
  OTHER = 'OTHER'
}

@Entity('duels')
export class Duel {
  @PrimaryGeneratedColumn('uuid')
  id: string; // ID UUID gerado pelo banco

  @Column({ name: 'player1_id', type: 'int' })
  player1Id: number;

  @ManyToOne(() => User, { eager: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'player1_id' })
  player1: User;

  @Column({ name: 'player2_id', type: 'int' })
  player2Id: number;

  @ManyToOne(() => User, { eager: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'player2_id' })
  player2: User;

  @Column({ name: 'player1_nickname', type: 'varchar', length: 255, nullable: true })
  player1Nickname: string | null;

  @Column({ name: 'player2_nickname', type: 'varchar', length: 255, nullable: true })
  player2Nickname: string | null;

  @Column({ type: 'enum', enum: DuelStatus, default: DuelStatus.WAITING })
  status: DuelStatus;

  @Column({ name: 'player1_life_points', type: 'int', default: 8000 })
  player1LifePoints: number;

  @Column({ name: 'player2_life_points', type: 'int', default: 8000 })
  player2LifePoints: number;

  @Column({ type: 'enum', enum: DuelResult, nullable: true })
  result: DuelResult;

  @Column({ name: 'winner_id', type: 'int', nullable: true })
  winnerId: number | null;

  @Column({ name: 'player1_field', type: 'jsonb', nullable: true })
  player1Field: any; // Estado do campo do jogador 1

  @Column({ name: 'player2_field', type: 'jsonb', nullable: true })
  player2Field: any; // Estado do campo do jogador 2

  @Column({ name: 'current_turn', type: 'int', default: 1 })
  currentTurn: number; // 1 para player1, 2 para player2

  @Column({ name: 'turn_counter', type: 'int', default: 1 })
  turnCounter: number; // Contador global de turnos (incrementa a cada turno, não alterna)

  @Column({ name: 'current_phase', type: 'enum', enum: TurnPhase, default: TurnPhase.DRAW })
  currentPhase: TurnPhase; // Fase atual do turno

  @Column({ name: 'duel_time', type: 'int', default: 0 })
  duelTime: number; // Tempo total do duelo em segundos

  @Column({ name: 'turn_time', type: 'int', default: 90 })
  turnTime: number; // Tempo do turno em segundos (igual para ambos os jogadores)

  @Column({ name: 'turn_started_at', type: 'timestamp', nullable: true })
  turnStartedAt: Date | null; // Timestamp de quando o turno atual começou

  @Column({ name: 'origin', type: 'enum', enum: DuelOrigin, default: DuelOrigin.OTHER })
  origin: DuelOrigin; // Origem do duelo (RANDOM, CHAT, TOURNAMENT, ARENA, etc.)

  @Index(['player1Id', 'status'])
  @Index(['player2Id', 'status'])
  @Index(['status', 'updatedAt'])
  @Index(['status']) // Índice adicional apenas para status (útil para queries rápidas)
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date;

  @Column({ name: 'pending_choice', type: 'jsonb', nullable: true })
  pendingChoice: {
    type: 'CONFISCATION' | 'GRACEFUL_CHARITY' | 'FORCEFUL_SENTRY';
    userId: number;
    turnWhenStarted: number;
    phaseWhenStarted: string;
    data: any; // Dados específicos do tipo de escolha (ex: opponentHand, playerHand, graveyards)
  } | null;
}
