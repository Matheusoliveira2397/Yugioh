import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('playmats')
export class Playmat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  image: string; // URL ou path da imagem

  @Column({ type: 'int', nullable: true })
  priceCredits: number; // Preço em créditos

  @Column({ type: 'int', nullable: true })
  priceCash: number; // Preço em cash

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isForSale: boolean;

  @Column({ type: 'int', nullable: true })
  stock: number; // null = estoque ilimitado

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}










