import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArenaMatchmakingService } from './arena-matchmaking.service';
import { DuelsService } from '../duels/duels.service';
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
  private readonly PROCESSING_INTERVAL_MS = 10000; // 10 segundos (reduzir frequência e priorizar HTTP)
  private server: Server | null = null;
  private isProcessing = false; // Flag para evitar processamento simultâneo

  constructor(
    private arenaMatchmakingService: ArenaMatchmakingService,
    private duelsService: DuelsService,
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
      // CRÍTICO: Verificar duelos ativos de forma não bloqueante
      // Usar setImmediate para dar prioridade a HTTP antes de verificar
      setImmediate(() => {
        const activeDuels = this.duelsService.getActiveDuelsCount();
        if (activeDuels > 0) {
          // Parar o intervalo completamente e reiniciar quando não houver duelos
          this.stop();
          // Reiniciar após 10 segundos (quando duelos terminarem)
          setTimeout(() => {
            if (this.duelsService.getActiveDuelsCount() === 0) {
              this.start();
            }
          }, 10000);
          return;
        }
        
        // Yield ao Event Loop novamente (prioriza HTTP)
        setImmediate(() => {
          // Não bloquear - processar de forma assíncrona
          if (!this.isProcessing) {
            this.processQueues().catch(error => {
              logger.error('❌ [ArenaMatchmakingProcessor] Erro no processamento:', error);
            });
          }
        });
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
      
      // Yield adicional se houver muitos duelos ativos (reduz carga)
      const activeDuels = this.duelsService.getActiveDuelsCount();
      if (activeDuels > 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Obter todas as divisões e seus jogadores
      const divisions = this.arenaMatchmakingService.getDivisions();
      
      // Processar cada divisão
      for (const division of divisions) {
        // Yield entre divisões
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const players = this.arenaMatchmakingService.getQueueForDivision(division);
        
        if (players.length === 0) {
          continue; // Fila vazia, pular
        }

        // Processar jogadores de forma sequencial (um por vez)
        for (const player of players) {
          try {
            // Verificar se ainda está na fila antes de processar
            if (!this.arenaMatchmakingService.isInArenaQueue(player.userId)) {
              continue; // Já foi removido da fila, pular
            }

            // Yield antes de buscar oponente
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Tentar encontrar oponente na mesma divisão
            const match = await this.arenaMatchmakingService.findArenaOpponent(player.userId);
            
            if (match) {
              // Buscar informações de ambos os jogadores do banco (otimizado: apenas campos necessários)
              try {
                const [opponentUser, player1User] = await Promise.all([
                  this.userRepository.findOne({
                    where: { id: match.opponent.userId },
                    select: ['id', 'username', 'nickname', 'clanTag', 'level', 'avatar', 'profileImage'],
                    cache: false, // Não usar cache para dados em tempo real
                  }),
                  this.userRepository.findOne({
                    where: { id: match.player1Id },
                    select: ['id', 'username', 'nickname', 'clanTag', 'level', 'avatar', 'profileImage'],
                    cache: false,
                  })
                ]);
                
                // Criar objeto com informações do oponente para passar ao notifyPlayers
                const opponentInfo = opponentUser ? {
                  userId: match.opponent.userId,
                  username: opponentUser.nickname || opponentUser.username,
                  clanTag: opponentUser.clanTag,
                  level: opponentUser.level || 1,
                  avatar: opponentUser.avatar || opponentUser.profileImage,
                } : {
                  userId: match.opponent.userId,
                  username: 'Unknown',
                  clanTag: null,
                  level: match.opponent.level || 1,
                  avatar: null,
                };
                
                // Adicionar informações do player1 ao match para uso no notifyPlayers
                (match as any).player1Info = player1User ? {
                  username: player1User.nickname || player1User.username,
                  clanTag: player1User.clanTag,
                  level: player1User.level || 1,
                  avatar: player1User.avatar || player1User.profileImage,
                } : null;
                
                // Substituir opponent no match com as informações completas
                (match as any).opponent = opponentInfo;
              } catch (error) {
                logger.warn(`⚠️ [ArenaMatchmakingProcessor] Erro ao buscar informações dos jogadores:`, error);
              }
              
              // Match encontrado! Notificar jogadores (SEM criar duelo automaticamente)
              this.notifyPlayers(match);
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

  /**
   * Notificar jogadores sobre match encontrado usando rooms Socket.IO
   */
  private notifyPlayers(match: { opponent: any; duel: any; player1Id?: number; player2Id?: number; player1Info?: any }) {
    if (!this.server) {
      logger.error('❌ [ArenaMatchmakingProcessor] Servidor Socket.IO não configurado');
      return;
    }

    try {
      const { opponent, duel, player1Id, player2Id, player1Info } = match as any;
      
      // Se não tem opponent ou IDs, não notificar
      if (!opponent || !player1Id || !player2Id) {
        logger.warn(`⚠️ [ArenaMatchmakingProcessor] Dados inválidos:`, { opponent, player1Id, player2Id });
        return;
      }

      // NOVA ABORDAGEM: Apenas notificar match encontrado (SEM criar duelo)
      // O duelo será criado quando o jogador entrar na arena
      // Isso evita bloquear o Event Loop
      const matchData1 = {
        player1Id: player1Id,
        player2Id: player2Id,
        opponent: {
          id: player2Id,
          username: opponent.username || 'Unknown',
          clanTag: opponent.clanTag || null,
          level: opponent.level || 1,
          avatar: opponent.avatar || null,
        },
      };
      
      const matchData2 = {
        player1Id: player1Id,
        player2Id: player2Id,
        opponent: {
          id: player1Id,
          username: player1Info?.username || 'Unknown',
          clanTag: player1Info?.clanTag || null,
          level: player1Info?.level || 1,
          avatar: player1Info?.avatar || null,
        },
      };

      // Notificar player1 usando room (todas as abas recebem)
      this.server.to(`user_${player1Id}`).emit('duelFound', matchData1);

      // Notificar player2 usando room (todas as abas recebem)
      this.server.to(`user_${player2Id}`).emit('duelFound', matchData2);

      logger.debug(`✅ [ArenaMatchmakingProcessor] Match encontrado: Player1=${player1Id} vs Player2=${player2Id}`);
    } catch (error) {
      logger.error('❌ [ArenaMatchmakingProcessor] Erro ao notificar jogadores:', error);
    }
  }
}

