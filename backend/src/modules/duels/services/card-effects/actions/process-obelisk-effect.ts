import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processObeliskEffect(host: DuelsService, duelId: string | number, userId: number, sacrificeZoneIndices: [number, number]): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const turnCounter = (duel as any).turnCounter ?? 1;
    const isPlayer1 = Number((duel as any).player1Id) === Number(userId);
    // currentTurn é 1 ou 2 (jogador 1 ou 2), não o ID do jogador
    const currentTurnNum = Number((duel as any).currentTurn);
    const isMyTurn = (isPlayer1 && currentTurnNum === 1) || (!isPlayer1 && currentTurnNum === 2);
    if (!isMyTurn) {
      return { success: false, message: 'Só pode usar o efeito do Obelisk no seu turno' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    if (!playerField?.monsters || !opponentField?.monsters) {
      return { success: false, message: 'Campo inválido' };
    }

    const obeliskIndex = playerField.monsters.findIndex((m: any) => m && host['isObeliskTheTormentor'](m));
    if (obeliskIndex === -1) {
      return { success: false, message: 'Obelisk the Tormentor não está no seu campo' };
    }
    if (playerField.obeliskEffectUsedTurn === turnCounter) {
      return { success: false, message: 'O efeito do Obelisk já foi usado neste turno' };
    }

    const [z1, z2] = sacrificeZoneIndices;
    if (z1 === z2 || z1 < 0 || z1 >= 5 || z2 < 0 || z2 >= 5) {
      return { success: false, message: 'Escolha 2 zonas de monstros diferentes (0-4)' };
    }
    const m1 = playerField.monsters[z1];
    const m2 = playerField.monsters[z2];
    if (!m1 || !m2) {
      return { success: false, message: 'As duas zonas devem ter um monstro' };
    }

    // 1) Destruir os 2 monstros escolhidos (do seu campo)
    for (const zoneIndex of [z1, z2]) {
      const monster = playerField.monsters[zoneIndex];
      if (monster) {
        await host['handleEquipmentDestruction'](duelId, duel, isPlayer1, monster);
        const ownerField = host['getOwnerFieldForMonster'](duel, monster, isPlayer1);
        if (!ownerField.graveyard) ownerField.graveyard = [];
        ownerField.graveyard.push(monster);
        playerField.monsters[zoneIndex] = null;
      }
    }

    // 2) Destruir TODOS os monstros do oponente (obrigatório do efeito do Obelisk)
    const opponentMonstersArray = opponentField.monsters || [];
    let opponentDestroyedCount = 0;
    for (let i = 0; i < opponentMonstersArray.length; i++) {
      const monster = opponentMonstersArray[i];
      if (monster) {
        await host['handleEquipmentDestruction'](duelId, duel, !isPlayer1, monster);
        const ownerField = host['getOwnerFieldForMonster'](duel, monster, !isPlayer1);
        if (!ownerField.graveyard) ownerField.graveyard = [];
        ownerField.graveyard.push(monster);
        opponentField.monsters[i] = null;
        opponentDestroyedCount++;
      }
    }
    logger.info(`✅ [processObeliskEffect] Monstros do oponente destruídos: ${opponentDestroyedCount}`);

    playerField.obeliskEffectUsedTurn = turnCounter;
    await host['recalculateUnitedWeStandForBothPlayers'](duelId, duel);
    await host['recalculateMagePowerAtk'](duelId, duel, isPlayer1);
    await host['recalculateMagePowerAtk'](duelId, duel, !isPlayer1);

    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    } as any);
    host['activeDuels'].set(duelIdStr, duel);
    logger.info(`✅ [processObeliskEffect] Efeito do Obelisk aplicado: 2 monstros seus + ${opponentDestroyedCount} do oponente destruídos`);
    return { success: true };
  }
