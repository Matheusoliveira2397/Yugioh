import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { News } from './news.entity';

@Entity('news_views')
@Unique(['userId', 'newsId'])
export class NewsView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'uuid' })
  newsId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => News)
  @JoinColumn({ name: 'newsId' })
  news: News;

  @CreateDateColumn()
  viewedAt: Date;
}

