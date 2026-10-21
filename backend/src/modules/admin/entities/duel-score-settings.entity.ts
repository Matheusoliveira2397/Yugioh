import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Configuração única (uma linha) do score por vitória por tipo de duelo.
 * O vencedor do duelo ganha esse score (total_score, season, clã conforme regras).
 */
@Entity('duel_score_settings')
export class DuelScoreSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1.7 })
  scoreRandom: number;

  /** Score (total_score) por vitória na partida ranqueada — só sobe */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 2.0 })
  scoreRanked: number;

  /** Pontos ranqueados ganhos na vitória (ranked_points) */
  @Column({ type: 'int', default: 25 })
  rankedPointsOnWin: number;

  /** Pontos ranqueados perdidos na derrota (ranked_points) */
  @Column({ type: 'int', default: 20 })
  rankedPointsOnLoss: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1.0 })
  scoreChat: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 10.0 })
  scoreTournament: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 2.0 })
  scoreArena: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1.0 })
  scoreOther: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
