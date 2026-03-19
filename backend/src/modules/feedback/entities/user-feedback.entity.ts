import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type FeedbackType = 'doubt' | 'opinion' | 'bug' | 'suggestion' | 'other';

@Entity('user_feedback')
@Index(['userId', 'createdAt'])
@Index(['readAt'])
export class UserFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 32 })
  type: FeedbackType;

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  @Column({ type: 'text', nullable: true })
  replyMessage: string | null;

  @Column({ type: 'timestamp', nullable: true })
  repliedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  repliedByUserId: number | null;
}
