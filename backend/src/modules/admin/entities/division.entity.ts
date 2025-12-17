import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('divisions')
export class Division {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // Nome da divisão: "Bronze", "Prata", "Ouro", etc.

  @Column({ type: 'int', unique: true })
  order: number; // Ordem da divisão (1 = mais baixa, maior número = mais alta)

  @Column({ type: 'int', default: 100 })
  maxDuelistas: number; // Máximo de duelistas que podem estar nesta divisão

  @Column({ type: 'int', default: 10 })
  sobe: number; // Quantidade de duelistas que sobem para a próxima divisão

  @Column({ type: 'int', default: 10 })
  desce: number; // Quantidade de duelistas que descem para a divisão anterior

  @Column({ type: 'text', nullable: true })
  premiacao: string; // Premiação em formato JSON ou texto

  @Column({ type: 'json', nullable: true })
  premiacaoJson: any; // Premiação em formato JSON estruturado

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

