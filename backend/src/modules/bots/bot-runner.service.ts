import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository, In } from 'typeorm';
import { Socket } from 'socket.io';
import { ManagedBot } from './entities/managed-bot.entity';
import { Duel, DuelStatus, TurnPhase } from '../duels/entities/duel.entity';
import { MatchmakingService } from '../duels/matchmaking.service';
import { DuelsGateway } from '../duels/duels.gateway';
import { DuelsService } from '../duels/duels.service';

/**
 * A conservative, server-side bot actor. Uses the same Socket.IO action
 * handlers and duel locks as a real player; never trusts a client-sent userId.
 * The virtual socket is NOT exposed to the network.
 */
@Injectable()
export class BotRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(BotRunnerService.name);
  private running = false;
  private readonly queuedAt = new Map<number, number>();
  private readonly turnAttempts = new Map<string, number>();
  private readonly MAX_ATTEMPTS_PER_TURN = 16;

  constructor(
    @InjectRepository(ManagedBot) private readonly bots: Repository<ManagedBot>,
    @InjectRepository(Duel) private readonly duels: Repository<Duel>,
    private readonly matchmaking: MatchmakingService,
    private readonly gateway: DuelsGateway,
    private readonly duelService: DuelsService,
  ) {}

  onModuleDestroy() {
    for (const id of this.queuedAt.keys()) this.matchmaking.removeFromQueue(id);
    this.queuedAt.clear();
  }

  @Interval(5000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const allBots = await this.bots.find();
      const enabled = allBots.filter(b => b.enabled);
      const ids = allBots.map(b => b.userId);
      const activeIds = new Set(enabled.map(b => b.userId));
      for (const id of this.queuedAt.keys()) {
        if (!activeIds.has(id)) { this.matchmaking.removeFromQueue(id); this.queuedAt.delete(id); }
      }
      const active = ids.length ? await this.duels.find({
        where: [
          { player1Id: In(ids), status: In([DuelStatus.WAITING, DuelStatus.IN_PROGRESS]) },
          { player2Id: In(ids), status: In([DuelStatus.WAITING, DuelStatus.IN_PROGRESS]) },
        ],
      }) : [];
      const busy = new Set<number>();
      for (const duel of active) {
        if (ids.includes(duel.player1Id)) busy.add(duel.player1Id);
        if (ids.includes(duel.player2Id)) busy.add(duel.player2Id);
      }

      for (const bot of allBots) {
        if (busy.has(bot.userId)) {
          this.matchmaking.removeFromQueue(bot.userId);
          this.queuedAt.delete(bot.userId);
          const duel = active.find(d => d.player1Id === bot.userId || d.player2Id === bot.userId);
          if (duel?.status === DuelStatus.IN_PROGRESS) {
            try { await this.play(bot, duel); }
            catch (e) { this.logger.warn('Bot '+bot.userId+' failed action: '+String(e)); }
          }
          continue;
        }
        if (!bot.enabled || bot.participation !== 'RANDOM') continue;
        // Do not reset lastQueuedAt while waiting; avoid queue reinsertion.
        if (this.matchmaking.isInQueue(bot.userId)) continue;
        const last = bot.lastQueuedAt?.getTime() || 0;
        if (Date.now() - last < bot.intervalMinutes * 60000) continue;
        // Avoid indefinitely queued synthetic users when nobody is online.
        if (this.queuedAt.has(bot.userId) && Date.now() - this.queuedAt.get(bot.userId)! < 60000) continue;
        this.matchmaking.addToQueue(bot.userId, 'managed-bot:' + bot.userId);
        this.queuedAt.set(bot.userId, Date.now());
        await this.bots.update(bot.id, { lastQueuedAt: new Date() });
      }
    } catch (e) {
      this.logger.error('Bot scheduler error: '+String(e));
    } finally { this.running = false; }
  }

  private virtualClient(userId: number, report: (message: string) => void): Socket {
    return {
      data: { userId },
      emit: (event: string, payload: any) => {
        if (event === 'duelError') report(String(payload?.message || 'invalid action'));
        return true;
      },
    } as unknown as Socket;
  }

  private async play(bot: ManagedBot, snapshot: Duel) {
    const isP1 = snapshot.player1Id === bot.userId;
    if (snapshot.currentTurn !== (isP1 ? 1 : 2)) return;
    const turnKey = snapshot.id + ':' + snapshot.turnCounter;
    if ((this.turnAttempts.get(turnKey) || 0) >= this.MAX_ATTEMPTS_PER_TURN) return;
    this.turnAttempts.set(turnKey, (this.turnAttempts.get(turnKey) || 0) + 1);
    let failure = '';
    const client = this.virtualClient(bot.userId, reason => { failure = reason; });
    const duelId = snapshot.id;

    if (snapshot.pendingChoice) {
      // Never bypass interactive choices. The standard turn timer remains a fallback.
      return;
    }
    if (snapshot.currentPhase === TurnPhase.DRAW) {
      const drawn = await this.duelService.processDrawPhase(duelId);
      if (drawn) {
        this.gateway.server.to('duel_' + duelId).emit('duelUpdate', {
          ...drawn,
          player1Field: drawn.player1Field,
          player2Field: drawn.player2Field,
        });
      }
      return;
    }
    if (snapshot.currentPhase === TurnPhase.STANDBY) {
      await this.gateway.handleNextPhase({ duelId }, client);
      return;
    }
    if (snapshot.currentPhase === TurnPhase.MAIN1) {
      const field: any = isP1 ? snapshot.player1Field : snapshot.player2Field;
      const monsters: any[] = Array.isArray(field?.monsters) ? field.monsters : [];
      const free = Array.from({ length: 5 }, (_, i) => i).find(i => !monsters[i]);
      const hand: any[] = Array.isArray(field?.hand) ? field.hand : [];
      // Start with uncomplicated low-level monsters; advanced combos remain a future extension.
      const candidates = hand.filter(c => {
        const type = String(c?.type || c?.cardType || '').toLowerCase();
        return type.includes('monster') && Number(c?.level || 0) > 0 && Number(c?.level) <= 4;
      });
      candidates.sort((a,b) => Number(b.atk || b.attack || 0) - Number(a.atk || a.attack || 0));
      const chosen = bot.difficulty === 'EASY' ? candidates[candidates.length - 1] : candidates[0];
      const cardId = chosen?.idCarta || chosen?.id || chosen?.cardId;
      if (free !== undefined && cardId) {
        await this.gateway.handleDuelAction({ duelId, actionType: 'SUMMON_MONSTER',
          actionData: { cardId, zoneIndex: free, position: bot.difficulty === 'EASY' ? 'defense' : 'attack' } }, client);
      }
      // Advance via the normal handler even if summon was invalid.
      await this.gateway.handleNextPhase({ duelId }, client);
      return;
    }
    if (snapshot.currentPhase === TurnPhase.BATTLE) {
      const own: any = isP1 ? snapshot.player1Field : snapshot.player2Field;
      const theirs: any = isP1 ? snapshot.player2Field : snapshot.player1Field;
      const monsters: any[] = Array.isArray(own?.monsters) ? own.monsters : [];
      const targets: any[] = Array.isArray(theirs?.monsters) ? theirs.monsters : [];
      const attackerIndex = monsters.findIndex(m => m && (m.position === 'attack' || m.position === 'face-up-attack') && !m.hasAttacked && !m.hasAttackedThisTurn && !m.attacked && !m.attackedThisTurn);
      if (attackerIndex >= 0) {
        const attack = Number(monsters[attackerIndex]?.atk || monsters[attackerIndex]?.attack || 0);
        const defended = targets.map((m, i) => ({ m, i })).filter(x => x.m);
        const weak = defended.filter(x => {
          const strength = String(x.m.position || '').includes('defense') ? Number(x.m.def || x.m.defense || 0) : Number(x.m.atk || x.m.attack || 0);
          return attack > strength;
        });
        const targetZoneIndex = weak.length ? weak[0].i : defended.length ? undefined : null;
        if (targetZoneIndex !== undefined && this.turnAttempts.get(turnKey) === 1) {
          await this.gateway.handleDuelAction({ duelId, actionType: 'ATTACK',
            actionData: { attackerZoneIndex: attackerIndex, targetZoneIndex } }, client);
          if (!failure) return;
        }
      }
      await this.gateway.handleNextPhase({ duelId }, client);
      return;
    }
    if (snapshot.currentPhase === TurnPhase.MAIN2 || snapshot.currentPhase === TurnPhase.END) {
      await this.gateway.handleEndTurn({ duelId }, client);
      return;
    }
    if (failure) this.logger.debug('Bot action rejected: '+failure);
  }
}
