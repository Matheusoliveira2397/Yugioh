import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Classe do ranking de torneios: Obelisco (topo), Rá, Slifer.
 * Ordem: 1 = mais alta (Obelisco), 2 = Rá, 3 = Slifer.
 * Obelisco e Rá têm maxPlayers; Slifer pode ter null (ilimitado).
 */
@Entity('tournament_classes')
export class TournamentClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /** Pontos mínimos para estar na classe */
  @Column({ type: 'int' })
  minPoints: number;

  /** Limite de jogadores (null = sem limite). Obelisco e Rá têm limite. */
  @Column({ type: 'int', nullable: true })
  maxPlayers: number | null;

  /** Ordem: 1 = Obelisco (topo), 2 = Rá, 3 = Slifer */
  @Column({ type: 'int', default: 1 })
  order: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
