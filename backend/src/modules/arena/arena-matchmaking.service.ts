import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Duel } from '../duels/entities/duel.entity';
import { DuelsService } from '../duels/duels.service';
import { User } from '../users/entities/user.entity';
import { ArenaService } from './arena.service';

interface ArenaPlayerInQueue {
  userId: number;
  socketId: string;
  level: number;
  levelRange: string; // Nome da faixa de nível (ex: "Nível 1-5")
  joinedAt: Date;
}

@Injectable()
export class ArenaMatchmakingService {
  private arenaQueues: Map<string, ArenaPlayerInQueue[]> = new Map(); // levelRange -> players[]
  private matchingLock: Set<number> = new Set();

  constructor(
    private duelsService: DuelsService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => ArenaService))
    private arenaService: ArenaService,
  ) {}

  /**
   * Determina a faixa de nível do jogador baseado na arena atual
   */
  private getLevelRangeForLevel(level: number, levelRanges: Array<{ min: number; max: number; name: string }>): string {
    for (const range of levelRanges) {
      if (level >= range.min && level <= range.max) {
        return range.name;
      }
    }
    // Se não encontrar, retornar a última faixa (geralmente a mais alta)
    return levelRanges.length > 0 ? levelRanges[levelRanges.length - 1].name : 'Nível 1+';
  }

  /**
   * Adicionar jogador na fila da arena. O duelo será encontrado apenas com jogadores
   * da mesma faixa de nível configurada na arena (ex.: Nível 1, Nível 2-3, etc.).
   */
  async addToArenaQueue(userId: number, socketId: string, level: number): Promise<string | null> {
    const currentArena = await this.arenaService.getCurrentArena();
    if (!currentArena) {
      console.warn(`[addToArenaQueue] Nenhuma arena ativa no momento`);
      return null;
    }

    // Usar faixas de nível da arena (Criar Arena); fallback para faixas globais se vazias
    let levelRanges = (currentArena.config?.levelRanges || []) as Array<{ min: number; max: number; name: string }>;
    if (levelRanges.length === 0) {
      levelRanges = await this.arenaService.getLevelRanges();
    }
    if (levelRanges.length === 0) {
      console.warn(`[addToArenaQueue] Arena sem faixas de nível configuradas`);
      return null;
    }

    const levelRange = this.getLevelRangeForLevel(level, levelRanges);
    if (!this.arenaQueues.has(levelRange)) {
      this.arenaQueues.set(levelRange, []);
    }

    const queue = this.arenaQueues.get(levelRange)!;
    const alreadyInQueue = queue.find(p => p.userId === userId);
    if (!alreadyInQueue) {
      queue.push({
        userId,
        socketId,
        level,
        levelRange,
        joinedAt: new Date(),
      });
      console.log(`[addToArenaQueue] Jogador ${userId} (Nível ${level}) na faixa "${levelRange}" – duelo só com mesma faixa`);
    }
    return levelRange;
  }

  // Remover jogador da fila da arena
  removeFromArenaQueue(userId: number): void {
    for (const queue of this.arenaQueues.values()) {
      const index = queue.findIndex(p => p.userId === userId);
      if (index !== -1) {
        queue.splice(index, 1);
        break;
      }
    }
  }

  // Verificar se está na fila
  isInArenaQueue(userId: number): boolean {
    for (const queue of this.arenaQueues.values()) {
      if (queue.some(p => p.userId === userId)) {
        return true;
      }
    }
    return false;
  }

  // Buscar oponente na arena (mesma divisão)
  async findArenaOpponent(userId: number): Promise<{ opponent: ArenaPlayerInQueue; duel: Duel | null; player1Id: number; player2Id: number } | null> {
    if (this.matchingLock.has(userId)) {
      console.log(`[findArenaOpponent] Usuário ${userId} já está em processo de matching. Ignorando.`);
      return null;
    }

    // Encontrar o jogador na fila
    let currentPlayer: ArenaPlayerInQueue | null = null;
    let playerQueue: ArenaPlayerInQueue[] | null = null;

    for (const queue of this.arenaQueues.values()) {
      const player = queue.find(p => p.userId === userId);
      if (player) {
        currentPlayer = player;
        playerQueue = queue;
        break;
      }
    }

    if (!currentPlayer || !playerQueue) {
      console.log(`[findArenaOpponent] Jogador ${userId} não está na fila da arena`);
      return null;
    }

    // Filtrar oponentes da mesma faixa de nível
    // IMPORTANTE: Só encontrar oponentes que também estão procurando pela arena (mesma faixa de nível)
    const availableOpponents = playerQueue.filter(p => {
      return p.userId !== userId && 
             p.levelRange === currentPlayer!.levelRange && 
             !this.matchingLock.has(p.userId);
    });

    if (availableOpponents.length === 0) {
      console.log(`[findArenaOpponent] Nenhum oponente disponível na faixa ${currentPlayer.levelRange}`);
      return null;
    }

    // Selecionar oponente aleatório
    const randomIndex = Math.floor(Math.random() * availableOpponents.length);
    const opponent = availableOpponents[randomIndex];

    // Adicionar lock
    this.matchingLock.add(userId);
    this.matchingLock.add(opponent.userId);

    // Verificar se ambos ainda estão na fila
    const player1StillInQueue = this.isInArenaQueue(userId);
    const player2StillInQueue = this.isInArenaQueue(opponent.userId);

    if (!player1StillInQueue || !player2StillInQueue) {
      this.matchingLock.delete(userId);
      this.matchingLock.delete(opponent.userId);
      return null;
    }

    // Remover ambos da fila
    this.removeFromArenaQueue(userId);
    this.removeFromArenaQueue(opponent.userId);

    // NOVA ABORDAGEM: NÃO criar duelo automaticamente
    // Apenas retornar o match encontrado
    // O duelo será criado quando o jogador entrar na arena
    // Isso evita bloquear o Event Loop
    this.matchingLock.delete(userId);
    this.matchingLock.delete(opponent.userId);

    return { 
      opponent, 
      duel: null, 
      player1Id: userId, 
      player2Id: opponent.userId 
    }; // Retornar null para duelo (será criado depois)
  }

  // Obter tamanho da fila de uma faixa de nível
  getQueueSize(levelRange?: string): number {
    if (levelRange) {
      return this.arenaQueues.get(levelRange)?.length || 0;
    }
    // Tamanho total de todas as faixas
    let total = 0;
    for (const queue of this.arenaQueues.values()) {
      total += queue.length;
    }
    return total;
  }

  // Obter todas as faixas de nível (para o processador global)
  getLevelRanges(): string[] {
    return Array.from(this.arenaQueues.keys());
  }

  // Obter fila de uma faixa específica (para o processador global)
  getQueueForLevelRange(levelRange: string): ArenaPlayerInQueue[] {
    return [...(this.arenaQueues.get(levelRange) || [])]; // Retornar cópia
  }

  // Método legado para compatibilidade (retorna faixas como divisões)
  getDivisions(): string[] {
    return this.getLevelRanges();
  }

  getQueueForDivision(division: string): ArenaPlayerInQueue[] {
    return this.getQueueForLevelRange(division);
  }
}


