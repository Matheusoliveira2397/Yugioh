import type { DuelsService } from '../../../duels.service';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered choice; public API remains on DuelsService. */
export async function processAutonomousActionUnitChoice(host: DuelsService, duelId: string | number, userId: number, chosenMonsterIndex: number): Promise<{ success: boolean; message?: string }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    const duel = await host['findDuelByIdFromDatabase'](duelIdStr, true);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }
    const pendingChoice = (duel as any).pendingChoice;
    if (!pendingChoice || pendingChoice.type !== 'AUTONOMOUS_ACTION_UNIT' || pendingChoice.userId !== userId) {
      return { success: false, message: 'Escolha pendente inválida' };
    }
    const data = pendingChoice.data || {};
    const spellTrapZoneIndex = data.spellTrapZoneIndex;
    const opponentGraveyardList = data.opponentGraveyard;
    if (spellTrapZoneIndex === undefined || spellTrapZoneIndex === null || !Array.isArray(opponentGraveyardList)) {
      return { success: false, message: 'Dados da Autonomous Action Unit inválidos' };
    }
    if (chosenMonsterIndex < 0 || chosenMonsterIndex >= opponentGraveyardList.length) {
      return { success: false, message: 'Monstro selecionado inválido' };
    }
    const isPlayer1 = Number(duel.player1Id) === Number(userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    if (!playerField) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }
    if (!Array.isArray(playerField.monsters) || playerField.monsters.length < 5) {
      playerField.monsters = Array.isArray(playerField.monsters)
        ? [...playerField.monsters]
        : [null, null, null, null, null];
      while (playerField.monsters.length < 5) playerField.monsters.push(null);
      playerField.monsters = playerField.monsters.slice(0, 5);
    }
    const opponentGraveyard = opponentField?.graveyard || [];
    const opponentMonsters = opponentGraveyard.filter((c: any) => (c.type || c.cardType) === 'Monster');
    if (chosenMonsterIndex >= opponentMonsters.length) {
      return { success: false, message: 'Monstro não encontrado no cemitério do oponente' };
    }
    let realIndex = -1;
    let monsterCount = 0;
    for (let i = 0; i < opponentGraveyard.length; i++) {
      const card = opponentGraveyard[i];
      if ((card.type || card.cardType) === 'Monster') {
        if (monsterCount === chosenMonsterIndex) {
          realIndex = i;
          break;
        }
        monsterCount++;
      }
    }
    if (realIndex === -1) {
      return { success: false, message: 'Monstro não encontrado no cemitério' };
    }
    const monsterToRevive = opponentGraveyard.splice(realIndex, 1)[0];
    const emptyMonsterZone = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyMonsterZone === -1) {
      opponentGraveyard.push(monsterToRevive);
      return { success: false, message: 'Não há espaço no campo para invocar o monstro' };
    }
    const cardInstanceId = (data.cardInstanceId || data.cardData?.instanceId || `card_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    const equipRef = `AutonomousActionUnit:${spellTrapZoneIndex}`;
    const { equipmentBonusAtk, equipmentBonusDef, equippedCards, equippedCardId, equippedSpellTrapZoneIndex, equippedBy, equippedZoneIndex, ...monsterBase } = monsterToRevive;
    const currentTurnCounter = playerField?.turnCounter || (duel as any).turnCounter || 1;
    // Dono original = oponente (monstro veio do cemitério dele); quando AAU for destruída, monstro vai ao cemitério do dono original
    const originalOwner = isPlayer1 ? 2 : 1;
    playerField.monsters[emptyMonsterZone] = {
      ...monsterBase,
      position: 'attack',
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      originalOwner,
      equippedBy: 'AutonomousActionUnit',
      equippedCardId: 'AutonomousActionUnit',
      equippedSpellTrapZoneIndex: spellTrapZoneIndex,
      equippedZoneIndex: spellTrapZoneIndex,
      equippedCards: [equipRef],
    };
    const equipCard = playerField.spellTrap && playerField.spellTrap[spellTrapZoneIndex];
    if (equipCard) {
      equipCard.equippedToMonsterZoneIndex = emptyMonsterZone;
    }
    (duel as any).pendingChoice = null;
    host['activeDuels'].set(duelIdStr, duel);
    await host['applySliferEffectOnOpponentSummon'](duelId, duel, isPlayer1, emptyMonsterZone);
    await host['updateDuelInDatabase'](duelId, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      pendingChoice: null,
    } as any);
    await host['recalculateUnitedWeStandForBothPlayers'](duelId, duel);
    logger.info(`✅ [processAutonomousActionUnitChoice] Monstro ${monsterToRevive.name || monsterToRevive.cardName} revivido no campo do jogador e equipado com Autonomous Action Unit`);
    return { success: true };
  }
