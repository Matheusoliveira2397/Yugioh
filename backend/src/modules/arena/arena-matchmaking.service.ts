import { Injectable } from '@nestjs/common';
import { Duel } from '../duels/entities/duel.entity';
import { DuelsService } from '../duels/duels.service';

interface ArenaPlayerInQueue {
  userId: number;
  socketId: string;
  level: number;
  division: string;
  joinedAt: Date;
}

@Injectable()
export class ArenaMatchmakingService {
  private arenaQueues: Map<string, ArenaPlayerInQueue[]> = new Map(); // division -> players[]
  private matchingLock: Set<number> = new Set();

  constructor(
    private duelsService: DuelsService,
  ) {}

  // Determinar divisão baseada no nível
  getLevelDivision(level: number): string {
    if (level <= 1) return 'Nível 1';
    if (level <= 3) return 'Nível 2-3';
    if (level <= 5) return 'Nível 4-5';
    if (level <= 10) return 'Nível 6-10';
    return 'Nível 11+';
  }

  // Adicionar jogador na fila da arena
  addToArenaQueue(userId: number, socketId: string, level: number): void {
    const division = this.getLevelDivision(level);
    
    if (!this.arenaQueues.has(division)) {
      this.arenaQueues.set(division, []);
    }

    const queue = this.arenaQueues.get(division)!;
    const alreadyInQueue = queue.find(p => p.userId === userId);
    
    if (!alreadyInQueue) {
      queue.push({
        userId,
        socketId,
        level,
        division,
        joinedAt: new Date()
      });
    }
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

    // Filtrar oponentes da mesma divisão
    // IMPORTANTE: Só encontrar oponentes que também estão procurando pela arena (mesma divisão)
    const availableOpponents = playerQueue.filter(p => {
      return p.userId !== userId && 
             p.division === currentPlayer!.division && 
             !this.matchingLock.has(p.userId);
    });

    if (availableOpponents.length === 0) {
      console.log(`[findArenaOpponent] Nenhum oponente disponível na divisão ${currentPlayer.division}`);
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

  // Obter tamanho da fila de uma divisão
  getQueueSize(division?: string): number {
    if (division) {
      return this.arenaQueues.get(division)?.length || 0;
    }
    // Tamanho total de todas as divisões
    let total = 0;
    for (const queue of this.arenaQueues.values()) {
      total += queue.length;
    }
    return total;
  }

  // Obter todas as divisões (para o processador global)
  getDivisions(): string[] {
    return Array.from(this.arenaQueues.keys());
  }

  // Obter fila de uma divisão específica (para o processador global)
  getQueueForDivision(division: string): ArenaPlayerInQueue[] {
    return [...(this.arenaQueues.get(division) || [])]; // Retornar cópia
  }
}

