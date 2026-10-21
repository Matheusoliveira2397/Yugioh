import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PromoCodeRewardType {
  CREDITS = 'credits',
  CASH = 'cash',
  CARD = 'card',
}

@Entity('promo_codes')
export class PromoCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  label: string | null;

  @Column({ default: true })
  isActive: boolean;

  /** null = usos ilimitados */
  @Column({ type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ type: 'int', default: 0 })
  usesCount: number;

  @Column({ type: 'int', default: 1 })
  maxUsesPerUser: number;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', length: 20, default: PromoCodeRewardType.CREDITS })
  rewardType: PromoCodeRewardType;

  @Column({ type: 'int', default: 0 })
  rewardAmount: number;

  @Column({ type: 'uuid', nullable: true })
  rewardCardId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
