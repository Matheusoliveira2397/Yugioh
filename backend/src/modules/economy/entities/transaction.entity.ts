import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum TransactionType {
  EARN = 'earn',
  SPEND = 'spend',
  TRANSFER = 'transfer',
  REWARD = 'reward',
  PURCHASE = 'purchase'
}

export enum CurrencyType {
  COINS = 'coins',
  CREDITS = 'credits',
  CASH = 'cash'
}

@Entity('transactions')
@Index(['user', 'createdAt'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: CurrencyType })
  currencyType: CurrencyType;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}
