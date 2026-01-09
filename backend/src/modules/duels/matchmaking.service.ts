import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { DuelsService } from './duels.service';
import { Server } from 'socket.io';
import { DuelOrigin } from './entities/duel.entity';
import { logger } from '../../common/utils/logger.util';
import { RandomDuelLevelRangesService } from '../admin/random-duel-level-ranges.service';
import { UsersService } from '../users/users.service';

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

  constructor(
    private duelsService: DuelsService,
    @Inject(forwardRef(() => RandomDuelLevelRangesService))
    private randomDuelLevelRangesService: RandomDuelLevelRangesService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
  ) {}

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
      logger.debug(`🔍 [Matchmaking] Usuário ${userId} adicionado à fila. Total na fila: ${this.queue.length}`);
    } else {
      logger.debug(`⚠️ [Matchmaking] Usuário ${userId} já está na fila`);
    }
  }

  removeFromQueue(userId: number): void {
    this.queue = this.queue.filter(p => p.userId !== userId);
  }

  isInQueue(userId: number): boolean {
    return this.queue.some(p => p.userId === userId);
  }

  private async processQueue() {
    if (this.isProcessing) {
      logger.debug(`⏸️ [Matchmaking] Já está processando, ignorando...`);
      return;
    }
    
    if (this.queue.length < 2) {
      logger.debug(`⏳ [Matchmaking] Fila tem apenas ${this.queue.length} jogador(es), aguardando mais...`);
      return;
    }
    
    logger.debug(`🚀 [Matchmaking] Processando fila com ${this.queue.length} jogadores...`);
    this.isProcessing = true;
    
    // Yield ao Event Loop ANTES de processar (prioriza HTTP)
    await new Promise(resolve => setImmediate(resolve));

    try {
      const player1 = this.queue[0];
      const player2 = this.queue[1];

      if (!player1 || !player2) {
        logger.error(`❌ [Matchmaking] Player1 ou Player2 é null!`);
        this.isProcessing = false;
        return;
      }

      // Verificar se ambos ainda estão na fila normal (não foram para a arena)
      if (!this.isInQueue(player1.userId) || !this.isInQueue(player2.userId)) {
        logger.debug(`⚠️ [Matchmaking] Um dos jogadores não está mais na fila normal, pulando match`);
        // Remover da fila se ainda estiverem lá
        this.removeFromQueue(player1.userId);
        this.removeFromQueue(player2.userId);
        this.isProcessing = false;
        return;
      }

      // Verificar se os níveis dos jogadores estão na mesma faixa
      try {
        const user1 = await this.usersService.findById(player1.userId);
        const user2 = await this.usersService.findById(player2.userId);

        if (!user1 || !user2) {
          logger.warn(`⚠️ [Matchmaking] Um dos usuários não foi encontrado. Removendo da fila.`);
          this.removeFromQueue(player1.userId);
          this.removeFromQueue(player2.userId);
          this.isProcessing = false;
          return;
        }

        const level1 = user1.level || 1;
        const level2 = user2.level || 1;

        // Verificar se podem se enfrentar baseado nas faixas de nível
        const canMatch = this.randomDuelLevelRangesService.canMatch(level1, level2);

        if (!canMatch) {
          logger.debug(`⚠️ [Matchmaking] Níveis ${level1} e ${level2} não estão na mesma faixa. Procurando outro match...`);
          
          // Tentar encontrar outro jogador compatível na fila
          let foundMatch = false;
          for (let i = 2; i < this.queue.length; i++) {
            const alternativePlayer = this.queue[i];
            
            // Verificar se ainda está na fila
            if (!this.isInQueue(alternativePlayer.userId)) {
              continue;
            }
            
            const altUser = await this.usersService.findById(alternativePlayer.userId);
            
            if (altUser) {
              const altLevel = altUser.level || 1;
              if (this.randomDuelLevelRangesService.canMatch(level1, altLevel)) {
                // Encontrou um match compatível, usar este jogador
                logger.debug(`✅ [Matchmaking] Match compatível encontrado! Player1: ${player1.userId} (Nível ${level1}), Player2: ${alternativePlayer.userId} (Nível ${altLevel})`);
                this.removeFromQueue(player1.userId);
                this.removeFromQueue(alternativePlayer.userId);
                foundMatch = true;
                
                // Processar este match
                this.createDuelForPlayers(player1, alternativePlayer);
                this.isProcessing = false;
                return;
              }
            }
          }

          if (!foundMatch) {
            // Não encontrou match compatível, manter na fila e processar próximo
            logger.debug(`⏳ [Matchmaking] Nenhum match compatível encontrado para nível ${level1}. Mantendo na fila.`);
            this.isProcessing = false;
            return;
          }
        } else {
          logger.debug(`✅ [Matchmaking] Match encontrado! Player1: ${player1.userId} (Nível ${level1}), Player2: ${player2.userId} (Nível ${level2})`);
          
          // Remover da fila
          this.removeFromQueue(player1.userId);
          this.removeFromQueue(player2.userId);
          logger.debug(`🗑️ [Matchmaking] Jogadores removidos da fila. Fila restante: ${this.queue.length}`);

          // Criar duelo
          this.createDuelForPlayers(player1, player2);
          this.isProcessing = false;
          return;
        }
      } catch (error) {
        logger.error(`❌ [Matchmaking] Erro ao verificar níveis:`, error);
        // Em caso de erro, continuar com o match original (fallback)
        logger.debug(`⚠️ [Matchmaking] Continuando com match original devido a erro na verificação de níveis`);
        
        // Remover da fila
        this.removeFromQueue(player1.userId);
        this.removeFromQueue(player2.userId);
        logger.debug(`🗑️ [Matchmaking] Jogadores removidos da fila. Fila restante: ${this.queue.length}`);

        // Criar duelo
        this.createDuelForPlayers(player1, player2);
        this.isProcessing = false;
        return;
      }
    } catch (error) {
      logger.error('❌ [Matchmaking] Erro:', error);
      this.isProcessing = false;
    }
  }

  private async createDuelForPlayers(player1: PlayerInQueue, player2: PlayerInQueue) {
    // Criar duelo em background (não bloqueia)
    (async () => {
        try {
          logger.debug(`🎮 [Matchmaking] Criando duelo para P1=${player1.userId} vs P2=${player2.userId}...`);
          const duel = await this.duelsService.createDuel(player1.userId, player2.userId, DuelOrigin.RANDOM);
          
          if (duel && duel.id) {
            const duelIdStr = typeof duel.id === 'string' ? duel.id : String(duel.id);
            
            // Verificar se o duelo foi realmente salvo no banco
            const isInDatabase = await this.duelsService.verifyDuelInDatabase(duelIdStr);
            
            if (!isInDatabase) {
              logger.warn(`⚠️ [Matchmaking] Duelo ${duelIdStr} não encontrado no banco!`);
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
            
            // Buscar duelo completo do banco para garantir que temos os campos player1Field e player2Field
            const fullDuel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
            if (!fullDuel) {
              logger.error(`❌ [Matchmaking] Não foi possível buscar duelo completo do banco!`);
              if (this.server) {
                this.server.to(`user_${player1.userId}`).emit('duelError', { message: 'Erro ao buscar duelo completo' });
                this.server.to(`user_${player2.userId}`).emit('duelError', { message: 'Erro ao buscar duelo completo' });
              }
              this.isProcessing = false;
              return;
            }
            
            // Preparar dados com player1Field e player2Field
            const player1Field = (fullDuel as any).player1Field || {};
            const player2Field = (fullDuel as any).player2Field || {};
            
            logger.debug(`📤 [Matchmaking] Preparando dados - player1Field: ${player1Field?.deck?.length || 0} cartas no deck`);
            
            // Notificar ambos os jogadores
            const matchData1 = {
              duelId: duelIdStr,
              player1Id: player1.userId,
              player2Id: player2.userId,
              opponent: { id: player2.userId },
              player1Field: player1Field, // SEMPRE do player1
              player2Field: player2Field, // SEMPRE do player2
            };
            
            const matchData2 = {
              duelId: duelIdStr,
              player1Id: player1.userId,
              player2Id: player2.userId,
              opponent: { id: player1.userId },
              player1Field: player1Field, // SEMPRE do player1
              player2Field: player2Field, // SEMPRE do player2
            };
            
            // Criar log de início do duelo
            try {
              const player1User = await this.duelsService['usersRepository'].findOne({ where: { id: player1.userId }, select: ['username', 'clanTag'] });
              const player2User = await this.duelsService['usersRepository'].findOne({ where: { id: player2.userId }, select: ['username', 'clanTag'] });
              const player1Name = player1User?.clanTag ? `|${player1User.clanTag}| ${player1User.username}` : player1User?.username || 'Jogador 1';
              const player2Name = player2User?.clanTag ? `|${player2User.clanTag}| ${player2User.username}` : player2User?.username || 'Jogador 2';
              
              // Salvar log para ambos os jogadores
              await this.duelsService.saveDuelLog(duelIdStr, player1.userId, 'DUEL_START', `Duelo iniciado: ${player1Name} vs ${player2Name}`);
              await this.duelsService.saveDuelLog(duelIdStr, player2.userId, 'DUEL_START', `Duelo iniciado: ${player1Name} vs ${player2Name}`);
            } catch (logError) {
              logger.error(`❌ [Matchmaking] Erro ao criar log de início do duelo:`, logError);
            }
            
            if (this.server) {
              this.server.to(`user_${player1.userId}`).emit('duelFound', matchData1);
              this.server.to(`user_${player2.userId}`).emit('duelFound', matchData2);
              logger.debug(`✅ [Matchmaking] Duelo ${duelIdStr} criado e notificado!`);
            }
          } else {
            logger.error(`❌ [Matchmaking] Duelo retornou null ou sem ID`);
            if (this.server) {
              this.server.to(`user_${player1.userId}`).emit('duelError', { message: 'Erro ao criar duelo' });
              this.server.to(`user_${player2.userId}`).emit('duelError', { message: 'Erro ao criar duelo' });
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro ao criar duelo';
          logger.error('❌ [Matchmaking] Erro ao criar duelo:', errorMessage);
          if (this.server) {
            this.server.to(`user_${player1.userId}`).emit('duelError', { message: errorMessage });
            this.server.to(`user_${player2.userId}`).emit('duelError', { message: errorMessage });
          }
        } finally {
          this.isProcessing = false;
        }
      })();
  }
}
