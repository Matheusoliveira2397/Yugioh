import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DuelsService } from './duels.service';
import { Server } from 'socket.io';
import { DuelOrigin } from './entities/duel.entity';
import { DuelActionType } from './entities/duel-log.entity';
import { normalizeProfileImageForClient } from '../users/profile-image.util';

interface DuelCreationTask {
  player1Id: number;
  player2Id: number;
  socketId: string;
  origin?: DuelOrigin;
  resolve: (duel: any) => void;
  reject: (error: Error) => void;
}

@Injectable()
export class DuelQueueService implements OnModuleInit, OnModuleDestroy {
  private queue: DuelCreationTask[] = [];
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private server: Server | null = null;
  private readonly PROCESSING_DELAY_MS = 2000; // 2 segundos

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
    if (this.processingInterval) return;

    this.processingInterval = setInterval(() => {
      // Processar fila mesmo com duelos ativos (vários jogadores podem estar na Arena ao mesmo tempo).
      // Só dar um leve yield se houver muitos duelos para não sobrecarregar.
      setImmediate(() => {
        setImmediate(() => {
          if (!this.isProcessing && this.queue.length > 0) {
            this.processNext();
          }
        });
      });
    }, this.PROCESSING_DELAY_MS);
  }

  private stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  async enqueueDuelCreation(
    player1Id: number,
    player2Id: number,
    socketId: string,
    origin: DuelOrigin = DuelOrigin.OTHER,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        player1Id,
        player2Id,
        socketId,
        origin,
        resolve,
        reject,
      });
      
      if (!this.processingInterval) {
        this.start();
      }
    });
  }

  /**
   * Disparar processamento imediato da fila (ex.: arena encontrou match).
   * Evita esperar o intervalo de 2s para o primeiro duelo.
   */
  triggerProcess(): void {
    if (this.isProcessing || this.queue.length === 0) return;
    setImmediate(() => {
      if (!this.isProcessing && this.queue.length > 0) {
        this.processNext();
      }
    });
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const task = this.queue.shift();

    if (!task) {
      this.isProcessing = false;
      return;
    }

    try {
      // Yield ao Event Loop ANTES de processar (prioriza HTTP)
      await new Promise(resolve => setImmediate(resolve));

      // Criar duelo
      const duel = await this.duelsService.createDuel(task.player1Id, task.player2Id, task.origin || DuelOrigin.OTHER);

      if (duel && duel.id && this.server) {
        const duelIdStr = typeof duel.id === 'string' ? duel.id : String(duel.id);
        
        // Verificar se o duelo foi realmente salvo no banco
        const isInDatabase = await this.duelsService.verifyDuelInDatabase(duelIdStr);
        
        if (!isInDatabase) {
          console.error(`❌ [DuelQueueService] Duelo ${duelIdStr} não encontrado no banco!`);
          task.reject(new Error('Duelo não foi salvo no banco'));
          this.isProcessing = false;
          return;
        }
        
        // Buscar duelo completo do banco para garantir que temos os campos player1Field e player2Field
        const fullDuel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
        if (!fullDuel) {
          console.error(`❌ [DuelQueueService] Não foi possível buscar duelo completo do banco!`);
          task.reject(new Error('Erro ao buscar duelo completo'));
          this.isProcessing = false;
          return;
        }
        
        // Yield antes de emitir (prioriza HTTP)
        await new Promise(resolve => setImmediate(resolve));
        
          // Preparar dados simplificados - INCLUIR player1Field e player2Field
          // Usar fullDuel que foi buscado do banco para garantir que temos os campos
          const player1Field = (fullDuel as any).player1Field || {};
          const player2Field = (fullDuel as any).player2Field || {};
          
          console.log(`📤 [DuelQueueService] Preparando dados - player1Field: ${player1Field?.deck?.length || 0} cartas no deck, ${player1Field?.hand?.length || 0} na mão`);
          console.log(`📤 [DuelQueueService] Preparando dados - player2Field: ${player2Field?.deck?.length || 0} cartas no deck, ${player2Field?.hand?.length || 0} na mão`);
          
          // Validar que ambos os campos têm cartas
          if (!player1Field.deck || player1Field.deck.length === 0) {
            console.error(`❌ [DuelQueueService] ERRO: player1Field está vazio!`);
          }
          if (!player2Field.deck || player2Field.deck.length === 0) {
            console.error(`❌ [DuelQueueService] ERRO: player2Field está vazio!`);
          }
          
          const duelCreatedDataPlayer1 = {
            duelId: duelIdStr,
          player1Id: task.player1Id,
          player2Id: task.player2Id,
          opponent: {
            id: task.player2Id,
            username: (duel as any).player2?.nickname || 'Unknown',
            clanTag: (duel as any).player2?.clanTag || null,
            level: (duel as any).player2?.level || 1,
            profileImage: normalizeProfileImageForClient((duel as any).player2?.profileImage || null),
          },
          yourTurn: (duel as any).currentTurn === 1,
          lifePoints: duel.player1LifePoints || 8000,
          opponentLifePoints: duel.player2LifePoints || 8000,
          player1Field: player1Field, // SEMPRE do player1
          player2Field: player2Field, // SEMPRE do player2
        };

          const duelCreatedDataPlayer2 = {
            duelId: duelIdStr,
          player1Id: task.player1Id,
          player2Id: task.player2Id,
          opponent: {
            id: task.player1Id,
            username: (duel as any).player1?.nickname || 'Unknown',
            clanTag: (duel as any).player1?.clanTag || null,
            level: (duel as any).player1?.level || 1,
            profileImage: normalizeProfileImageForClient((duel as any).player1?.profileImage || null),
          },
          yourTurn: (duel as any).currentTurn === 2,
          lifePoints: duel.player2LifePoints || 8000,
          opponentLifePoints: duel.player1LifePoints || 8000,
          player1Field: player1Field, // SEMPRE do player1
          player2Field: player2Field, // SEMPRE do player2
        };

          // Notificar ambos os jogadores
        // Criar log de início do duelo
        try {
          const player1 = await this.duelsService['usersRepository'].findOne({ where: { id: task.player1Id }, select: ['nickname', 'clanTag'] });
          const player2 = await this.duelsService['usersRepository'].findOne({ where: { id: task.player2Id }, select: ['nickname', 'clanTag'] });
          const player1Name = player1?.clanTag ? `|${player1.clanTag}| ${player1.nickname}` : player1?.nickname || 'Jogador 1';
          const player2Name = player2?.clanTag ? `|${player2.clanTag}| ${player2.nickname}` : player2?.nickname || 'Jogador 2';
          
          // Salvar log para ambos os jogadores
          await this.duelsService.saveDuelLog(duelIdStr, task.player1Id, DuelActionType.DUEL_START, `Duelo iniciado: ${player1Name} vs ${player2Name}`);
          await this.duelsService.saveDuelLog(duelIdStr, task.player2Id, DuelActionType.DUEL_START, `Duelo iniciado: ${player1Name} vs ${player2Name}`);
        } catch (logError) {
          console.error(`❌ [DuelQueueService] Erro ao criar log de início do duelo:`, logError);
        }
        
        this.server.to(`user_${task.player1Id}`).emit('duelCreated', duelCreatedDataPlayer1);
        this.server.to(`user_${task.player2Id}`).emit('duelCreated', duelCreatedDataPlayer2);
        console.log(`✅ [DuelQueueService] Duelo ${duelIdStr} criado e notificado!`);
        task.resolve(duel);
      } else {
        console.error(`❌ [DuelQueueService] Duelo retornou null ou server não disponível. Duel: ${duel ? 'existe' : 'null'}, Server: ${this.server ? 'existe' : 'null'}`);
        task.reject(new Error('Erro ao criar duelo'));
      }
    } catch (error) {
      console.error(`❌ [DuelQueueService] Erro ao processar criação de duelo:`, error);
      console.error(`❌ [DuelQueueService] Tipo:`, error?.constructor?.name);
      console.error(`❌ [DuelQueueService] Mensagem:`, error instanceof Error ? error.message : String(error));
      console.error(`❌ [DuelQueueService] Stack:`, error instanceof Error ? error.stack : 'N/A');
      
      // Enviar mensagem de erro específica para os jogadores se o servidor estiver disponível
      if (this.server) {
        const errorMessage = error instanceof Error ? error.message : 'Erro ao criar duelo';
        this.server.to(`user_${task.player1Id}`).emit('duelError', { message: errorMessage });
        this.server.to(`user_${task.player2Id}`).emit('duelError', { message: errorMessage });
      }
      
      task.reject(error as Error);
    } finally {
      // Yield antes de processar próxima tarefa (prioriza HTTP)
      setImmediate(() => {
        this.isProcessing = false;
      });
    }
  }
}
