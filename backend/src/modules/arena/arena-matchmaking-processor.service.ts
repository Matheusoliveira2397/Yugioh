import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArenaMatchmakingService } from './arena-matchmaking.service';
import { DuelsService } from '../duels/duels.service';
import { DuelQueueService } from '../duels/duel-queue.service';
import { DuelOrigin } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { Server } from 'socket.io';
import { logger } from '../../common/utils/logger.util';

/**
 * Serviço global de processamento de matchmaking da Arena
 * 
 * Similar ao MatchmakingProcessorService, mas processa filas por divisão
 * Roda apenas UM loop global para processar TODAS as divisões
 */
@Injectable()
export class ArenaMatchmakingProcessorService implements OnModuleInit, OnModuleDestroy {
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly PROCESSING_INTERVAL_MS = 1500; // 1.5 s – matchmaking da arena mais rápido
  private server: Server | null = null;
  private isProcessing = false; // Flag para evitar processamento simultâneo

  constructor(
    private arenaMatchmakingService: ArenaMatchmakingService,
    private duelsService: DuelsService,
    private duelQueueService: DuelQueueService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Inicializar o processador quando o módulo iniciar
   */
  onModuleInit() {
    this.start();
  }

  /**
   * Parar o processador quando o módulo for destruído
   */
  onModuleDestroy() {
    this.stop();
  }

  /**
   * Configurar o servidor Socket.IO para notificar jogadores
   */
  setServer(server: Server) {
    this.server = server;
  }

  /**
   * Iniciar o processador global
   */
  private start() {
    if (this.processingInterval) {
      logger.debug('⚠️ [ArenaMatchmakingProcessor] Processador já está rodando');
      return;
    }

    logger.info('🚀 [ArenaMatchmakingProcessor] Iniciando processador global de matchmaking da Arena...');
    
    this.processingInterval = setInterval(() => {
      setImmediate(() => {
        // Não parar o matchmaking da arena por causa de duelos ativos; só dar um yield se houver muitos
        if (!this.isProcessing) {
          this.processQueues().catch(error => {
            logger.error('❌ [ArenaMatchmakingProcessor] Erro no processamento:', error);
          });
        }
      });
    }, this.PROCESSING_INTERVAL_MS);

    logger.info(`✅ [ArenaMatchmakingProcessor] Processador iniciado (intervalo: ${this.PROCESSING_INTERVAL_MS}ms)`);
  }

  /**
   * Parar o processador
   */
  private stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('🛑 [ArenaMatchmakingProcessor] Processador parado');
    }
  }

  /**
   * Disparar uma rodada de processamento na próxima tick (ex.: quando alguém entra na fila).
   * Assim o match não espera só o intervalo fixo.
   */
  triggerProcess(): void {
    if (this.isProcessing) return;
    setImmediate(() => {
      this.processQueues().catch(error => {
        logger.error('❌ [ArenaMatchmakingProcessor] Erro no trigger:', error);
      });
    });
  }

  /**
   * Processar todas as filas de divisões da Arena
   */
  private async processQueues() {
    // Evitar processamento simultâneo
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // CRÍTICO: NÃO parar processamento quando há duelos ativos
      // Apenas dar yield ao Event Loop para priorizar HTTP
      // Yield antes de processar (prioriza HTTP)
      await new Promise(resolve => setImmediate(resolve));
      
      // Leve yield só com muitos duelos ativos
      const activeDuels = this.duelsService.getActiveDuelsCount();
      if (activeDuels > 20) {
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      const levelRanges = this.arenaMatchmakingService.getLevelRanges();

      for (const levelRange of levelRanges) {
        await new Promise(resolve => setImmediate(resolve));

        const players = this.arenaMatchmakingService.getQueueForLevelRange(levelRange);

        if (players.length === 0) continue;

        for (const player of players) {
          try {
            if (!this.arenaMatchmakingService.isInArenaQueue(player.userId)) continue;

            await new Promise(resolve => setImmediate(resolve));

            // Tentar encontrar oponente na mesma divisão
            const match = await this.arenaMatchmakingService.findArenaOpponent(player.userId);
            
            if (match) {
              // Buscar informações de ambos os jogadores do banco (otimizado: apenas campos necessários)
              try {
                const [opponentUser, player1User] = await Promise.all([
                  this.userRepository.findOne({
                    where: { id: match.opponent.userId },
                    select: ['id', 'username', 'nickname', 'clanTag', 'level', 'profileImage'],
                    cache: false, // Não usar cache para dados em tempo real
                  }),
                  this.userRepository.findOne({
                    where: { id: match.player1Id },
                    select: ['id', 'username', 'nickname', 'clanTag', 'level', 'profileImage'],
                    cache: false,
                  })
                ]);
                
                // Criar objeto com informações do oponente para passar ao notifyPlayers
                const opponentInfo = opponentUser ? {
                  userId: match.opponent.userId,
                  nickname: opponentUser.nickname || opponentUser.username,
                  clanTag: opponentUser.clanTag,
                  level: opponentUser.level || 1,
                  profileImage: opponentUser.profileImage,
                } : {
                  userId: match.opponent.userId,
                  nickname: 'Unknown',
                  clanTag: null,
                  level: match.opponent.level || 1,
                  profileImage: null,
                };
                
                (match as any).player1Info = player1User ? {
                  nickname: player1User.nickname || player1User.username,
                  clanTag: player1User.clanTag,
                  level: player1User.level || 1,
                  profileImage: player1User.profileImage,
                } : null;
                
                // Substituir opponent no match com as informações completas
                (match as any).opponent = opponentInfo;
              } catch (error) {
                logger.warn(`⚠️ [ArenaMatchmakingProcessor] Erro ao buscar informações dos jogadores:`, error);
              }
              
              // Match encontrado! Enfileirar criação do duelo (fila emite duelCreated com duelId para ambos)
              const player1Id = match.player1Id;
              const player2Id = match.player2Id;
              if (player1Id && player2Id) {
                this.duelQueueService
                  .enqueueDuelCreation(player1Id, player2Id, '', DuelOrigin.ARENA)
                  .catch((err) => logger.error('❌ [ArenaMatchmakingProcessor] Erro ao enfileirar duelo da arena:', err));
                this.duelQueueService.triggerProcess();
              }
              // findArenaOpponent já remove os jogadores da fila
            }
          } catch (error) {
            // Silenciosamente ignorar erros individuais (apenas logar em dev)
            logger.debug(`⚠️ [ArenaMatchmakingProcessor] Erro ao processar jogador ${player.userId}:`, error);
          }
        }
      }
    } catch (error) {
      // Erro crítico - logar mas não parar o processador
      logger.error('❌ [ArenaMatchmakingProcessor] Erro crítico ao processar filas:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}

