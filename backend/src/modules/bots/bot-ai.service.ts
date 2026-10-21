import { Injectable, Logger } from '@nestjs/common';
import { BotDifficulty } from './entities/managed-bot.entity';
import { BotActionCandidate, BotAiDecision } from './bot-action.types';
import { BotExperienceService } from './bot-experience.service';
import { buildLegalActions, compactDuelState, situationKey } from './bot-legal-actions';
import { scoreLegalActions, difficultyProfile } from './bot-strategy';
import { getDeckProfile } from './bot-deck-profile';
import { detectCombos } from './bot-combo';
import {
  buildOpponentTurnResponses,
  decidePendingChoice,
  scoreManualResponse,
} from './bot-response';

/**
 * Cérebro estratégico: ações legais → avaliação/combos/perfil de deck →
 * escolha por dificuldade (+ LLM opcional + memória).
 */
@Injectable()
export class BotAiService {
  private readonly logger = new Logger(BotAiService.name);

  constructor(private readonly experience: BotExperienceService) {}

  isLlmEnabled(): boolean {
    const key = (process.env.BOT_AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    const flag = (process.env.BOT_AI_ENABLED || 'true').toLowerCase();
    return !!key && flag !== 'false' && flag !== '0';
  }

  private apiConfig() {
    const apiKey = (process.env.BOT_AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    const baseUrl = (process.env.BOT_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = process.env.BOT_AI_MODEL || 'gpt-4o-mini';
    return { apiKey, baseUrl, model };
  }

  /** Decisão de alvo/opção para pendingChoice. */
  decidePending(duel: any, botUserId: number, difficulty: BotDifficulty) {
    return decidePendingChoice(duel, botUserId, difficulty);
  }

  /**
   * No turno do oponente: avalia traps manuais (ex. Ring) e retorna a melhor, se valer.
   */
  async decideResponse(
    duel: any,
    botUserId: number,
    difficulty: BotDifficulty,
  ): Promise<BotAiDecision | null> {
    const candidates = buildOpponentTurnResponses(duel, botUserId);
    if (!candidates.length) return null;
    const p = difficultyProfile(difficulty);
    let best: BotAiDecision | null = null;
    let bestScore = 40; // limiar: só responde se ameaça relevante
    for (const action of candidates) {
      const card = {
        name: action.actionData.cardName,
        idCarta: action.actionData.cardId,
      };
      const { score, reason } = scoreManualResponse(card, duel, botUserId, difficulty);
      const adjusted = score * (0.8 + 0.2 * p.skill);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        best = { action, reason, source: 'heuristic' };
      }
    }
    return best;
  }

  async decide(duel: any, botUserId: number, difficulty: BotDifficulty): Promise<BotAiDecision | null> {
    const legal = buildLegalActions(duel, botUserId);
    if (!legal.length) return null;

    const deck = getDeckProfile(duel, botUserId);
    const combos = detectCombos(duel, botUserId, legal);
    if (combos[0] && difficulty !== BotDifficulty.EASY) {
      this.logger.debug(
        `Bot ${botUserId} deck=${deck.style} combo="${combos[0].label}" (${combos.length} linhas)`,
      );
    }

    // Sempre calcula a melhor jogada estratégica (nível humano offline)
    const strategic = this.decideHeuristic(duel, botUserId, difficulty, legal);

    if (this.isLlmEnabled()) {
      try {
        const llm = await this.decideWithLlm(duel, botUserId, difficulty, legal, strategic);
        if (llm) return llm;
      } catch (e) {
        this.logger.warn('LLM falhou, usando estratégia humana: ' + String(e));
      }
    }

    return strategic;
  }

  private decideHeuristic(
    duel: any,
    botUserId: number,
    difficulty: BotDifficulty,
    legal: BotActionCandidate[],
  ): BotAiDecision | null {
    const sit = situationKey(duel, botUserId);
    const lessons = this.experience.recall(sit, 10);
    const scored = scoreLegalActions(duel, botUserId, difficulty, legal, lessons);
    if (!scored) {
      const phase = legal.find((a) => a.category === 'phase');
      return phase ? { action: phase, reason: 'fallback phase', source: 'heuristic' } : null;
    }
    const fromMemory = lessons.some(
      (l) => l.actionType === scored.action.actionType && l.label === scored.action.label,
    );
    return {
      action: scored.action,
      reason: scored.reason,
      source: fromMemory ? 'memory' : 'heuristic',
    };
  }

  private async decideWithLlm(
    duel: any,
    botUserId: number,
    difficulty: BotDifficulty,
    legal: BotActionCandidate[],
    hint: BotAiDecision | null,
  ): Promise<BotAiDecision | null> {
    const { apiKey, baseUrl, model } = this.apiConfig();
    const state = compactDuelState(duel, botUserId);
    const sit = situationKey(duel, botUserId);
    const lessons = this.experience.recall(sit, 8);

    const deck = getDeckProfile(duel, botUserId);
    const combos = detectCombos(duel, botUserId, legal);
    const system = [
      'You are a top-level human Yu-Gi-Oh! duelist (GOAT/Edison-style fundamentals).',
      'Choose exactly ONE action from legalActions by its id. Never invent ids.',
      'Priority order:',
      '1) Lethal / win this turn (burn, direct, clear then direct).',
      '2) Execute detected combos in the correct order (draw/search before committing resources).',
      '3) Use monster effects / spells that remove real threats when conditions are met.',
      '4) Summon the best beater or set if you cannot win trades.',
      '5) Set traps in MAIN2; preserve high-value answers when threat is low.',
      '6) Attack only profitable trades; avoid suicide into stronger ATK unless desperation.',
      'Do not advance phase while a clearly better spell/effect is still available.',
      `Difficulty ${difficulty}: play more optimally at HARD/EXPERT.`,
      `Deck style: ${deck.style}. Win conditions: ${deck.winConditions.join('; ')}.`,
      'Reply ONLY JSON: {"actionId":"...","reason":"..."}',
    ].join(' ');

    const userPayload = {
      state,
      deckProfile: { style: deck.style, keyCards: deck.keyCards.slice(0, 5), summary: deck.summary },
      combos: combos.slice(0, 4).map((c) => ({ id: c.id, label: c.label, priority: c.priority })),
      engineHint: hint
        ? { actionId: hint.action.id, label: hint.action.label, reason: hint.reason }
        : null,
      legalActions: legal.map((a) => ({
        id: a.id,
        category: a.category,
        label: a.label,
        actionType: a.actionType,
      })),
      lessonsFromPastWins: lessons.map((l) => ({
        label: l.label,
        actionType: l.actionType,
        reward: l.reward,
      })),
    };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: difficulty === BotDifficulty.EASY ? 0.8 : difficulty === BotDifficulty.EXPERT ? 0.2 : 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = String(content).match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const actionId = String(parsed.actionId || parsed.id || '');
    const action = legal.find((a) => a.id === actionId);
    if (!action) {
      this.logger.warn(`LLM retornou actionId inválido: ${actionId}`);
      return null;
    }

    this.logger.log(`LLM escolheu [${action.category}] ${action.label} — ${parsed.reason || ''}`);
    return {
      action,
      reason: String(parsed.reason || 'llm'),
      source: 'llm',
    };
  }

  /** Recompensa após ação bem-sucedida (aprendizado). */
  learnFromAction(opts: {
    duel: any;
    botUserId: number;
    difficulty: string;
    action: BotActionCandidate;
    success: boolean;
    lpBefore?: { mine: number; opp: number };
    lpAfter?: { mine: number; opp: number };
  }) {
    if (!opts.success) return;
    let reward = 1;
    if (opts.action.category === 'monster_effect') reward += 3;
    if (opts.action.category === 'spell') reward += 2;
    if (opts.action.category === 'attack') reward += 2;
    if (opts.action.category === 'trap') reward += 1.5;
    if (opts.lpBefore && opts.lpAfter) {
      const dmg = opts.lpBefore.opp - opts.lpAfter.opp;
      const self = opts.lpBefore.mine - opts.lpAfter.mine;
      if (dmg > 0) reward += Math.min(20, dmg / 200);
      if (self > 0) reward -= Math.min(10, self / 400);
      if (opts.lpAfter.opp <= 0) reward += 50;
    }
    this.experience.remember({
      situationKey: situationKey(opts.duel, opts.botUserId),
      actionType: opts.action.actionType,
      actionData: opts.action.actionData,
      label: opts.action.label,
      reward,
      difficulty: opts.difficulty,
    });
  }
}
