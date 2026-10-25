import { randomUUID } from 'crypto';
import type { Duel } from '../../../entities/duel.entity';

export interface InteractiveChain {
  id: string;
  revision: number;
  priority: number;
  passes: number;
  status: 'responding' | 'resolving' | 'choice' | 'failed';
  deadline: number;
  inFlight?: { userId: number; card: any; zoneIndex: number };
  links: Array<{ userId: number; card: any; zoneIndex: number }>;
}

// Only effects whose activation costs/targets are completely described here may respond.
// Targeted effects must not be offered until their activation adapter is implemented.
const responses = new Set(['waboku', 'jarofgreed']);
const starters = new Set([...responses, 'gracefulcharity', 'potofgreed', 'upstartgoblin', 'hinotama',
  'raigeki', 'darkhole', 'heavystorm', 'harpiesfeatherduster', 'carddestruction']);
const key = (card: any) => String(card?.name || card?.cardName || card?.idCarta || '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
export const canStartInteractiveChain = (card: any) => starters.has(key(card));

export function chainResponses(duel: Duel, userId: number, host: any): number[] {
  if (![Number(duel.player1Id), Number(duel.player2Id)].includes(Number(userId))) return [];
  const isP1 = Number(duel.player1Id) === Number(userId);
  if (host.isJinzoOnField(duel) || host.isMirageDragonBlockingTraps(duel, isP1)) return [];
  const field = isP1 ? duel.player1Field : duel.player2Field;
  return (field?.spellTrap || []).flatMap((card: any, index: number) =>
    card && responses.has(key(card)) && card.position === 'set' &&
    Number.isInteger(card.trapSetTurnCounter) && card.trapSetTurnCounter < (duel.turnCounter || 1)
      ? [index] : []);
}

export class InteractiveChainController {
  constructor(private readonly host: any) {}
  private opponent(duel: Duel, userId: number): number {
    return Number(duel.player1Id) === Number(userId) ? Number(duel.player2Id) : Number(duel.player1Id);
  }
  private async save(duel: Duel) {
    await this.host.updateDuelInDatabase(duel.id, {
      chainState: duel.chainState,
      player1Field: duel.player1Field, player2Field: duel.player2Field,
    }, { immediate: true });
  }
  async open(duel: Duel, userId: number, card: any, zoneIndex: number) {
    if (duel.status !== 'IN_PROGRESS') throw new Error('Duelo não está em andamento');
    if (duel.chainState || duel.pendingChoice) throw new Error('Há uma resolução pendente');
    duel.chainState = { id: randomUUID(), revision: 0, priority: this.opponent(duel, userId),
      passes: 0, status: 'responding', deadline: Date.now() + 30000, links: [{ userId: Number(userId), card: { ...card }, zoneIndex }] };
    await this.save(duel);
  }
  async act(duel: Duel, userId: number, input: { id: string; revision: number; zoneIndex?: number }) {
    const chain = duel.chainState;
    if (duel.status !== 'IN_PROGRESS' || !chain || chain.status !== 'responding' || chain.priority !== Number(userId) ||
        chain.id !== input.id || chain.revision !== input.revision) {
      throw new Error('Resposta fora de prioridade ou chain desatualizada');
    }
    if (input.zoneIndex !== undefined) {
      if (!chainResponses(duel, userId, this.host).includes(input.zoneIndex)) {
        throw new Error('Esta carta não pode responder à chain');
      }
      const field = Number(duel.player1Id) === Number(userId) ? duel.player1Field : duel.player2Field;
      const card = field.spellTrap[input.zoneIndex];
      card.position = 'face-up';
      chain.links.push({ userId: Number(userId), card: { ...card }, zoneIndex: input.zoneIndex });
      chain.passes = 0;
    } else chain.passes++;
    chain.revision++;
    chain.deadline = Date.now() + 30000;
    chain.priority = this.opponent(duel, userId);
    if (chain.passes === 2) chain.status = 'resolving';
    await this.save(duel);
    if (chain.status === 'resolving') await this.resume(duel);
  }
  async resume(duel: Duel) {
    let chain = duel.chainState;
    if (!chain || chain.status === 'responding' || chain.status === 'failed' || chain.inFlight || duel.pendingChoice) return;
    chain.status = 'resolving';
    while (chain.links.length) {
      // Keep an execution marker across failures; never silently replay a partially applied effect.
      const link = chain.links.pop()!;
      chain.revision++;
      chain.inFlight = link;
      await this.save(duel);
      try {
        await this.host.resolveInteractiveLink(duel, link);
      } catch (error) {
        chain.status = 'failed';
        await this.host.updateDuelInDatabase(duel.id, { chainState: chain }, { immediate: true });
        throw error;
      }
      delete chain.inFlight;
      duel = await this.host.findDuelByIdFromDatabase(String(duel.id), false);
      duel.chainState = chain;
      if (duel.status !== 'IN_PROGRESS') {
        duel.chainState = null;
        await this.save(duel);
        return;
      }
      if (duel.pendingChoice) {
        chain.status = 'choice';
        await this.save(duel);
        return;
      }
    }
    duel.chainState = null;
    await this.save(duel);
  }
}
