import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processLightningStormChoice(host: DuelsService, duelId: string | number, userId: number, effect: 'destroy_attack_monsters' | 'destroy_spells_traps'): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    const pendingChoice = (duel as any).pendingChoice;
    if (!pendingChoice || pendingChoice.type !== 'LIGHTNING_STORM' || pendingChoice.userId !== userId) {
      return { success: false, message: 'Escolha de Lightning Storm inválida ou expirada' };
    }
    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;
    let playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const turnCounter = (duel as any).turnCounter ?? 1;

    const data = pendingChoice.data || {};
    let lightningStorm: any = null;
    let cardWasOnField = !!data.cardWasOnField;

    if (!cardWasOnField) {
      const handIndex = playerField.hand.findIndex((c: any) => {
        if (data.cardInstanceId && c.instanceId) return c.instanceId === data.cardInstanceId;
        const cId = c.idCarta || c.id || c.cardId;
        return cId === data.cardId;
      });
      if (handIndex !== -1) {
        lightningStorm = playerField.hand[handIndex];
        playerField.hand.splice(handIndex, 1);
      }
    } else {
      const zoneIndex = data.zoneIndex;
      if (zoneIndex != null && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
        lightningStorm = playerField.spellTrap[zoneIndex];
        playerField.spellTrap[zoneIndex] = null;
      }
    }

    if (!lightningStorm) {
      if (playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
        for (let i = 0; i < playerField.spellTrap.length; i++) {
          const card = playerField.spellTrap[i];
          if (card && (host['isExactCard'](card, 'LightningStorm') || (card.name || card.cardName || '').toLowerCase().includes('lightning storm'))) {
            lightningStorm = card;
            playerField.spellTrap[i] = null;
            cardWasOnField = true;
            break;
          }
        }
      }
    }
    if (!lightningStorm) {
      return { success: false, message: 'Lightning Storm não encontrada' };
    }

    if (!playerField.graveyard) playerField.graveyard = [];
    playerField.graveyard.push(lightningStorm);

    playerField.lightningStormActivatedTurn = turnCounter;

    if (effect === 'destroy_attack_monsters' && opponentField?.monsters) {
      for (let i = 0; i < opponentField.monsters.length; i++) {
        const m = opponentField.monsters[i];
        if (m && (m.position === 'attack' || !m.position)) {
          const ownerField = host['getOwnerFieldForMonster'](duel, m, !isPlayer1);
          if (!ownerField.graveyard) ownerField.graveyard = [];
          ownerField.graveyard.push(m);
          opponentField.monsters[i] = null;
          logger.info(`✅ [processLightningStormChoice] Monstro em ataque destruído: ${m.name || m.cardName}`);
        }
      }
    }
    if (effect === 'destroy_spells_traps' && opponentField?.spellTrap) {
      for (let i = 0; i < opponentField.spellTrap.length; i++) {
        if (!opponentField.spellTrap[i]) continue;
        await host['onSpellTrapRemovedFromField'](duelIdStr, duel, !isPlayer1, i);
        if (opponentField.spellTrap[i]) {
          const ownerField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
          if (!ownerField.graveyard) ownerField.graveyard = [];
          ownerField.graveyard.push(opponentField.spellTrap[i]);
          opponentField.spellTrap[i] = null;
          logger.info(`✅ [processLightningStormChoice] Magia/Armadilha destruída`);
        }
      }
    }

    await host['clearPendingChoice'](duelId);
    if (isPlayer1) {
      (duel as any).player1Field = playerField;
      (duel as any).player2Field = opponentField;
    } else {
      (duel as any).player1Field = opponentField;
      (duel as any).player2Field = playerField;
    }
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);
    logger.info(`✅ [processLightningStormChoice] Efeito processado: ${effect}`);
    return { success: true };
  }
