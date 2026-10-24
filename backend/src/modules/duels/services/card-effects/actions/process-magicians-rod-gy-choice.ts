import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';
import * as Dmoc from '../effects/Monsters/dark-magician-of-chaos';
import * as MagiciansRod from '../effects/Monsters/magicians-rod';

/** Registered choice; public API remains on DuelsService. */
export async function processMagiciansRodGyChoice(host: DuelsService, duelId: string | number, userId: number, tributeZoneIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = host['activeDuels'].get(duelIdStr) || (await host['findDuelByIdFromDatabase'](duelIdStr));
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const pending = (duel as any).pendingChoice;
    if (!pending || pending.type !== 'MAGICIAN_S_ROD_GY' || Number(pending.userId) !== Number(userId)) {
      return { success: false, message: 'Escolha inválida' };
    }

    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const gyIndex = pending.data?.graveyardIndex;
    const gy = playerField.graveyard || [];
    if (gyIndex == null || gyIndex < 0 || gyIndex >= gy.length || !MagiciansRod.isMagiciansRod(gy[gyIndex])) {
      // Rod pode ter mudado de índice — procurar de novo
      const found = MagiciansRod.findMagiciansRodInGraveyard(gy);
      if (!found) {
        await host['clearPendingChoice'](duelIdStr, false);
        return { success: false, message: "Magician's Rod não está no cemitério" };
      }
      pending.data.graveyardIndex = found.index;
    }

    const tribute = playerField.monsters?.[tributeZoneIndex];
    if (!tribute || !MagiciansRod.isSpellcasterMonster(tribute)) {
      return { success: false, message: 'Tributo inválido (precisa ser monstro Mago)' };
    }

    // Tributar
    await host['handleEquipmentDestruction'](duelId, duel, isPlayer1, tribute);
    playerField.monsters[tributeZoneIndex] = null;
    host['sendMonsterLeavingField'](duel, tribute, isPlayer1);

    // Adicionar Rod à mão (rebuscar índice após possível mudança no GY)
    const rodFound = MagiciansRod.findMagiciansRodInGraveyard(playerField.graveyard);
    if (!rodFound) {
      await host['clearPendingChoice'](duelIdStr, false);
      return { success: false, message: "Magician's Rod não está no cemitério" };
    }
    const [rod] = playerField.graveyard.splice(rodFound.index, 1);
    if (!playerField.hand) playerField.hand = [];
    playerField.hand.push(rod);

    const turnCounter = Dmoc.getDuelTurnCounter(duel);
    MagiciansRod.markRodGyUsed(playerField, turnCounter);

    await host['clearPendingChoice'](duelIdStr, false);
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);
    await host['recalculateUnitedWeStandForBothPlayers'](duelId, duel);

    logger.info(`🪄 [Magician's Rod] reciclado à mão (tributo zona ${tributeZoneIndex})`);
    return { success: true, message: "Magician's Rod adicionado à mão" };
  }
