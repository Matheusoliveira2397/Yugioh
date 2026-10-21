import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { DuelsService } from './duels.service';
import { Server } from 'socket.io';
import { DuelOrigin } from './entities/duel.entity';
import { logger } from '../../common/utils/logger.util';
import { RandomDuelLevelRangesService } from '../admin/random-duel-level-ranges.service';
import { UsersService } from '../users/users.service';
import { normalizeProfileImageForClient } from '../users/profile-image.util';

export type MatchmakingMode = 'casual' | 'ranked' | 'anime';

interface PlayerInQueue {
  userId: number;
  socketId: string;
  joinedAt: Date;
  mode: MatchmakingMode;
  animeDeckId?: string;
  rankedPoints?: number;
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private queue: PlayerInQueue[] = [];
  private rankedQueue: PlayerInQueue[] = [];
  private animeQueue: PlayerInQueue[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly PROCESSING_INTERVAL_MS = 3000;
  private server: Server | null = null;
  private isProcessing = false;
  private lastQueueLog: number = 0;

  constructor(
    @Inject(forwardRef(() => DuelsService))
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
      setImmediate(() => {
        if (this.isProcessing) return;
        if (this.animeQueue.length >= 2) {
          console.log(`🚀 [Matchmaking] Processando fila Anime Deck...`);
          this.processAnimeQueue();
          return;
        }
        if (this.rankedQueue.length >= 2) {
          console.log(`🚀 [Matchmaking] Processando fila Ranked...`);
          this.processRankedQueue();
          return;
        }
        if (this.queue.length >= 2) {
          console.log(`🚀 [Matchmaking] Processando fila Casual...`);
          this.processQueue();
          return;
        }
        if (this.queue.length === 1 || this.animeQueue.length === 1 || this.rankedQueue.length === 1) {
          const now = Date.now();
          if (!this.lastQueueLog || now - this.lastQueueLog > 10000) {
            console.log(
              `⏳ [Matchmaking] Aguardando par: casual=${this.queue.length}, ranked=${this.rankedQueue.length}, anime=${this.animeQueue.length}`,
            );
            this.lastQueueLog = now;
          }
        }
      });
    }, this.PROCESSING_INTERVAL_MS);
  }

  private stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Adiciona à fila.
   * - mode 'anime' + animeDeckId → fila anime
   * - mode 'ranked' → fila ranqueada
   * - default → fila casual (random)
   */
  addToQueue(
    userId: number,
    socketId: string,
    optionsOrAnimeDeckId?:
      | string
      | { animeDeckId?: string; mode?: MatchmakingMode; rankedPoints?: number },
  ): void {
    this.removeFromQueue(userId);

    const options =
      typeof optionsOrAnimeDeckId === 'string'
        ? { animeDeckId: optionsOrAnimeDeckId }
        : optionsOrAnimeDeckId;

    const animeDeckId =
      options?.animeDeckId && String(options.animeDeckId).trim()
        ? String(options.animeDeckId).trim()
        : undefined;
    const mode: MatchmakingMode =
      options?.mode === 'ranked'
        ? 'ranked'
        : animeDeckId || options?.mode === 'anime'
          ? 'anime'
          : 'casual';

    const entry: PlayerInQueue = {
      userId,
      socketId,
      joinedAt: new Date(),
      mode,
      animeDeckId,
      rankedPoints: options?.rankedPoints,
    };

    if (mode === 'anime') {
      this.animeQueue.push(entry);
      logger.debug(
        `🔍 [Matchmaking] Usuário ${userId} adicionado à fila Anime. Total: ${this.animeQueue.length}`,
      );
      return;
    }

    if (mode === 'ranked') {
      this.rankedQueue.push(entry);
      logger.debug(
        `🔍 [Matchmaking] Usuário ${userId} adicionado à fila Ranked (${entry.rankedPoints ?? '?'} pts). Total: ${this.rankedQueue.length}`,
      );
      return;
    }

    this.queue.push(entry);
    logger.debug(
      `🔍 [Matchmaking] Usuário ${userId} adicionado à fila Casual. Total: ${this.queue.length}`,
    );
  }

  removeFromQueue(userId: number): void {
    this.queue = this.queue.filter((p) => p.userId !== userId);
    this.rankedQueue = this.rankedQueue.filter((p) => p.userId !== userId);
    this.animeQueue = this.animeQueue.filter((p) => p.userId !== userId);
  }

  isInQueue(userId: number): boolean {
    return (
      this.queue.some((p) => p.userId === userId) ||
      this.rankedQueue.some((p) => p.userId === userId) ||
      this.animeQueue.some((p) => p.userId === userId)
    );
  }

  private async processQueue() {
    if (this.isProcessing) return;
    if (this.queue.length < 2) return;

    this.isProcessing = true;
    await new Promise((resolve) => setImmediate(resolve));

    try {
      const player1 = this.queue[0];
      const player2 = this.queue[1];
      if (!player1 || !player2) {
        this.isProcessing = false;
        return;
      }

      if (!this.queue.some((p) => p.userId === player1.userId) || !this.queue.some((p) => p.userId === player2.userId)) {
        this.removeFromQueue(player1.userId);
        this.removeFromQueue(player2.userId);
        this.isProcessing = false;
        return;
      }

      try {
        const user1 = await this.usersService.findById(player1.userId);
        const user2 = await this.usersService.findById(player2.userId);

        if (!user1 || !user2) {
          this.removeFromQueue(player1.userId);
          this.removeFromQueue(player2.userId);
          this.isProcessing = false;
          return;
        }

        const level1 = user1.level || 1;
        const level2 = user2.level || 1;
        const canMatch = this.randomDuelLevelRangesService.canMatch(level1, level2);

        if (!canMatch) {
          for (let i = 2; i < this.queue.length; i++) {
            const alternativePlayer = this.queue[i];
            if (!this.queue.some((p) => p.userId === alternativePlayer.userId)) continue;
            const altUser = await this.usersService.findById(alternativePlayer.userId);
            if (!altUser) continue;
            const altLevel = altUser.level || 1;
            if (this.randomDuelLevelRangesService.canMatch(level1, altLevel)) {
              this.removeFromQueue(player1.userId);
              this.removeFromQueue(alternativePlayer.userId);
              this.createDuelForPlayers(player1, alternativePlayer, DuelOrigin.RANDOM);
              this.isProcessing = false;
              return;
            }
          }
          this.isProcessing = false;
          return;
        }

        this.removeFromQueue(player1.userId);
        this.removeFromQueue(player2.userId);
        this.createDuelForPlayers(player1, player2, DuelOrigin.RANDOM);
        this.isProcessing = false;
      } catch (error) {
        logger.error(`❌ [Matchmaking] Erro ao verificar níveis:`, error);
        this.removeFromQueue(player1.userId);
        this.removeFromQueue(player2.userId);
        this.createDuelForPlayers(player1, player2, DuelOrigin.RANDOM);
        this.isProcessing = false;
      }
    } catch (error) {
      logger.error('❌ [Matchmaking] Erro:', error);
      this.isProcessing = false;
    }
  }

  private async processRankedQueue() {
    if (this.isProcessing || this.rankedQueue.length < 2) return;
    this.isProcessing = true;
    await new Promise((resolve) => setImmediate(resolve));

    try {
      const player1 = this.rankedQueue[0];
      if (!player1) {
        this.isProcessing = false;
        return;
      }

      // Garante rankedPoints atualizado
      if (player1.rankedPoints == null) {
        const u = await this.usersService.findById(player1.userId);
        player1.rankedPoints = Number((u as any)?.rankedPoints ?? 1000);
      }

      const waitSec = (Date.now() - player1.joinedAt.getTime()) / 1000;
      const range = 100 + Math.floor(waitSec / 20) * 75; // expande com o tempo

      let best: { player: PlayerInQueue; diff: number } | null = null;
      for (let i = 1; i < this.rankedQueue.length; i++) {
        const candidate = this.rankedQueue[i];
        if (!this.rankedQueue.some((p) => p.userId === candidate.userId)) continue;
        if (candidate.rankedPoints == null) {
          const u = await this.usersService.findById(candidate.userId);
          candidate.rankedPoints = Number((u as any)?.rankedPoints ?? 1000);
        }
        const diff = Math.abs((player1.rankedPoints ?? 1000) - (candidate.rankedPoints ?? 1000));
        if (diff <= range && (!best || diff < best.diff)) {
          best = { player: candidate, diff };
        }
      }

      // Se ninguém na faixa após esperar bastante, pega o mais próximo
      if (!best && waitSec >= 90) {
        for (let i = 1; i < this.rankedQueue.length; i++) {
          const candidate = this.rankedQueue[i];
          if (!this.rankedQueue.some((p) => p.userId === candidate.userId)) continue;
          const diff = Math.abs((player1.rankedPoints ?? 1000) - (candidate.rankedPoints ?? 1000));
          if (!best || diff < best.diff) best = { player: candidate, diff };
        }
      }

      if (!best) {
        this.isProcessing = false;
        return;
      }

      this.removeFromQueue(player1.userId);
      this.removeFromQueue(best.player.userId);
      logger.debug(
        `✅ [Matchmaking] Ranked match: ${player1.userId} (${player1.rankedPoints}) vs ${best.player.userId} (${best.player.rankedPoints}) diff=${best.diff}`,
      );
      this.createDuelForPlayers(player1, best.player, DuelOrigin.RANKED);
    } catch (error) {
      logger.error('❌ [Matchmaking] Erro processRankedQueue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processAnimeQueue() {
    if (this.isProcessing || this.animeQueue.length < 2) return;
    this.isProcessing = true;
    await new Promise((resolve) => setImmediate(resolve));
    try {
      const player1 = this.animeQueue[0];
      const player2 = this.animeQueue[1];
      if (!player1?.animeDeckId || !player2?.animeDeckId) {
        this.isProcessing = false;
        return;
      }
      if (
        !this.animeQueue.some((p) => p.userId === player1.userId) ||
        !this.animeQueue.some((p) => p.userId === player2.userId)
      ) {
        this.removeFromQueue(player1.userId);
        this.removeFromQueue(player2.userId);
        this.isProcessing = false;
        return;
      }
      this.animeQueue = this.animeQueue.filter(
        (p) => p.userId !== player1.userId && p.userId !== player2.userId,
      );
      this.createDuelForPlayers(player1, player2, DuelOrigin.RANDOM_ANIME);
    } catch (error) {
      logger.error('❌ [Matchmaking] Erro processAnimeQueue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async createDuelForPlayers(
    player1: PlayerInQueue,
    player2: PlayerInQueue,
    origin: DuelOrigin,
  ) {
    (async () => {
      try {
        const isAnimeDuel = origin === DuelOrigin.RANDOM_ANIME;
        const options = isAnimeDuel
          ? {
              player1AnimeDeckId: player1.animeDeckId!,
              player2AnimeDeckId: player2.animeDeckId!,
            }
          : undefined;
        logger.debug(
          `🎮 [Matchmaking] Criando duelo P1=${player1.userId} vs P2=${player2.userId} origin=${origin}`,
        );
        const duel = await this.duelsService.createDuel(
          player1.userId,
          player2.userId,
          origin,
          options,
        );

        if (duel && duel.id) {
          const duelIdStr = typeof duel.id === 'string' ? duel.id : String(duel.id);

          const isInDatabase = await this.duelsService.verifyDuelInDatabase(duelIdStr);
          if (!isInDatabase) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const retryCheck = await this.duelsService.verifyDuelInDatabase(duelIdStr);
            if (!retryCheck) {
              if (this.server) {
                this.server
                  .to(`user_${player1.userId}`)
                  .emit('duelError', { message: 'Erro ao salvar duelo no banco' });
                this.server
                  .to(`user_${player2.userId}`)
                  .emit('duelError', { message: 'Erro ao salvar duelo no banco' });
              }
              return;
            }
          }

          const fullDuel = await this.duelsService.findDuelByIdFromDatabase(duelIdStr);
          if (!fullDuel) {
            if (this.server) {
              this.server
                .to(`user_${player1.userId}`)
                .emit('duelError', { message: 'Erro ao buscar duelo completo' });
              this.server
                .to(`user_${player2.userId}`)
                .emit('duelError', { message: 'Erro ao buscar duelo completo' });
            }
            return;
          }

          const player1Field = (fullDuel as any).player1Field || {};
          const player2Field = (fullDuel as any).player2Field || {};

          let player1User: any = null;
          let player2User: any = null;
          try {
            player1User = await this.duelsService['usersRepository'].findOne({
              where: { id: player1.userId },
              select: [
                'id',
                'username',
                'nickname',
                'clanTag',
                'level',
                'profileImage',
                'rankedPoints',
              ],
            });
            player2User = await this.duelsService['usersRepository'].findOne({
              where: { id: player2.userId },
              select: [
                'id',
                'username',
                'nickname',
                'clanTag',
                'level',
                'profileImage',
                'rankedPoints',
              ],
            });
          } catch (userError) {
            logger.error(`❌ [Matchmaking] Erro ao buscar dados dos usuários:`, userError);
          }

          const matchData1 = {
            duelId: duelIdStr,
            player1Id: player1.userId,
            player2Id: player2.userId,
            origin,
            opponent: {
              id: player2.userId,
              nickname: player2User?.nickname || player2User?.username || 'Unknown',
              clanTag: player2User?.clanTag || null,
              level: player2User?.level || 1,
              rankedPoints: player2User?.rankedPoints ?? null,
              profileImage: normalizeProfileImageForClient(
                player2User?.profileImage || null,
              ),
            },
            player1Field,
            player2Field,
          };

          const matchData2 = {
            duelId: duelIdStr,
            player1Id: player1.userId,
            player2Id: player2.userId,
            origin,
            opponent: {
              id: player1.userId,
              nickname: player1User?.nickname || player1User?.username || 'Unknown',
              clanTag: player1User?.clanTag || null,
              level: player1User?.level || 1,
              rankedPoints: player1User?.rankedPoints ?? null,
              profileImage: normalizeProfileImageForClient(
                player1User?.profileImage || null,
              ),
            },
            player1Field,
            player2Field,
          };

          try {
            const player1Name = player1User?.clanTag
              ? `|${player1User.clanTag}| ${player1User.nickname || player1User.username}`
              : player1User?.nickname || player1User?.username || 'Jogador 1';
            const player2Name = player2User?.clanTag
              ? `|${player2User.clanTag}| ${player2User.nickname || player2User.username}`
              : player2User?.nickname || player2User?.username || 'Jogador 2';

            await this.duelsService.saveDuelLog(
              duelIdStr,
              player1.userId,
              'DUEL_START',
              `Duelo iniciado: ${player1Name} vs ${player2Name}`,
            );
            await this.duelsService.saveDuelLog(
              duelIdStr,
              player2.userId,
              'DUEL_START',
              `Duelo iniciado: ${player1Name} vs ${player2Name}`,
            );
          } catch (logError) {
            logger.error(`❌ [Matchmaking] Erro ao criar log de início:`, logError);
          }

          if (this.server) {
            this.server.to(`user_${player1.userId}`).emit('duelFound', matchData1);
            this.server.to(`user_${player2.userId}`).emit('duelFound', matchData2);
            logger.debug(`✅ [Matchmaking] Duelo ${duelIdStr} criado e notificado!`);
          }
        } else {
          logger.error(`❌ [Matchmaking] Duelo retornou null ou sem ID`);
          if (this.server) {
            this.server
              .to(`user_${player1.userId}`)
              .emit('duelError', { message: 'Erro ao criar duelo' });
            this.server
              .to(`user_${player2.userId}`)
              .emit('duelError', { message: 'Erro ao criar duelo' });
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro ao criar duelo';
        logger.error('❌ [Matchmaking] Erro ao criar duelo:', errorMessage);
        if (this.server) {
          this.server
            .to(`user_${player1.userId}`)
            .emit('duelError', { message: errorMessage });
          this.server
            .to(`user_${player2.userId}`)
            .emit('duelError', { message: errorMessage });
        }
      }
    })();
  }
}
