import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Duel, DuelStatus, DuelResult } from './entities/duel.entity';
import { DuelLog, DuelActionType } from './entities/duel-log.entity';
import { User } from '../users/entities/user.entity';

interface PlayerInQueue {
  userId: string;
  socketId: string;
  joinedAt: Date;
}

@Injectable()
export class DuelsService {
  private searchQueue: PlayerInQueue[] = [];
  private activeDuels: Map<string, Duel> = new Map();

  constructor(
    @InjectRepository(Duel)
    private duelsRepository: Repository<Duel>,
    @InjectRepository(DuelLog)
    private duelLogsRepository: Repository<DuelLog>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  // Adicionar jogador na fila de busca
  addToQueue(userId: string, socketId: string): void {
    const alreadyInQueue = this.searchQueue.find(p => p.userId === userId);
    if (!alreadyInQueue) {
      this.searchQueue.push({
        userId,
        socketId,
        joinedAt: new Date()
      });
    }
  }

  // Remover jogador da fila
  removeFromQueue(userId: string): void {
    this.searchQueue = this.searchQueue.filter(p => p.userId !== userId);
  }

  // Buscar oponente aleatório
  async findOpponent(userId: string): Promise<{ opponent: PlayerInQueue; duel: Duel } | null> {
    const availableOpponents = this.searchQueue.filter(p => p.userId !== userId);
    
    if (availableOpponents.length === 0) {
      return null;
    }

    // Selecionar oponente aleatório
    const randomIndex = Math.floor(Math.random() * availableOpponents.length);
    const opponent = availableOpponents[randomIndex];

    // Remover ambos da fila
    this.removeFromQueue(userId);
    this.removeFromQueue(opponent.userId);

    // Buscar dados dos usuários
    const player1 = await this.usersRepository.findOne({ where: { id: userId } });
    const player2 = await this.usersRepository.findOne({ where: { id: opponent.userId } });

    if (!player1 || !player2) {
      throw new Error('Jogadores não encontrados');
    }

    // Criar duelo
    const duel = this.duelsRepository.create({
      player1,
      player2,
      status: DuelStatus.IN_PROGRESS,
      player1LifePoints: 8000,
      player2LifePoints: 8000,
      currentTurn: Math.random() > 0.5 ? 1 : 2, // Sortear quem começa
      player1Field: this.createEmptyField(),
      player2Field: this.createEmptyField()
    } as any);

    const savedDuel = await this.duelsRepository.save(duel) as any;
    this.activeDuels.set(savedDuel.id, savedDuel);

    // Criar log de início do duelo
    await this.createLog(savedDuel.id, player1.id, DuelActionType.DUEL_START, 
      `Duelo iniciado entre ${player1.username} e ${player2.username}`);

    return { opponent, duel: savedDuel };
  }

  // Criar campo vazio
  private createEmptyField() {
    return {
      monsterZones: [null, null, null, null, null],
      spellTrapZones: [null, null, null, null, null],
      fieldZone: null,
      deck: [],
      hand: [],
      graveyard: [],
      extraDeck: []
    };
  }

  // Criar log de ação
  async createLog(duelId: string, userId: string, actionType: DuelActionType, message: string, metadata?: any): Promise<DuelLog> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('Usuário não encontrado');
    }
    const log = this.duelLogsRepository.create({
      duelId,
      user,
      actionType,
      message,
      metadata
    } as any);
    return this.duelLogsRepository.save(log) as any;
  }

  // Buscar duelo por ID
  async findDuelById(duelId: string): Promise<Duel | null> {
    return this.duelsRepository
      .createQueryBuilder('duel')
      .leftJoinAndSelect('duel.player1', 'player1')
      .leftJoinAndSelect('duel.player2', 'player2')
      .where('duel.id = :duelId', { duelId })
      .getOne();
  }

  // Buscar logs do duelo
  async getDuelLogs(duelId: string): Promise<DuelLog[]> {
    return this.duelLogsRepository.find({
      where: { duelId },
      order: { createdAt: 'ASC' }
    });
  }

  // Atualizar pontos de vida
  async updateLifePoints(duelId: string, player: 1 | 2, newLifePoints: number): Promise<Duel | null> {
    const duel = await this.findDuelById(duelId);
    if (!duel) return null;
    
    if (player === 1) {
      duel.player1LifePoints = newLifePoints;
    } else {
      duel.player2LifePoints = newLifePoints;
    }
    return this.duelsRepository.save(duel);
  }

  // Finalizar duelo
  async finishDuel(duelId: string, result: DuelResult, winnerId?: string): Promise<Duel | null> {
    const duel = await this.findDuelById(duelId);
    if (!duel) return null;
    
    duel.status = DuelStatus.FINISHED;
    duel.result = result;
    duel.winnerId = winnerId || null;
    duel.finishedAt = new Date();
    
    this.activeDuels.delete(duelId);
    
    return this.duelsRepository.save(duel);
  }

  // Obter fila atual
  getQueueSize(): number {
    return this.searchQueue.length;
  }

  // Mudar turno
  async changeTurn(duelId: string, newTurn: number): Promise<Duel | null> {
    const duel = await this.findDuelById(duelId);
    if (!duel) return null;
    
    duel.currentTurn = newTurn;
    return this.duelsRepository.save(duel);
  }
}
