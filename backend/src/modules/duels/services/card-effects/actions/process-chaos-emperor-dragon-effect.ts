import type { DuelsService } from '../../../duels.service';
import { DuelResult, TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function processChaosEmperorDragonEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; damage?: number }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    // Buscar duelo do banco
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) {
      return { success: false, message: 'Duelo não encontrado' };
    }

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;

    // Verificar se é o turno do jogador
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser usado em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode usar este efeito nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se o Chaos Emperor Dragon existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do Chaos Emperor Dragon inválida' };
    }

    const chaosEmperorDragon = playerField.monsters[monsterZoneIndex];
    if (!chaosEmperorDragon || chaosEmperorDragon === null) {
      return { success: false, message: 'Chaos Emperor Dragon não encontrado no campo' };
    }

    // Verificar se é realmente Chaos Emperor Dragon
    const cardId = chaosEmperorDragon.idCarta || chaosEmperorDragon.id || chaosEmperorDragon.cardId;
    const cardName = (chaosEmperorDragon.name || chaosEmperorDragon.cardName || '').toLowerCase();
    const isChaosEmperorDragon = cardId === 'ChaosEmperorDragon' ||
                                 cardId === 'chaosemperordragon' ||
                                 cardId === 'Chaos-EmperorDragon' ||
                                 cardId === 'ChaosEmperor-Dragon' ||
                                 cardName === 'chaos emperor dragon' ||
                                 cardName === 'chaos-emperor dragon' ||
                                 cardName === 'chaosemperordragon' ||
                                 (typeof cardId === 'string' && cardId.toLowerCase().includes('chaosemperordragon')) ||
                                 (typeof cardName === 'string' && cardName.includes('chaos emperor dragon'));

    if (!isChaosEmperorDragon) {
      return { success: false, message: 'Carta não é Chaos Emperor Dragon' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (chaosEmperorDragon.effectUsedThisTurn === true) {
      return { success: false, message: 'Você já usou o efeito do Chaos Emperor Dragon neste turno' };
    }

    // Verificar se o jogador tem pelo menos 1000 LP (permitir quando LP >= 1000)
    const playerLifePoints = Number(isPlayer1 ? duel.player1LifePoints : duel.player2LifePoints);
    if (playerLifePoints < 1000) {
      return { success: false, message: 'Você precisa ter pelo menos 1000 LP para ativar este efeito' };
    }

    logger.info(`💥 [processChaosEmperorDragonEffect] Ativando efeito do Chaos Emperor Dragon`);

    // Contar cartas antes de descartar
    let totalCardsDiscarded = 0;

    // Descartar todas as cartas do campo do jogador (monstros) — cada um vai para o cemitério do DONO ORIGINAL
    if (playerField.monsters && Array.isArray(playerField.monsters)) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        const monster = playerField.monsters[i];
        if (monster && monster !== null) {
          await host['handleEquipmentDestruction'](duelId, duel, isPlayer1, monster);
          const ownerFieldFJ1 = host['getOwnerFieldForMonster'](duel, monster, isPlayer1);
          if (!ownerFieldFJ1.graveyard) ownerFieldFJ1.graveyard = [];
          ownerFieldFJ1.graveyard.push(monster);
          playerField.monsters[i] = null;
          totalCardsDiscarded++;
        }
      }
    }

    // Descartar todas as cartas do campo do jogador (spell/trap)
    if (playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
      for (let i = 0; i < playerField.spellTrap.length; i++) {
        if (!playerField.spellTrap[i]) continue;
        await host['onSpellTrapRemovedFromField'](duelId, duel, isPlayer1, i);
        if (playerField.spellTrap[i]) {
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(playerField.spellTrap[i]);
          playerField.spellTrap[i] = null;
          totalCardsDiscarded++;
        }
      }
    }

    // Descartar todas as cartas do campo do jogador (field spell)
    if (playerField.field && playerField.field !== null) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.field);
      playerField.field = null;
      totalCardsDiscarded++;
    }

    // Descartar todas as cartas da mão do jogador
    if (playerField.hand && Array.isArray(playerField.hand)) {
      while (playerField.hand.length > 0) {
        const card = playerField.hand.shift();
        if (card) {
          if (!playerField.graveyard) playerField.graveyard = [];
          playerField.graveyard.push(card);
          totalCardsDiscarded++;
        }
      }
    }

    // Descartar todas as cartas do campo do oponente (monstros) — cada um vai para o cemitério do DONO ORIGINAL
    if (opponentField && opponentField.monsters && Array.isArray(opponentField.monsters)) {
      for (let i = 0; i < opponentField.monsters.length; i++) {
        const monster = opponentField.monsters[i];
        if (monster && monster !== null) {
          await host['handleEquipmentDestruction'](duelId, duel, !isPlayer1, monster);
          const ownerFieldFJ2 = host['getOwnerFieldForMonster'](duel, monster, !isPlayer1);
          if (!ownerFieldFJ2.graveyard) ownerFieldFJ2.graveyard = [];
          ownerFieldFJ2.graveyard.push(monster);
          opponentField.monsters[i] = null;
          totalCardsDiscarded++;
        }
      }
    }

    // Descartar todas as cartas do campo do oponente (spell/trap)
    if (opponentField && opponentField.spellTrap && Array.isArray(opponentField.spellTrap)) {
      for (let i = 0; i < opponentField.spellTrap.length; i++) {
        if (!opponentField.spellTrap[i]) continue;
        await host['onSpellTrapRemovedFromField'](duelId, duel, !isPlayer1, i);
        if (opponentField.spellTrap[i]) {
          if (!opponentField.graveyard) opponentField.graveyard = [];
          opponentField.graveyard.push(opponentField.spellTrap[i]);
          opponentField.spellTrap[i] = null;
          totalCardsDiscarded++;
        }
      }
    }

    // Descartar todas as cartas do campo do oponente (field spell)
    if (opponentField && opponentField.field && opponentField.field !== null) {
      if (!opponentField.graveyard) opponentField.graveyard = [];
      opponentField.graveyard.push(opponentField.field);
      opponentField.field = null;
      totalCardsDiscarded++;
    }

    // Descartar todas as cartas da mão do oponente
    if (opponentField && opponentField.hand && Array.isArray(opponentField.hand)) {
      while (opponentField.hand.length > 0) {
        const card = opponentField.hand.shift();
        if (card) {
          if (!opponentField.graveyard) opponentField.graveyard = [];
          opponentField.graveyard.push(card);
          totalCardsDiscarded++;
        }
      }
    }

    // Pagar 1000 LP
    const newPlayerLifePoints = Math.max(0, playerLifePoints - 1000);
    if (isPlayer1) {
      duel.player1LifePoints = newPlayerLifePoints;
    } else {
      duel.player2LifePoints = newPlayerLifePoints;
    }

    // O oponente perde 300 LP por cada carta enviada
    const opponentDamage = totalCardsDiscarded * 300;
    const opponentLifePoints = isPlayer1 ? duel.player2LifePoints : duel.player1LifePoints;
    const newOpponentLifePoints = Math.max(0, opponentLifePoints - opponentDamage);

    if (isPlayer1) {
      duel.player2LifePoints = newOpponentLifePoints;
    } else {
      duel.player1LifePoints = newOpponentLifePoints;
    }

    // Verificar se o oponente perdeu
    if (newOpponentLifePoints <= 0) {
      await host['finishDuel'](duelId, isPlayer1 ? DuelResult.PLAYER1_WIN : DuelResult.PLAYER2_WIN, userId);
    }

    // Marcar que o efeito foi usado neste turno
    chaosEmperorDragon.effectUsedThisTurn = true;

    logger.info(`✅ [processChaosEmperorDragonEffect] Efeito processado:`, {
      totalCardsDiscarded,
      playerLPLost: 1000,
      opponentDamage,
      newPlayerLP: newPlayerLifePoints,
      newOpponentLP: newOpponentLifePoints
    });

    // Atualizar no banco
    await host['updateDuelInDatabase'](duelIdStr, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    } as any);

    // Atualizar cache
    host['activeDuels'].set(duelIdStr, duel);

    return { success: true, damage: opponentDamage };
  }
