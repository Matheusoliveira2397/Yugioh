import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
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

@Entity('duels')
export class Duel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'player1_id' })
  player1: User;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'player2_id' })
  player2: User;

  @Column({ type: 'enum', enum: DuelStatus, default: DuelStatus.WAITING })
  status: DuelStatus;

  @Column({ type: 'int', default: 8000 })
  player1LifePoints: number;

  @Column({ type: 'int', default: 8000 })
  player2LifePoints: number;

  @Column({ type: 'enum', enum: DuelResult, nullable: true })
  result: DuelResult;

  @Column({ type: 'uuid', nullable: true })
  winnerId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  player1Field: any; // Estado do campo do jogador 1

  @Column({ type: 'jsonb', nullable: true })
  player2Field: any; // Estado do campo do jogador 2

  @Column({ type: 'int', default: 1 })
  currentTurn: number; // 1 para player1, 2 para player2

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date;
}
