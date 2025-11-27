import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DuelsService } from './duels.service';
import { Server } from 'socket.io';
import { DuelOrigin } from './entities/duel.entity';

interface PlayerInQueue {
  userId: number;
  socketId: string;
  joinedAt: Date;
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private queue: PlayerInQueue[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly PROCESSING_INTERVAL_MS = 3000; // 3 segundos
  private server: Server | null = null;
  private isProcessing = false;
  private lastQueueLog: number = 0;

  constructor(private duelsService: DuelsService) {}

  onModuleInit() {
    this.start();
  }

  onModuleDestroy() {
    this.stop();
  }

  setServer(server: Server) {
    this.server = server;
  }

  private start() {
    if (this.processingInterval) {
      console.log(`⚠️ [Matchmaking] Intervalo já está rodando, ignorando start()`);
      return;
    }

    console.log(`▶️ [Matchmaking] Iniciando matchmaking (intervalo: ${this.PROCESSING_INTERVAL_MS}ms)`);

    this.processingInterval = setInterval(() => {
      // CRÍTICO: Verificar duelos ativos de forma não bloqueante
      // Usar setImmediate para dar prioridade a HTTP antes de verificar
      setImmediate(() => {
        const activeDuels = this.duelsService.getActiveDuelsCount();
        console.log(`🔍 [Matchmaking] Verificando: ${activeDuels} duelos ativos em memória, ${this.queue.length} na fila, processando: ${this.isProcessing}`);
        
        // NÃO pausar o matchmaking baseado em duelos em memória
        // Duelos antigos no banco não devem impedir novos matches
        // O matchmaking deve continuar funcionando mesmo com duelos ativos
        // Apenas pausar se houver muitos duelos simultâneos (mais de 10)
        if (activeDuels > 10) {
          console.log(`⏸️ [Matchmaking] Muitos duelos ativos (${activeDuels}), pausando temporariamente...`);
          // Não pausar completamente, apenas reduzir frequência
          return;
        }
        
        // Yield ao Event Loop novamente (prioriza HTTP)
        setImmediate(() => {
          if (!this.isProcessing && this.queue.length >= 2) {
            console.log(`🚀 [Matchmaking] Condições atendidas! Processando fila...`);
            this.processQueue();
          } else {
            if (this.isProcessing) {
              console.log(`⏸️ [Matchmaking] Já está processando, aguardando...`);
            } else if (this.queue.length > 0 && this.queue.length < 2) {
              // Log apenas a cada 5 segundos para não poluir
              const now = Date.now();
              if (!this.lastQueueLog || now - this.lastQueueLog > 5000) {
                console.log(`⏳ [Matchmaking] Fila: ${this.queue.length} jogador(es) - aguardando mais um...`);
                this.lastQueueLog = now;
              }
            } else if (this.queue.length === 0) {
              // Log apenas a cada 10 segundos quando a fila está vazia
              const now = Date.now();
              if (!this.lastQueueLog || now - this.lastQueueLog > 10000) {
                console.log(`⏳ [Matchmaking] Fila vazia, aguardando jogadores...`);
                this.lastQueueLog = now;
              }
            }
          }
        });
      });
    }, this.PROCESSING_INTERVAL_MS);
  }

  private stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  addToQueue(userId: number, socketId: string): void {
    const alreadyInQueue = this.queue.find(p => p.userId === userId);
    if (!alreadyInQueue) {
      this.queue.push({ userId, socketId, joinedAt: new Date() });
      console.log(`🔍 [Matchmaking] Usuário ${userId} adicionado à fila. Total na fila: ${this.queue.length}`);
    } else {
      console.log(`⚠️ [Matchmaking] Usuário ${userId} já está na fila`);
    }
  }

  removeFromQueue(userId: number): void {
    this.queue = this.queue.filter(p => p.userId !== userId);
  }

  private async processQueue() {
    if (this.isProcessing) {
      console.log(`⏸️ [Matchmaking] Já está processando, ignorando...`);
      return;
    }
    
    if (this.queue.length < 2) {
      console.log(`⏳ [Matchmaking] Fila tem apenas ${this.queue.length} jogador(es), aguardando mais...`);
      return;
    }
    
    console.log(`🚀 [Matchmaking] Processando fila com ${this.queue.length} jogadores...`);
    this.isProcessing = true;
    
    // Yield ao Event Loop ANTES de processar (prioriza HTTP)
    await new Promise(resolve => setImmediate(resolve));

    try {
      const player1 = this.queue[0];
      const player2 = this.queue[1];

      if (!player1 || !player2) {
        console.error(`❌ [Matchmaking] Player1 ou Player2 é null!`);
        this.isProcessing = false;
        return;
      }

      console.log(`✅ [Matchmaking] Match encontrado! Player1: ${player1.userId}, Player2: ${player2.userId}`);
      
      // Remover da fila
      this.removeFromQueue(player1.userId);
      this.removeFromQueue(player2.userId);
      console.log(`🗑️ [Matchmaking] Jogadores removidos da fila. Fila restante: ${this.queue.length}`);

      // Criar duelo em background (não bloqueia)
      (async () => {
        try {
          console.log(`🎮 [Matchmaking] Criando duelo para P1=${player1.userId} vs P2=${player2.userId}...`);
          const duel = await this.duelsService.createDuel(player1.userId, player2.userId, DuelOrigin.RANDOM);
          
          if (duel && duel.id) {
            const duelIdStr = typeof duel.id === 'string' ? duel.id : String(duel.id);
            
            // Verificar se o duelo foi realmente salvo no banco
            const isInDatabase = await this.duelsService.verifyDuelInDatabase(duelIdStr);
            
            if (!isInDatabase) {
              console.error(`❌ [Matchmaking] Duelo ${duelIdStr} não encontrado no banco!`);
              await new Promise(resolve => setTimeout(resolve, 500));
              const retryCheck = await this.duelsService.verifyDuelInDatabase(duelIdStr);
              
              if (!retryCheck) {
                if (this.server) {
                  this.server.to(`user_${player1.userId}`).emit('duelError', { message: 'Erro ao salvar duelo no banco' });
                  this.server.to(`user_${player2.userId}`).emit('duelError', { message: 'Erro ao salvar duelo no banco' });
                }
                this.isProcessing = false;
                return;
              }
            }
            
            // Notificar ambos os jogadores
            const matchData1 = {
              duelId: duelIdStr,
              player1Id: player1.userId,
              player2Id: player2.userId,
              opponent: { id: player2.userId },
            };
            
            const matchData2 = {
              duelId: duelIdStr,
              player1Id: player1.userId,
              player2Id: player2.userId,
              opponent: { id: player1.userId },
            };
            
            if (this.server) {
              this.server.to(`user_${player1.userId}`).emit('duelFound', matchData1);
              this.server.to(`user_${player2.userId}`).emit('duelFound', matchData2);
              console.log(`✅ [Matchmaking] Duelo ${duelIdStr} criado e notificado!`);
            }
          } else {
            console.error(`❌ [Matchmaking] Duelo retornou null ou sem ID`);
            if (this.server) {
              this.server.to(`user_${player1.userId}`).emit('duelError', { message: 'Erro ao criar duelo' });
              this.server.to(`user_${player2.userId}`).emit('duelError', { message: 'Erro ao criar duelo' });
            }
          }
        } catch (error) {
          console.error('❌ [Matchmaking] Erro ao criar duelo:', error instanceof Error ? error.message : String(error));
          if (this.server) {
            this.server.to(`user_${player1.userId}`).emit('duelError', { message: 'Erro ao criar duelo' });
            this.server.to(`user_${player2.userId}`).emit('duelError', { message: 'Erro ao criar duelo' });
          }
        } finally {
          this.isProcessing = false;
        }
      })();
    } catch (error) {
      console.error('❌ [Matchmaking] Erro:', error);
      this.isProcessing = false;
    }
  }
}
