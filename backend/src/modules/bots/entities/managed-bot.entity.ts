import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum BotDifficulty { EASY = 'EASY', NORMAL = 'NORMAL', HARD = 'HARD', EXPERT = 'EXPERT' }
export enum BotParticipation { NONE = 'NONE', RANDOM = 'RANDOM' }

@Entity('managed_bots')
export class ManagedBot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'int', unique: true }) userId: number;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'varchar', length: 16, default: BotDifficulty.EXPERT }) difficulty: BotDifficulty;
  @Column({ type: 'int', default: 1 }) level: number;
  @Column({ name: 'source_deck_id', type: 'uuid' }) sourceDeckId: string;
  @Column({ name: 'bot_deck_id', type: 'uuid' }) botDeckId: string;
  @Column({ type: 'varchar', length: 16, default: BotParticipation.NONE }) participation: BotParticipation;
  @Column({ name: 'interval_minutes', type: 'int', default: 30 }) intervalMinutes: number;
  @Column({ type: 'boolean', default: false }) enabled: boolean;
  @Column({ name: 'last_queued_at', type: 'timestamp', nullable: true }) lastQueuedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
