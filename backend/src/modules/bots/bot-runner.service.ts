import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository, In } from 'typeorm';
import { Socket } from 'socket.io';
import { ManagedBot } from './entities/managed-bot.entity';
import { Duel, DuelStatus, TurnPhase } from '../duels/entities/duel.entity';
import type { MatchmakingService } from '../duels/matchmaking.service';
import type { DuelsGateway } from '../duels/duels.gateway';
import type { DuelsService } from '../duels/duels.service';
import { BotAiService } from './bot-ai.service';
import { BotActionCandidate } from './bot-action.types';
import {
  buildMonsterEffectChoice,
  buildSpecialSummonChoice,
  isMonsterEffectImmediate,
  isMonsterEffectStart,
  isSpecialSummonStart,
} from './bot-monster-effects';

@Injectable()
export class BotRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotRunnerService.name);
  private running = false;
  private readonly queuedAt = new Map<number, number>();
  private readonly phaseAttempts = new Map<string, number>();
  private readonly pendingFails = new Map<string, number>();
  /** Ações que falharam neste turno — evita loop infinito. */
  private readonly bannedActions = new Map<string, Set<string>>();
  private readonly MAX_ATTEMPTS_PER_PHASE = 18;
  private readonly MAX_PENDING_FAILS = 2;

  private matchmaking!: MatchmakingService;
  private gateway!: DuelsGateway;
  private duelService!: DuelsService;

  constructor(
    @InjectRepository(ManagedBot) private readonly bots: Repository<ManagedBot>,
    @InjectRepository(Duel) private readonly duels: Repository<Duel>,
    private readonly moduleRef: ModuleRef,
    private readonly botAi: BotAiService,
  ) {}

  async onModuleInit() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MatchmakingService } = require('../duels/matchmaking.service');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DuelsGateway } = require('../duels/duels.gateway');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DuelsService } = require('../duels/duels.service');
    this.matchmaking = this.moduleRef.get(MatchmakingService, { strict: false });
    this.gateway = this.moduleRef.get(DuelsGateway, { strict: false });
    this.duelService = this.moduleRef.get(DuelsService, { strict: false });
    this.logger.log(
      this.botAi.isLlmEnabled()
        ? 'BotRunner pronto (IA estratégica + LLM + memória + respostas)'
        : 'BotRunner pronto (IA estratégica + memória + combos; opcional BOT_AI_API_KEY para LLM)',
    );
  }

  onModuleDestroy() {
    if (!this.matchmaking) return;
    for (const id of this.queuedAt.keys()) this.matchmaking.removeFromQueue(id);
    this.queuedAt.clear();
  }

  @Interval(1200)
  async tick() {
    if (this.running || !this.matchmaking || !this.gateway || !this.duelService) return;
    this.running = true;
    try {
      const allBots = await this.bots.find();
      const enabled = allBots.filter((b) => b.enabled);
      const ids = allBots.map((b) => b.userId);
      const activeIds = new Set(enabled.map((b) => b.userId));
      for (const id of this.queuedAt.keys()) {
        if (!activeIds.has(id)) {
          this.matchmaking.removeFromQueue(id);
          this.queuedAt.delete(id);
        }
      }
      const active = ids.length
        ? await this.duels.find({
            where: [
              { player1Id: In(ids), status: In([DuelStatus.WAITING, DuelStatus.IN_PROGRESS]) },
              { player2Id: In(ids), status: In([DuelStatus.WAITING, DuelStatus.IN_PROGRESS]) },
            ],
          })
        : [];
      const busy = new Set<number>();
      for (const duel of active) {
        if (ids.includes(duel.player1Id)) busy.add(duel.player1Id);
        if (ids.includes(duel.player2Id)) busy.add(duel.player2Id);
      }

      for (const bot of allBots) {
        if (busy.has(bot.userId)) {
          this.matchmaking.removeFromQueue(bot.userId);
          this.queuedAt.delete(bot.userId);
          const duelMeta = active.find((d) => d.player1Id === bot.userId || d.player2Id === bot.userId);
          if (duelMeta?.status === DuelStatus.IN_PROGRESS) {
            try {
              const fresh =
                this.duelService.findDuelByIdLight?.(duelMeta.id) ||
                (await this.duelService.findDuelByIdFromDatabase(duelMeta.id, true));
              if (fresh) await this.play(bot, fresh);
            } catch (e) {
              this.logger.warn('Bot ' + bot.userId + ' failed action: ' + String(e));
            }
          }
          continue;
        }
        if (!bot.enabled || bot.participation !== 'RANDOM') continue;
        if (this.matchmaking.isInQueue(bot.userId)) continue;
        const last = bot.lastQueuedAt?.getTime() || 0;
        if (Date.now() - last < bot.intervalMinutes * 60000) continue;
        if (this.queuedAt.has(bot.userId) && Date.now() - this.queuedAt.get(bot.userId)! < 60000) continue;
        this.matchmaking.addToQueue(bot.userId, 'managed-bot:' + bot.userId);
        this.queuedAt.set(bot.userId, Date.now());
        await this.bots.update(bot.id, { lastQueuedAt: new Date() });
        this.logger.log(`Bot ${bot.name} (#${bot.userId}) entrou na fila RANDOM`);
      }
    } catch (e) {
      this.logger.error('Bot scheduler error: ' + String(e));
    } finally {
      this.running = false;
    }
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

  private async act(
    duelId: string | number,
    client: Socket,
    actionType: string,
    actionData: any,
    failureRef: { value: string },
  ): Promise<boolean> {
    failureRef.value = '';
    await this.gateway.handleDuelAction({ duelId, actionType, actionData }, client);
    if (failureRef.value) {
      this.logger.debug(`Bot ação rejeitada [${actionType}]: ${failureRef.value}`);
      return false;
    }
    return true;
  }

  private async resolvePending(bot: ManagedBot, duel: Duel, client: Socket, failureRef: { value: string }): Promise<boolean> {
    const pc: any = (duel as any).pendingChoice;
    if (!pc || Number(pc.userId) !== Number(bot.userId)) return false;
    const duelId = duel.id;

    const decision = this.botAi.decidePending(duel, bot.userId, bot.difficulty);
    if (decision?.skip) {
      // Preservar recurso: cancelar ativação sem auto-resolver efeito
      this.logger.log(`Bot ${bot.name} pending ${pc.type} → skip (${decision.reason})`);
      await this.act(duelId, client, 'CANCEL_CARD_ACTIVATION', {}, failureRef);
      if (failureRef.value) {
        failureRef.value = '';
        await this.duelService.clearPendingChoice?.(String(duelId), false);
      }
      return true;
    }
    if (!decision || decision.actionType === 'AUTO') {
      await this.gateway.autoResolvePendingChoice(String(duelId), bot.userId, pc);
      return true;
    }

    this.logger.log(`Bot ${bot.name} pending ${pc.type} → ${decision.reason}`);
    await this.act(duelId, client, decision.actionType, decision.actionData, failureRef);
    if (failureRef.value) {
      // Fallback legado para tipos conhecidos sem decisão estruturada
      if (pc.type === 'CONFISCATION' || pc.type === 'GRACEFUL_CHARITY' || pc.type === 'FORCEFUL_SENTRY') {
        failureRef.value = '';
        await this.gateway.autoResolvePendingChoice(String(duelId), bot.userId, pc);
        return true;
      }
      await this.gateway.autoResolvePendingChoice(String(duelId), bot.userId, pc);
    }
    return true;
  }

  private lpPair(duel: Duel, botUserId: number) {
    const isP1 = Number(duel.player1Id) === Number(botUserId);
    return {
      mine: Number(isP1 ? duel.player1LifePoints : duel.player2LifePoints) || 0,
      opp: Number(isP1 ? duel.player2LifePoints : duel.player1LifePoints) || 0,
    };
  }

  private async executeAction(
    bot: ManagedBot,
    duel: Duel,
    client: Socket,
    failureRef: { value: string },
    action: BotActionCandidate,
    source: string,
    reason: string,
  ): Promise<boolean> {
    this.logger.log(`Bot ${bot.name} [${bot.difficulty}/${source}] → ${action.label} (${reason})`);
    const before = this.lpPair(duel, bot.userId);

    if (action.actionType === 'NEXT_PHASE') {
      await this.gateway.handleNextPhase({ duelId: duel.id }, client);
      this.botAi.learnFromAction({
        duel,
        botUserId: bot.userId,
        difficulty: bot.difficulty,
        action,
        success: !failureRef.value,
        lpBefore: before,
        lpAfter: before,
      });
      return true;
    }
    if (action.actionType === 'END_TURN') {
      await this.gateway.handleEndTurn({ duelId: duel.id }, client);
      return true;
    }

    const ok = await this.act(duel.id, client, action.actionType, action.actionData, failureRef);

    // START_* só abre modal no frontend — bot completa com *_CHOICE na mesma jogada
    if (ok && !failureRef.value && (isMonsterEffectStart(action.actionType) || isSpecialSummonStart(action.actionType))) {
      const fresh =
        this.duelService.findDuelByIdLight?.(duel.id) ||
        (await this.duelService.findDuelByIdFromDatabase(duel.id, false)) ||
        duel;
      const choice = isMonsterEffectStart(action.actionType)
        ? buildMonsterEffectChoice(action.actionType, action.actionData || {}, fresh, bot.userId)
        : buildSpecialSummonChoice(action.actionType, action.actionData || {}, fresh, bot.userId);
      if (choice) {
        this.logger.log(`Bot ${bot.name} → completar ${choice.actionType}: ${choice.reason}`);
        failureRef.value = '';
        await this.act(duel.id, client, choice.actionType, choice.actionData, failureRef);
        if (failureRef.value) {
          this.logger.warn(
            `Bot ${bot.name} falhou CHOICE de ${action.actionType}: ${failureRef.value}`,
          );
        }
      } else {
        this.logger.warn(
          `Bot ${bot.name}: START ${action.actionType} ok mas sem alvo/condição para CHOICE`,
        );
      }
    } else if (ok && isMonsterEffectImmediate(action.actionType)) {
      this.logger.log(`Bot ${bot.name} → efeito imediato ${action.actionType} executado`);
    }

    // Sempre memória primeiro — force DB após jogada apagava cartas do debounce
    const afterDuel =
      this.duelService.findDuelByIdLight?.(duel.id) ||
      (await this.duelService.findDuelByIdFromDatabase(duel.id, false)) ||
      duel;
    const after = this.lpPair(afterDuel, bot.userId);
    this.botAi.learnFromAction({
      duel,
      botUserId: bot.userId,
      difficulty: bot.difficulty,
      action,
      success: ok && !failureRef.value,
      lpBefore: before,
      lpAfter: after,
    });
    return ok && !failureRef.value;
  }

  private turnBanKey(duelId: string | number, turnCounter: any, botUserId: number) {
    return `${duelId}:${turnCounter}:${botUserId}`;
  }

  private banAction(key: string, action: BotActionCandidate) {
    if (!this.bannedActions.has(key)) this.bannedActions.set(key, new Set());
    this.bannedActions.get(key)!.add(`${action.actionType}|${action.label}`);
  }

  private isBanned(key: string, action: BotActionCandidate): boolean {
    return this.bannedActions.get(key)?.has(`${action.actionType}|${action.label}`) === true;
  }

  /** Passa o turno de qualquer fase (MAIN1/BATTLE/MAIN2/END). */
  private async forcePassTurn(bot: ManagedBot, duelId: string | number, client: Socket, fromPhase: string) {
    this.logger.log(`Bot ${bot.name} → passando o turno (fase ${fromPhase})`);
    const failureRef = { value: '' };
    // NÃO limpar pending com restore aqui — isso devolvia/sumia cartas jogadas.
    // Só limpa se o pending for do próprio bot e estiver travado (sem auto-resolve).
    try {
      const live =
        this.duelService.findDuelByIdLight?.(duelId) ||
        (await this.duelService.findDuelByIdFromDatabase(duelId, false));
      const pc: any = (live as any)?.pendingChoice;
      if (pc && Number(pc.userId) === Number(bot.userId)) {
        await this.resolvePending(bot, live as Duel, client, failureRef);
      }
    } catch {
      /* ignore */
    }
    if (fromPhase === TurnPhase.MAIN2 || fromPhase === TurnPhase.END) {
      await this.gateway.handleEndTurn({ duelId }, client);
      return;
    }
    if (fromPhase === TurnPhase.BATTLE || fromPhase === TurnPhase.MAIN1) {
      await this.gateway.handleNextPhase({ duelId }, client);
      // Preferir memória — force DB apagava o campo do bot no mesmo turno
      const fresh =
        this.duelService.findDuelByIdLight?.(duelId) ||
        (await this.duelService.findDuelByIdFromDatabase(duelId, false));
      if (!fresh) return;
      const isP1 = Number(fresh.player1Id) === Number(bot.userId);
      if (Number(fresh.currentTurn) !== (isP1 ? 1 : 2)) return;
      if (fresh.currentPhase === TurnPhase.MAIN2 || fresh.currentPhase === TurnPhase.END) {
        await this.gateway.handleEndTurn({ duelId }, client);
      } else if (fresh.currentPhase === TurnPhase.BATTLE) {
        await this.gateway.handleNextPhase({ duelId }, client);
        const after =
          this.duelService.findDuelByIdLight?.(duelId) ||
          (await this.duelService.findDuelByIdFromDatabase(duelId, false));
        if (after && (after.currentPhase === TurnPhase.MAIN2 || after.currentPhase === TurnPhase.END)) {
          await this.gateway.handleEndTurn({ duelId }, client);
        }
      }
      return;
    }
    await this.gateway.handleEndTurn({ duelId }, client);
    void failureRef;
  }

  private async play(bot: ManagedBot, snapshot: Duel) {
    const isP1 = Number(snapshot.player1Id) === Number(bot.userId);
    const isMyTurn = Number(snapshot.currentTurn) === (isP1 ? 1 : 2);

    const phaseKey = `${snapshot.id}:${snapshot.turnCounter}:${snapshot.currentPhase}:${bot.userId}`;
    const attempts = this.phaseAttempts.get(phaseKey) || 0;
    const failureRef = { value: '' };
    const client = this.virtualClient(bot.userId, (reason) => {
      failureRef.value = reason;
    });
    const duelId = snapshot.id;

    // Preferir memória (campo com debounce); só DB se não houver cache
    let duel =
      this.duelService.findDuelByIdLight?.(duelId) ||
      (await this.duelService.findDuelByIdFromDatabase(duelId, false)) ||
      snapshot;

    // Pending do bot: pode ocorrer no turno do oponente
    if ((duel as any).pendingChoice && Number((duel as any).pendingChoice.userId) === Number(bot.userId)) {
      const pc = (duel as any).pendingChoice;
      const pendKey = `${duelId}:${pc.type}:${bot.userId}`;
      failureRef.value = '';
      await this.resolvePending(bot, duel, client, failureRef);
      if (failureRef.value) {
        const fails = (this.pendingFails.get(pendKey) || 0) + 1;
        this.pendingFails.set(pendKey, fails);
        this.logger.warn(
          `Bot ${bot.name} pending ${pc.type} falhou (${fails}/${this.MAX_PENDING_FAILS}): ${failureRef.value}`,
        );
        if (fails >= this.MAX_PENDING_FAILS) {
          // Cancelar só a ativação pendente (sem restore agressivo do campo inteiro)
          try {
            await this.act(duelId, client, 'CANCEL_CARD_ACTIVATION', {}, failureRef);
          } catch {
            /* ignore */
          }
          try {
            // restoreCardToSet=false evita devolver/sumir cartas já resolvidas no campo
            await this.duelService.clearPendingChoice?.(String(duelId), false);
          } catch {
            /* ignore */
          }
          this.pendingFails.delete(pendKey);
          this.logger.warn(`Bot ${bot.name}: pending ${pc.type} cancelado para continuar o turno`);
        }
      } else {
        this.pendingFails.delete(pendKey);
      }
      return;
    }

    // Turno do oponente: só pending do bot (acima). Respostas manuais de trap
    // ficam desligadas por enquanto — ativação falha sumia/cancelava cartas no campo.
    if (!isMyTurn) {
      return;
    }

    // MAIN2: no máximo 3 ações (setup) e passa o turno
    const maxAttempts =
      duel.currentPhase === TurnPhase.MAIN2 ? 3 : this.MAX_ATTEMPTS_PER_PHASE;
    if (attempts >= maxAttempts) {
      await this.forcePassTurn(bot, duelId, client, String(duel.currentPhase));
      return;
    }
    this.phaseAttempts.set(phaseKey, attempts + 1);

    if ((duel as any).pendingChoice) {
      // Escolha do oponente — esperar
      return;
    }

    if (duel.currentPhase === TurnPhase.DRAW) {
      const drawn = await this.duelService.processDrawPhase(duelId);
      if (drawn) {
        this.gateway.server.to('duel_' + duelId).emit('duelUpdate', {
          ...drawn,
          player1Field: (drawn as any).player1Field,
          player2Field: (drawn as any).player2Field,
        });
      }
      return;
    }

    if (duel.currentPhase === TurnPhase.STANDBY) {
      await this.gateway.handleNextPhase({ duelId }, client);
      return;
    }

    if (
      duel.currentPhase === TurnPhase.MAIN1 ||
      duel.currentPhase === TurnPhase.BATTLE ||
      duel.currentPhase === TurnPhase.MAIN2
    ) {
      const banKey = this.turnBanKey(duelId, duel.turnCounter, bot.userId);
      const decision = await this.botAi.decide(duel, bot.userId, bot.difficulty);

      // Mesma jogada de novo = loop → passa o turno
      if (decision && this.isBanned(banKey, decision.action)) {
        this.logger.log(`Bot ${bot.name}: loop detectado (${decision.action.label}), passando o turno`);
        await this.forcePassTurn(bot, duelId, client, String(duel.currentPhase));
        return;
      }

      if (!decision || decision.action.actionType === 'END_TURN') {
        await this.forcePassTurn(bot, duelId, client, String(duel.currentPhase));
        return;
      }

      await this.executeAction(
        bot,
        duel,
        client,
        failureRef,
        decision.action,
        decision.source,
        decision.reason,
      );

      // Marca a ação (mesmo com sucesso) para não repetir no próximo tick
      if (decision.action.category !== 'attack') {
        this.banAction(banKey, decision.action);
      } else if (failureRef.value) {
        this.banAction(banKey, decision.action);
      }

      if (failureRef.value && duel.currentPhase === TurnPhase.MAIN2) {
        await this.forcePassTurn(bot, duelId, client, TurnPhase.MAIN2);
      }
      return;
    }

    if (duel.currentPhase === TurnPhase.END) {
      await this.forcePassTurn(bot, duelId, client, TurnPhase.END);
    }
  }
}
