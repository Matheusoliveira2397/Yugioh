import { SimpleCardEffectFunction, CardEffectContext, CardEffectResult } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';
import { changeLifePoints, sendSpellTrapToGraveyard } from '../../primitives/effect-operations';

/** Embaralha uma cópia do baralho (Fisher–Yates). */
function shuffleDeckArray(deck: any[]): any[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const isFaceUpMonster = (m: any): boolean =>
  m && m !== null && (m.position === 'attack' || m.position === 'defense');

const isDefensePositionMonster = (m: any): boolean =>
  m && m !== null && (m.position === 'defense' || m.position === 'set');

/**
 * Efeitos simples de cartas
 * 
 * Para efeitos básicos que não precisam de lógica complexa,
 * apenas uma função é suficiente. Não precisa criar uma classe inteira.
 * 
 * IMPORTANTE: Se o efeito ficar complexo, migre para uma classe separada.
 */

/**
 * Pot of Greed - Compra 2 cartas
 * 
 * Exemplo de efeito simples - apenas uma função, sem classe
 */
export const createPotOfGreedEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    
    logger.info(`✨ [PotOfGreed] Processando efeito - comprando 2 cartas`);
    
    // Comprar 2 cartas
    for (let i = 0; i < 2; i++) {
      await duelsService.drawCard(duelId, userId);
    }
    
    // Resolução usa primitiva central, sem duplicar manipulação de zonas.
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    sendSpellTrapToGraveyard(playerField, zoneIndex);
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Pot of Greed: Jogador comprou 2 cartas',
    };
  };
};

/**
 * Upstart Goblin - Compra 1 carta e aumenta LP do oponente em 1000
 */
export const createUpstartGoblinEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    
    logger.info(`✨ [UpstartGoblin] Processando efeito`);
    
    // Comprar 1 carta
    await duelsService.drawCard(duelId, userId);
    
    // Aumentar LP do oponente em 1000
    if (isPlayer1) {
      duel.player2LifePoints = changeLifePoints(duel.player2LifePoints, 1000);
    } else {
      duel.player1LifePoints = changeLifePoints(duel.player1LifePoints, 1000);
    }
    
    // Mover para o cemitério
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Upstart Goblin: Jogador comprou 1 carta e oponente ganhou 1000 LP',
    };
  };
};

/**
 * Hinotama - Causa 500 de dano ao oponente
 */
export const createHinotamaEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [Hinotama] Processando efeito - causando 500 de dano`);
    
    const damage = 500;
    if (isPlayer1) {
      duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
    } else {
      duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
    }
    
    // Verificar se o duelo terminou
    if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
      const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
      await duelsService.finishDuel(duelId, 
        duel.player1LifePoints <= 0 ? 'PLAYER2_WIN' : 'PLAYER1_WIN', 
        winnerId
      );
    }
    
    // Mover para o cemitério
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: `Hinotama: ${damage} de dano causado ao oponente`,
    };
  };
};

/**
 * Raigeki - Destruir todos os monstros do adversário
 */
export const createRaigekiEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [Raigeki] Processando efeito - destruindo todos os monstros do adversário`);
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.monsters) {
      logger.info(`⚠️ [Raigeki] Campo do adversário não encontrado`);
      return { success: false, createdPendingChoice: false, message: 'Campo do adversário não encontrado' };
    }
    
    // Garantir que monsters seja um array de 5 elementos
    if (!Array.isArray(opponentField.monsters)) {
      opponentField.monsters = [null, null, null, null, null];
    }
    while (opponentField.monsters.length < 5) {
      opponentField.monsters.push(null);
    }
    opponentField.monsters = opponentField.monsters.slice(0, 5);
    
    // Inicializar cemitério se não existir
    if (!opponentField.graveyard) {
      opponentField.graveyard = [];
    }
    
    // Destruir todos os monstros do adversário
    const destroyedCards: any[] = [];
    for (let i = 0; i < opponentField.monsters.length; i++) {
      if (opponentField.monsters[i] !== null && opponentField.monsters[i] !== undefined) {
        const destroyedCard = opponentField.monsters[i];
        
        // Verificar se o monstro tinha equipamento antes de destruir
        await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, destroyedCard);
        
        destroyedCards.push(destroyedCard);
        opponentField.monsters[i] = null;
        
        // Mover para o cemitério
        opponentField.graveyard.push(destroyedCard);
        logger.info(`💥 [Raigeki] Monstro destruído: ${destroyedCard.name || destroyedCard.cardName || 'Desconhecido'}`);
      }
    }
    
    // Marcar que um monstro foi destruído no campo do oponente neste turno (para Last Will)
    if (destroyedCards.length > 0 && !opponentField.monsterDestroyedThisTurn) {
      opponentField.monsterDestroyedThisTurn = true;
      logger.info(`✅ [Raigeki] Monstro destruído no campo do oponente - Last Will pode ser ativada`);
    }
    
    // Recalcular UnitedWeStand para ambos os jogadores se monstros foram destruídos
    if (destroyedCards.length > 0) {
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
      logger.info(`✅ [Raigeki] Destruiu ${destroyedCards.length} monstro(s) do adversário`);
    } else {
      logger.info(`ℹ️ [Raigeki] Nenhum monstro do adversário para destruir`);
    }
    
    // Mover Raigeki para o cemitério após ativação
    if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
      const activatedCard = playerField.spellTrap[zoneIndex];
      
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      
      playerField.graveyard.push(activatedCard);
      playerField.spellTrap[zoneIndex] = null;
      
      logger.info(`✅ [Raigeki] Movida para o cemitério após ativação`);
    }
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: `Raigeki: ${destroyedCards.length} monstro(s) do adversário destruído(s)`,
    };
  };
};

/**
 * Harpie's Feather Duster - Destruir todas as spell/trap do adversário
 */
export const createHarpiesFeatherDusterEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [HarpiesFeatherDuster] Processando efeito - destruindo todas as spell/trap do adversário`);
    
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!opponentField || !opponentField.spellTrap) {
      logger.info(`⚠️ [HarpiesFeatherDuster] Campo do adversário não encontrado`);
      return { success: false, createdPendingChoice: false, message: 'Campo do adversário não encontrado' };
    }
    
    // Função auxiliar para verificar se é uma carta específica
    const isExactCard = (card: any, cardId: string): boolean => {
      const cardIdCheck = card.idCarta || card.id || card.cardId;
      return cardIdCheck === cardId || 
             (typeof cardIdCheck === 'string' && cardIdCheck.toLowerCase() === cardId.toLowerCase());
    };
    
    // Garantir que spellTrap seja um array de 5 elementos
    if (!Array.isArray(opponentField.spellTrap)) {
      opponentField.spellTrap = [null, null, null, null, null];
    }
    while (opponentField.spellTrap.length < 5) {
      opponentField.spellTrap.push(null);
    }
    opponentField.spellTrap = opponentField.spellTrap.slice(0, 5);
    
    // Inicializar cemitério se não existir
    if (!opponentField.graveyard) {
      opponentField.graveyard = [];
    }
    
    // Destruir todas as spell/trap do adversário
    const destroyedCards: any[] = [];
    for (let i = 0; i < opponentField.spellTrap.length; i++) {
      if (opponentField.spellTrap[i] !== null && opponentField.spellTrap[i] !== undefined) {
        const destroyedCard = opponentField.spellTrap[i];
        const destroyedCardId = destroyedCard.idCarta || destroyedCard.id || destroyedCard.cardId;
        
        if (destroyedCardId === 'ChangeOfHeart' || 
            (typeof destroyedCardId === 'string' && destroyedCardId.toLowerCase().includes('changeofheart'))) {
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
        } else if (isExactCard(destroyedCard, 'BrainControl')) {
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
        } else if (isExactCard(destroyedCard, 'UnitedWeStand') || isExactCard(destroyedCard, 'MagePower')) {
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, destroyedCard, i);
        } else {
          await (duelsService as any).recalculateMagePowerAtk(duelId, duel, !isPlayer1);
        }
        await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, !isPlayer1, i);
        destroyedCards.push(destroyedCard);
        if (opponentField.spellTrap[i] !== null && opponentField.spellTrap[i] !== undefined) {
          if (!opponentField.graveyard) opponentField.graveyard = [];
          opponentField.graveyard.push(opponentField.spellTrap[i]);
          opponentField.spellTrap[i] = null;
          logger.info(`💥 [HarpiesFeatherDuster] Spell/Trap destruída: ${destroyedCard.name || destroyedCard.cardName || 'Desconhecida'}`);
        } else {
          logger.info(`💥 [HarpiesFeatherDuster] Spell/Trap destruída (já enviada por efeito): ${destroyedCard.name || destroyedCard.cardName || 'Desconhecida'}`);
        }
      }
    }
    
    if (destroyedCards.length > 0) {
      logger.info(`✅ [HarpiesFeatherDuster] Destruiu ${destroyedCards.length} spell/trap(s) do adversário`);
    } else {
      logger.info(`ℹ️ [HarpiesFeatherDuster] Nenhuma spell/trap do adversário para destruir`);
    }
    
    // Mover Harpie's Feather Duster para o cemitério após ativação (esta função só é chamada para essa carta)
    if (!playerField) {
      logger.warn(`⚠️ [HarpiesFeatherDuster] playerField não encontrado - não é possível mover para o cemitério`);
    } else {
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      const contextCard = context.card;
      const matchCard = (c: any) => {
        if (!c) return false;
        if (contextCard?.instanceId && c.instanceId === contextCard.instanceId) return true;
        const idA = (c.idCarta || c.id || c.cardId || '').toString().toLowerCase().replace(/\s+|'/g, '');
        const idB = (contextCard?.idCarta || contextCard?.id || contextCard?.cardId || '').toString().toLowerCase().replace(/\s+|'/g, '');
        if (idA && idB && (idA === idB || idA.includes('harpiesfeatherduster'))) return true;
        const nameA = (c.name || c.cardName || '').toString().toLowerCase().replace(/\s+|'/g, '');
        return nameA === 'harpiesfeatherduster' || nameA.includes('harpiesfeatherduster');
      };
      let moved = false;
      // 1) Tentar pela zona passada no contexto
      if (playerField.spellTrap && zoneIndex >= 0 && zoneIndex < (playerField.spellTrap.length || 0) && playerField.spellTrap[zoneIndex]) {
        const cardAtZone = playerField.spellTrap[zoneIndex];
        playerField.graveyard.push(cardAtZone);
        playerField.spellTrap[zoneIndex] = null;
        moved = true;
        logger.info(`✅ [HarpiesFeatherDuster] Movida da zona ${zoneIndex} para o cemitério após ativação`);
      }
      // 2) Se não moveu, procurar em todas as zonas spell/trap pela carta ativada
      if (!moved && playerField.spellTrap && Array.isArray(playerField.spellTrap)) {
        for (let i = 0; i < playerField.spellTrap.length; i++) {
          if (playerField.spellTrap[i] && matchCard(playerField.spellTrap[i])) {
            playerField.graveyard.push(playerField.spellTrap[i]);
            playerField.spellTrap[i] = null;
            moved = true;
            logger.info(`✅ [HarpiesFeatherDuster] Movida da zona ${i} para o cemitério após ativação (por match)`);
            break;
          }
        }
      }
      // 3) Fallback: procurar na mão (ativação da mão em fluxo alternativo)
      if (!moved && playerField.hand && Array.isArray(playerField.hand)) {
        const handIdx = playerField.hand.findIndex((c: any) => c && matchCard(c));
        if (handIdx !== -1) {
          playerField.graveyard.push(playerField.hand[handIdx]);
          playerField.hand.splice(handIdx, 1);
          moved = true;
          logger.info(`✅ [HarpiesFeatherDuster] Movida da mão para o cemitério após ativação`);
        }
      }
      if (!moved) {
        logger.warn(`⚠️ [HarpiesFeatherDuster] Carta não encontrada no campo nem na mão (zoneIndex=${zoneIndex}) - não foi possível mover para o cemitério`);
      } else {
        // Mage Power: recalculando ATK do jogador que ativou (uma spell foi removida do campo dele)
        await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
      }
    }
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: `Harpie's Feather Duster: ${destroyedCards.length} spell/trap(s) do adversário destruída(s)`,
    };
  };
};

/**
 * Waboku - Neste turno, você não sofre dano de batalha e seus monstros não podem ser destruídos em batalha
 */
export const createWabokuEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [Waboku] Processando efeito - prevenindo dano de batalha e destruição de monstros neste turno`);
    
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField) {
      logger.error(`❌ [Waboku] Campo do jogador não encontrado`);
      return { success: false, createdPendingChoice: false, message: 'Campo do jogador não encontrado' };
    }
    
    // Marcar que Waboku está ativo neste turno
    playerField.wabokuActiveThisTurn = true;
    playerField.wabokuActivatedTurn = duel.turnCounter || 1;
    
    logger.info(`🛡️ [Waboku] Ativada - prevenindo dano de batalha e destruição de monstros neste turno (turno ${playerField.wabokuActivatedTurn})`);
    
    // Mover Waboku para o cemitério após ativação
    if (playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
      const activatedCard = playerField.spellTrap[zoneIndex];
      
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      
      playerField.graveyard.push(activatedCard);
      playerField.spellTrap[zoneIndex] = null;
      
      logger.info(`✅ [Waboku] Movida para o cemitério após ativação`);
    }
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Waboku: Prevenindo dano de batalha e destruição de monstros neste turno',
    };
  };
};

/**
 * Banner Of Courage - Continuous Spell: Durante a Fase de Batalha, todos os monstros que você controla ganham 200 de ATK
 */
export const createBannerOfCourageEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [BannerOfCourage] Processando efeito - Continuous Spell ativada`);
    
    // BannerOfCourage é uma Continuous Spell, então ela permanece no campo
    // O efeito será aplicado durante a fase de batalha através da função getBannerOfCourageBonus
    // Não mover para o cemitério - ela fica no campo até ser destruída
    
    logger.info(`✅ [BannerOfCourage] Ativada e permanece no campo`);
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Banner Of Courage: Continuous Spell ativada - permanece no campo',
    };
  };
};

/**
 * Heavy Storm - Destruir todas as spell/trap de ambos os jogadores
 */
export const createHeavyStormEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [HeavyStorm] Processando efeito - destruindo todas as spell/trap de ambos os jogadores`);
    
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Função auxiliar para verificar se é uma carta específica
    const isExactCard = (card: any, cardId: string): boolean => {
      const cardIdCheck = card.idCarta || card.id || card.cardId;
      return cardIdCheck === cardId || 
             (typeof cardIdCheck === 'string' && cardIdCheck.toLowerCase() === cardId.toLowerCase());
    };
    
    // Função auxiliar para destruir todas as spells/traps de um campo
    const destroyAllSpellTraps = async (field: any, isPlayer1Field: boolean) => {
      if (!field || !field.spellTrap) return 0;
      
      // Garantir que spellTrap seja um array de 5 elementos
      if (!Array.isArray(field.spellTrap)) {
        field.spellTrap = [null, null, null, null, null];
      }
      while (field.spellTrap.length < 5) {
        field.spellTrap.push(null);
      }
      field.spellTrap = field.spellTrap.slice(0, 5);
      
      // Inicializar cemitério se não existir
      if (!field.graveyard) {
        field.graveyard = [];
      }
      
      // CRÍTICO: Coletar todas as cartas a serem destruídas ANTES de iterar
      const cardsToDestroy: Array<{ card: any; zoneIndex: number }> = [];
      for (let i = 0; i < field.spellTrap.length; i++) {
        const card = field.spellTrap[i];
        if (card !== null && card !== undefined) {
          cardsToDestroy.push({ card, zoneIndex: i });
        }
      }
      
      logger.info(`💥 [HeavyStorm] Encontradas ${cardsToDestroy.length} spell/trap(s) para destruir`);
      
      if (cardsToDestroy.length === 0) {
        return 0;
      }
      
      for (const { card, zoneIndex } of cardsToDestroy) {
        const cardName = card.name || card.cardName || 'Desconhecida';
        const isChangeOrBrain = (duelsService as any).isExactCard?.(card, 'ChangeOfHeart') || (duelsService as any).isExactCard?.(card, 'BrainControl') || isExactCard(card, 'ChangeOfHeart') || isExactCard(card, 'BrainControl');
        if (isChangeOrBrain) {
          logger.info(`💥 [HeavyStorm] ${cardName} destruída - devolvendo monstros controlados`);
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, isPlayer1Field);
        } else if (isExactCard(card, 'UnitedWeStand') || isExactCard(card, 'MagePower')) {
          logger.info(`💥 [HeavyStorm] ${cardName} destruída - removendo equipamento`);
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1Field, undefined, card, zoneIndex);
        }
      }
      
      await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1Field);
      
      let destroyed = 0;
      for (const { card, zoneIndex } of cardsToDestroy) {
        await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, isPlayer1Field, zoneIndex);
        if (field.spellTrap[zoneIndex] === null || field.spellTrap[zoneIndex] === undefined) {
          destroyed++;
          continue;
        }
        const cardName = card.name || card.cardName || 'Desconhecida';
        logger.info(`💥 [HeavyStorm] Destruindo ${cardName} (zona ${zoneIndex})`);
        if (!field.graveyard) field.graveyard = [];
        field.graveyard.push(field.spellTrap[zoneIndex]);
        field.spellTrap[zoneIndex] = null;
        destroyed++;
        logger.info(`✅ [HeavyStorm] ${cardName} removida do campo e movida para o cemitério`);
      }
      
      const remainingCards = field.spellTrap.filter((c: any) => c !== null && c !== undefined).length;
      if (remainingCards > 0) {
        logger.warn(`⚠️ [HeavyStorm] Ainda há ${remainingCards} carta(s) no campo após destruição!`);
        for (let i = 0; i < field.spellTrap.length; i++) {
          if (field.spellTrap[i] !== null && field.spellTrap[i] !== undefined) {
            await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, isPlayer1Field, i);
            if (field.spellTrap[i] !== null && field.spellTrap[i] !== undefined) {
              field.graveyard.push(field.spellTrap[i]);
              field.spellTrap[i] = null;
            }
            destroyed++;
            logger.info(`🔧 [HeavyStorm] Forçando remoção de carta restante da zona ${i}`);
          }
        }
      }
      
      return destroyed;
    };
    
    // Destruir todas as spell/trap do jogador
    const playerDestroyed = await destroyAllSpellTraps(playerField, isPlayer1);
    
    // Destruir todas as spell/trap do oponente
    const opponentDestroyed = await destroyAllSpellTraps(opponentField, !isPlayer1);
    
    const totalDestroyed = playerDestroyed + opponentDestroyed;
    
    logger.info(`📊 [HeavyStorm] ${playerDestroyed} spell/trap(s) destruída(s) do jogador, ${opponentDestroyed} do oponente`);
    
    // Verificar se o Heavy Storm também precisa ser destruído (se ainda estiver no campo)
    const heavyStormZone = playerField?.spellTrap?.[zoneIndex];
    if (heavyStormZone) {
      const heavyStormCardId = heavyStormZone.idCarta || heavyStormZone.id || heavyStormZone.cardId;
      if (heavyStormCardId === 'HeavyStorm' || (typeof heavyStormCardId === 'string' && heavyStormCardId.toLowerCase().includes('heavystorm'))) {
        logger.info(`💥 [HeavyStorm] Heavy Storm também será destruído (zona ${zoneIndex})`);
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(heavyStormZone);
        playerField.spellTrap[zoneIndex] = null;
        logger.info(`✅ [HeavyStorm] Heavy Storm removido do campo e movido para o cemitério`);
      }
    }
    
    if (totalDestroyed > 0) {
      logger.info(`✅ [HeavyStorm] Destruiu ${totalDestroyed} spell/trap(s) de ambos os jogadores`);
      // Mage Power (e United We Stand): recalculando para ambos os jogadores (spells/traps foram removidas dos dois campos)
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    } else {
      logger.info(`ℹ️ [HeavyStorm] Nenhuma spell/trap no campo para destruir`);
    }
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: `Heavy Storm: ${totalDestroyed} spell/trap(s) de ambos os jogadores destruída(s)`,
    };
  };
};

/**
 * Dark Hole - Destruir todos os monstros de ambos os jogadores
 */
export const createDarkHoleEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [DarkHole] Processando efeito - destruindo todos os monstros de ambos os jogadores`);
    
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    let totalDestroyed = 0;
    
    // Função auxiliar para destruir todos os monstros de um campo
    const destroyAllMonsters = async (field: any, isPlayer1Field: boolean) => {
      if (!field || !field.monsters) return 0;
      
      // Garantir que monsters seja um array de 5 elementos
      if (!Array.isArray(field.monsters)) {
        field.monsters = [null, null, null, null, null];
      }
      while (field.monsters.length < 5) {
        field.monsters.push(null);
      }
      field.monsters = field.monsters.slice(0, 5);
      
      // Inicializar cemitério se não existir
      if (!field.graveyard) {
        field.graveyard = [];
      }
      
      let destroyed = 0;
      let monsterDestroyed = false;
      
      for (let i = 0; i < field.monsters.length; i++) {
        if (field.monsters[i] !== null && field.monsters[i] !== undefined) {
          const destroyedCard = field.monsters[i];
          
          // Verificar se o monstro tinha equipamento antes de destruir
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1Field, destroyedCard);
          
          field.monsters[i] = null;
          field.graveyard.push(destroyedCard);
          destroyed++;
          monsterDestroyed = true;
          
          logger.info(`💥 [DarkHole] Monstro destruído: ${destroyedCard.name || destroyedCard.cardName || 'Desconhecido'}`);
        }
      }
      
      // Marcar que um monstro foi destruído neste turno (para Last Will)
      if (monsterDestroyed && !field.monsterDestroyedThisTurn) {
        field.monsterDestroyedThisTurn = true;
        logger.info(`✅ [DarkHole] Monstro destruído - Last Will pode ser ativada`);
      }
      
      return destroyed;
    };
    
    // Destruir todos os monstros do jogador
    const playerDestroyed = await destroyAllMonsters(playerField, isPlayer1);
    totalDestroyed += playerDestroyed;
    
    // Destruir todos os monstros do oponente
    const opponentDestroyed = await destroyAllMonsters(opponentField, !isPlayer1);
    totalDestroyed += opponentDestroyed;
    
    // Recalcular UnitedWeStand para ambos os jogadores se monstros foram destruídos
    if (totalDestroyed > 0) {
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
      logger.info(`✅ [DarkHole] Destruiu ${totalDestroyed} monstro(s) de ambos os jogadores`);
    } else {
      logger.info(`ℹ️ [DarkHole] Nenhum monstro para destruir`);
    }
    
    // Mover Dark Hole para o cemitério após ativação
    if (playerField && playerField.spellTrap && playerField.spellTrap[zoneIndex]) {
      const activatedCard = playerField.spellTrap[zoneIndex];
      
      if (!playerField.graveyard) {
        playerField.graveyard = [];
      }
      
      playerField.graveyard.push(activatedCard);
      playerField.spellTrap[zoneIndex] = null;
      
      logger.info(`✅ [DarkHole] Movida para o cemitério após ativação`);
      // Mage Power: recalculando ATK do jogador que ativou (uma spell foi removida do campo dele)
      await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    }
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: `Dark Hole: ${totalDestroyed} monstro(s) de ambos os jogadores destruído(s)`,
    };
  };
};

/**
 * Swords of Revealing Light
 * Após a ativação desta carta, ela permanece no campo, mas você deve destruí-la durante a Fase Final do 3º turno do seu oponente.
 * Quando esta carta é ativada: Se o seu oponente controlar um monstro virado para baixo, vire todos os monstros que ele controla virados para cima.
 * Enquanto esta carta estiver virada para cima no campo, os monstros do seu oponente não podem declarar um ataque.
 */
export const createSwordsOfRevealingLightEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext) => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    
    logger.info(`✨ [SwordsOfRevealingLight] Processando efeito - bloqueando ataques do oponente por 3 turnos`);
    
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Verificar se o oponente tem monstros face-down
    let hasFaceDownMonsters = false;
    if (opponentField && opponentField.monsters && Array.isArray(opponentField.monsters)) {
      for (const monster of opponentField.monsters) {
        if (monster && monster !== null && monster.position === 'set') {
          hasFaceDownMonsters = true;
          break;
        }
      }
    }
    
    // Se o oponente tem monstros face-down, virar todos face-up
    if (hasFaceDownMonsters) {
      logger.info(`✨ [SwordsOfRevealingLight] Virando todos os monstros face-down do oponente`);
      for (let i = 0; i < opponentField.monsters.length; i++) {
        const monster = opponentField.monsters[i];
        if (monster && monster !== null && monster.position === 'set') {
          // Virar para face-up em defesa
          opponentField.monsters[i].position = 'defense';
          logger.info(`✨ [SwordsOfRevealingLight] ${monster.name || monster.cardName || 'Monstro'} virado face-up`);
          
          // Processar efeito Flip de qualquer monstro que tenha (Fiber Jar, Snowman Eater, Morphing Jar, Dekoichi, etc.)
          await (duelsService as any).cardEffectsService.processFlipEffect(duelId, duel, !isPlayer1, opponentField.monsters[i], i);
        }
      }
    } else {
      logger.info(`ℹ️ [SwordsOfRevealingLight] O oponente não tem monstros face-down para virar`);
    }
    
    // Armazenar informações na carta: turno de ativação e turnCounter
    const currentTurnCounter = duel.turnCounter || 1;
    const activationTurn = duel.currentTurn; // 1 = Player1, 2 = Player2
    const swordsCard = playerField.spellTrap[zoneIndex];
    if (swordsCard) {
      swordsCard.activationTurn = activationTurn; // Turno quando foi ativada (1 ou 2)
      swordsCard.activationTurnCounter = currentTurnCounter; // Contador de turnos quando foi ativada
      swordsCard.activatedByPlayer1 = isPlayer1; // Quem ativou
      logger.info(`✅ [SwordsOfRevealingLight] Armazenado turno de ativação - turnCounter: ${currentTurnCounter}, turn: ${activationTurn}, ativado por: ${isPlayer1 ? 'Player1' : 'Player2'}`);
    }
    
    // A carta permanece no campo (não vai para o cemitério)
    logger.info(`✅ [SwordsOfRevealingLight] Permanecerá no campo bloqueando ataques do oponente`);
    
    // CRÍTICO: Usar syncDuelState para garantir sincronização entre cache e banco
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Swords Of Revealing Light: Bloqueando ataques do oponente por 3 turnos',
    };
  };
};

/**
 * Jar of Greed (Armadilha) — Compre 1 carta.
 */
export const createJarOfGreedEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    logger.info(`✨ [JarOfGreed] Comprando 1 carta`);
    await duelsService.drawCard(duelId, userId);
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    return { success: true, createdPendingChoice: false, message: 'Jar of Greed: comprou 1 carta' };
  };
};

/**
 * Card Destruction — Ambos os jogadores descartam a mão inteira e compram o mesmo número de cartas.
 */
export const createCardDestructionEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const p1 = (duel as any).player1Field;
    const p2 = (duel as any).player2Field;
    if (!p1?.hand) p1.hand = [];
    if (!p2?.hand) p2.hand = [];
    if (!p1.graveyard) p1.graveyard = [];
    if (!p2.graveyard) p2.graveyard = [];
    const n1 = p1.hand.length;
    const n2 = p2.hand.length;
    logger.info(`✨ [CardDestruction] P1 descarta ${n1}, P2 descarta ${n2}`);
    for (const c of [...p1.hand]) p1.graveyard.push(c);
    p1.hand = [];
    for (const c of [...p2.hand]) p2.graveyard.push(c);
    p2.hand = [];
    for (let i = 0; i < n1; i++) await duelsService.drawCard(duelId, duel.player1Id);
    for (let i = 0; i < n2; i++) await duelsService.drawCard(duelId, duel.player2Id);
    const playerField = isPlayer1 ? p1 : p2;
    if (playerField?.spellTrap?.[zoneIndex]) {
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: p1,
      player2Field: p2,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, true);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, false);
    return {
      success: true,
      createdPendingChoice: false,
      message: `Card Destruction: mãos trocadas (${n1}/${n2} compras)`,
    };
  };
};

/**
 * Reload — Devolve toda a mão ao deck, embaralha e compra o mesmo número (a spell não está na mão).
 */
export const createReloadEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField) {
      return { success: false, createdPendingChoice: false, message: 'Campo inválido' };
    }
    if (!playerField.hand) playerField.hand = [];
    if (!playerField.deck) playerField.deck = [];
    const n = playerField.hand.length;
    logger.info(`✨ [Reload] ${n} carta(s) da mão voltam ao deck`);
    playerField.deck.push(...playerField.hand.splice(0, playerField.hand.length));
    playerField.deck = shuffleDeckArray(playerField.deck);
    for (let i = 0; i < n; i++) await duelsService.drawCard(duelId, userId);
    if (playerField.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    return { success: true, createdPendingChoice: false, message: `Reload: embaralhou e comprou ${n} carta(s)` };
  };
};

/**
 * Fissure — Destrói 1 monstro com face para cima no campo do oponente com o menor ATK (empate: menor índice de zona).
 */
export const createFissureEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!opponentField?.monsters) {
      return { success: false, createdPendingChoice: false, message: 'Campo do oponente inválido' };
    }
    let bestIdx = -1;
    let bestAtk = Number.POSITIVE_INFINITY;
    for (let i = 0; i < opponentField.monsters.length; i++) {
      const m = opponentField.monsters[i];
      if (!isFaceUpMonster(m)) continue;
      const atk = Number(m.atk ?? m.ATK ?? 0);
      if (atk < bestAtk) {
        bestAtk = atk;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const destroyedCard = opponentField.monsters[bestIdx];
      await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, destroyedCard);
      opponentField.monsters[bestIdx] = null;
      if (!opponentField.graveyard) opponentField.graveyard = [];
      opponentField.graveyard.push(destroyedCard);
      if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
      logger.info(`✨ [Fissure] Destruiu ${destroyedCard.name || destroyedCard.cardName} (ATK ${bestAtk})`);
    } else {
      logger.info(`ℹ️ [Fissure] Nenhum monstro com face para cima no oponente`);
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Fissure resolvido' };
  };
};

/**
 * Smashing Ground — Destrói 1 monstro com face para cima no campo do oponente com a maior DEF (empate: menor índice).
 */
export const createSmashingGroundEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    let bestIdx = -1;
    let bestDef = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < (opponentField?.monsters?.length || 0); i++) {
      const m = opponentField.monsters[i];
      if (!isFaceUpMonster(m)) continue;
      const def = Number(m.def ?? m.DEF ?? 0);
      if (def > bestDef) {
        bestDef = def;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const destroyedCard = opponentField.monsters[bestIdx];
      await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, destroyedCard);
      opponentField.monsters[bestIdx] = null;
      if (!opponentField.graveyard) opponentField.graveyard = [];
      opponentField.graveyard.push(destroyedCard);
      if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Smashing Ground resolvido' };
  };
};

/**
 * Hammer Shot — Destrói 1 monstro em Posição de Ataque com face para cima com o maior ATK (empate: menor índice).
 */
export const createHammerShotEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    let bestIdx = -1;
    let bestAtk = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < (opponentField?.monsters?.length || 0); i++) {
      const m = opponentField.monsters[i];
      if (!m || m === null || m.position !== 'attack') continue;
      const atk = Number(m.atk ?? m.ATK ?? 0);
      if (atk > bestAtk) {
        bestAtk = atk;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const destroyedCard = opponentField.monsters[bestIdx];
      await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, destroyedCard);
      opponentField.monsters[bestIdx] = null;
      if (!opponentField.graveyard) opponentField.graveyard = [];
      opponentField.graveyard.push(destroyedCard);
      if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Hammer Shot resolvido' };
  };
};

/**
 * Shield Crush — Destrói 1 monstro em Posição de Defesa no campo (prioriza oponente; empate de zona: menor índice).
 */
export const createShieldCrushEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    const findDefZone = (field: any): number => {
      if (!field?.monsters) return -1;
      for (let i = 0; i < field.monsters.length; i++) {
        if (isDefensePositionMonster(field.monsters[i])) return i;
      }
      return -1;
    };

    let targetIsPlayer1 = !isPlayer1;
    let zi = findDefZone(opponentField);
    if (zi < 0) {
      targetIsPlayer1 = isPlayer1;
      zi = findDefZone(playerField);
    }
    if (zi >= 0) {
      const field = targetIsPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
      const destroyedCard = field.monsters[zi];
      await (duelsService as any).handleEquipmentDestruction(duelId, duel, targetIsPlayer1, destroyedCard);
      field.monsters[zi] = null;
      if (!field.graveyard) field.graveyard = [];
      field.graveyard.push(destroyedCard);
      if (!field.monsterDestroyedThisTurn) field.monsterDestroyedThisTurn = true;
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    }

    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Shield Crush resolvido' };
  };
};

/**
 * Giant Trunade — Devolve todas as Magias/Armadilhas do campo para a mão dos donos.
 */
export const createGiantTrunadeEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const isExactCard = (card: any, cardId: string): boolean => {
      const cardIdCheck = card?.idCarta || card?.id || card?.cardId;
      return (
        cardIdCheck === cardId ||
        (typeof cardIdCheck === 'string' && cardIdCheck.toLowerCase() === cardId.toLowerCase())
      );
    };

    const returnAllSpellTraps = async (field: any, isPlayer1Field: boolean): Promise<number> => {
      if (!field?.spellTrap) return 0;
      if (!Array.isArray(field.spellTrap)) field.spellTrap = [null, null, null, null, null];
      while (field.spellTrap.length < 5) field.spellTrap.push(null);
      field.spellTrap = field.spellTrap.slice(0, 5);
      if (!field.hand) field.hand = [];

      const toProcess: Array<{ card: any; zoneIndex: number }> = [];
      for (let i = 0; i < field.spellTrap.length; i++) {
        const c = field.spellTrap[i];
        if (c !== null && c !== undefined) toProcess.push({ card: c, zoneIndex: i });
      }
      if (toProcess.length === 0) return 0;

      for (const { card, zoneIndex: zi } of toProcess) {
        const isChangeOrBrain =
          (duelsService as any).isExactCard?.(card, 'ChangeOfHeart') ||
          (duelsService as any).isExactCard?.(card, 'BrainControl') ||
          isExactCard(card, 'ChangeOfHeart') ||
          isExactCard(card, 'BrainControl');
        if (isChangeOrBrain) {
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, isPlayer1Field);
        } else if (isExactCard(card, 'UnitedWeStand') || isExactCard(card, 'MagePower')) {
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1Field, undefined, card, zi);
        }
      }
      await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1Field);

      let n = 0;
      for (const { zoneIndex: zi } of toProcess) {
        await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, isPlayer1Field, zi);
        const c = field.spellTrap[zi];
        if (c !== null && c !== undefined) {
          field.hand.push(c);
          field.spellTrap[zi] = null;
          n++;
        }
      }
      return n;
    };

    const p1 = (duel as any).player1Field;
    const p2 = (duel as any).player2Field;
    const a = await returnAllSpellTraps(p1, true);
    const b = await returnAllSpellTraps(p2, false);
    logger.info(`✨ [GiantTrunade] Retornou ${a + b} Magia(s)/Armadilha(s) às mãos`);

    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);

    const playerField = isPlayer1 ? p1 : p2;
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.hand) playerField.hand = [];
      playerField.hand.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }

    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: p1,
      player2Field: p2,
    });
    return {
      success: true,
      createdPendingChoice: false,
      message: `Giant Trunade: ${a + b} carta(s) voltaram às mãos`,
    };
  };
};

const findFirstEmptyMonsterZone = (monsters: any[] | undefined): number => {
  if (!monsters || !Array.isArray(monsters)) return -1;
  for (let i = 0; i < 5; i++) {
    if (monsters[i] === null || monsters[i] === undefined) return i;
  }
  return -1;
};

const isNormalMonsterCard = (c: any): boolean => {
  if (!c) return false;
  const t = c.type || c.cardType;
  if (String(t) !== 'Monster' && String(t) !== 'MONSTER') return false;
  const mt = c.monsterType || c.monster_type;
  return String(mt).toLowerCase() === 'normal';
};

const fieldHasDragonMonster = (field: any): boolean => {
  if (!field?.monsters) return false;
  for (const m of field.monsters) {
    if (!m) continue;
    const race = String(m.race || '').toLowerCase();
    if (race.includes('dragon')) return true;
  }
  return false;
};

async function destroyOpponentSpellTrapZone(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  opponentField: any,
): Promise<boolean> {
  if (!opponentField?.spellTrap) return false;
  const isExactCard = (card: any, cardId: string): boolean => {
    const cardIdCheck = card?.idCarta || card?.id || card?.cardId;
    return (
      cardIdCheck === cardId ||
      (typeof cardIdCheck === 'string' && cardIdCheck.toLowerCase() === cardId.toLowerCase())
    );
  };
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const destroyedCard = opponentField.spellTrap[i];
    if (destroyedCard === null || destroyedCard === undefined) continue;
    const isChangeOrBrain =
      (duelsService as any).isExactCard?.(destroyedCard, 'ChangeOfHeart') ||
      (duelsService as any).isExactCard?.(destroyedCard, 'BrainControl') ||
      isExactCard(destroyedCard, 'ChangeOfHeart') ||
      isExactCard(destroyedCard, 'BrainControl');
    if (isChangeOrBrain) {
      await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
    } else if (isExactCard(destroyedCard, 'UnitedWeStand') || isExactCard(destroyedCard, 'MagePower')) {
      await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, destroyedCard, i);
    }
    await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, !isPlayer1, i);
    if (opponentField.spellTrap[i] !== null && opponentField.spellTrap[i] !== undefined) {
      if (!opponentField.graveyard) opponentField.graveyard = [];
      opponentField.graveyard.push(opponentField.spellTrap[i]);
      opponentField.spellTrap[i] = null;
      await (duelsService as any).recalculateMagePowerAtk(duelId, duel, !isPlayer1);
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
      return true;
    }
  }
  return false;
}

async function placeSpecialSummonedFromCard(
  duelsService: any,
  duelId: string,
  duel: any,
  isPlayer1: boolean,
  playerField: any,
  card: any,
  zoneIndex: number,
  position: 'attack' | 'defense',
): Promise<void> {
  const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
  playerField.monsters[zoneIndex] = {
    ...card,
    position,
    summonedTurnNumber: currentTurnCounter,
    summonedByPlayer: duel.currentTurn,
    positionChangedThisTurn: false,
    attackedThisTurn: false,
    attacksThisTurn: 0,
    specialSummoned: true,
  };
  const placed = playerField.monsters[zoneIndex];
  if (placed && typeof (duelsService as any).checkTrapsOnMonsterSummon === 'function') {
    const destroyed = await (duelsService as any).checkTrapsOnMonsterSummon(
      duelId,
      duel,
      isPlayer1,
      zoneIndex,
      placed,
      position,
    );
    if (destroyed) return;
  }
  if (position === 'attack' && typeof (duelsService as any).applySliferEffectOnOpponentSummon === 'function') {
    await (duelsService as any).applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, zoneIndex);
  }
}

/**
 * Lightning Vortex — Descarte 1 carta aleatória da mão (se houver); destrua todos os monstros com face para cima que o oponente controla.
 */
export const createLightningVortexEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    let paidCost = false;
    if (playerField?.hand?.length > 0) {
      const ri = Math.floor(Math.random() * playerField.hand.length);
      const discarded = playerField.hand.splice(ri, 1)[0];
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(discarded);
      paidCost = true;
    }
    let n = 0;
    if (paidCost && opponentField?.monsters) {
      for (let i = 0; i < opponentField.monsters.length; i++) {
        const m = opponentField.monsters[i];
        if (!isFaceUpMonster(m)) continue;
        await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, m);
        if (!opponentField.graveyard) opponentField.graveyard = [];
        opponentField.graveyard.push(m);
        opponentField.monsters[i] = null;
        n++;
        if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
      }
    }
    if (n > 0) await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: `Lightning Vortex: ${n} monstro(s)` };
  };
};

/**
 * Trade-In — Descarte 1 monstro de Nível 8 da mão; compre 2 cartas.
 */
export const createTradeInEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField?.hand) playerField.hand = [];
    let idx = playerField.hand.findIndex((c: any) => {
      const lv = Number(c?.level ?? 0);
      const isM = String(c?.type || c?.cardType) === 'Monster' || String(c?.type || c?.cardType) === 'MONSTER';
      return isM && lv >= 8;
    });
    if (idx === -1) idx = playerField.hand.findIndex((c: any) => Number(c?.level ?? 0) >= 8);
    if (idx >= 0) {
      const d = playerField.hand.splice(idx, 1)[0];
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(d);
      await duelsService.drawCard(duelId, userId);
      await duelsService.drawCard(duelId, userId);
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    return { success: true, createdPendingChoice: false, message: 'Trade-In resolvido' };
  };
};

/**
 * Dark Eruption — Adiciona 1 monstro de TREVAS com 1500 ou menos de ATK do seu Cemitério à sua mão.
 */
export const createDarkEruptionEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField?.graveyard) playerField.graveyard = [];
    const gy = playerField.graveyard;
    let gi = -1;
    for (let i = 0; i < gy.length; i++) {
      const c = gy[i];
      const attr = String(c?.attribute || '').toUpperCase();
      const atk = Number(c?.atk ?? 0);
      const isM = String(c?.type || c?.cardType).toLowerCase().includes('monster');
      if (isM && (attr === 'DARK' || attr === 'TREVAS') && atk <= 1500) {
        gi = i;
        break;
      }
    }
    if (gi >= 0) {
      const [card] = gy.splice(gi, 1);
      if (!playerField.hand) playerField.hand = [];
      playerField.hand.push(card);
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Dark Eruption resolvido' };
  };
};

/**
 * Stamping Destruction — Se você controlar um monstro Dragão: destrua 1 Magia/Armadilha no campo e, se o fizer, cause 500 de dano ao controlador dela.
 */
export const createStampingDestructionEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    if (!fieldHasDragonMonster(playerField)) {
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      return { success: false, createdPendingChoice: false, message: 'Stamping Destruction: sem Dragão no campo' };
    }
    const destroyedOpp = await destroyOpponentSpellTrapZone(duelsService, String(duelId), duel, isPlayer1, opponentField);
    let destroyedOwn = false;
    if (!destroyedOpp) {
      destroyedOwn = await destroyOpponentSpellTrapZone(duelsService, String(duelId), duel, !isPlayer1, playerField);
    }
    if (destroyedOpp || destroyedOwn) {
      const damage = 500;
      if (destroyedOpp) {
        if (isPlayer1) duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
        else duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
      } else {
        if (isPlayer1) duel.player1LifePoints = Math.max(0, (duel.player1LifePoints || 0) - damage);
        else duel.player2LifePoints = Math.max(0, (duel.player2LifePoints || 0) - damage);
      }
      if (duel.player1LifePoints <= 0 || duel.player2LifePoints <= 0) {
        const winnerId = duel.player1LifePoints <= 0 ? duel.player2Id : duel.player1Id;
        await duelsService.finishDuel(
          duelId,
          duel.player1LifePoints <= 0 ? 'PLAYER2_WIN' : 'PLAYER1_WIN',
          winnerId,
        );
      }
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
      player1LifePoints: duel.player1LifePoints,
      player2LifePoints: duel.player2LifePoints,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Stamping Destruction resolvido' };
  };
};

/**
 * Tribute to the Doomed — Descarte 1 carta aleatória da mão; destrua 1 monstro no campo do oponente (prioriza com face para cima).
 */
export const createTributeToTheDoomedEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    let discarded = false;
    if (playerField?.hand?.length > 0) {
      const ri = Math.floor(Math.random() * playerField.hand.length);
      const d = playerField.hand.splice(ri, 1)[0];
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(d);
      discarded = true;
    }
    let zi = -1;
    if (discarded && opponentField?.monsters) {
      for (let i = 0; i < opponentField.monsters.length; i++) {
        const m = opponentField.monsters[i];
        if (m && isFaceUpMonster(m)) {
          zi = i;
          break;
        }
      }
      if (zi < 0) {
        for (let i = 0; i < opponentField.monsters.length; i++) {
          if (opponentField.monsters[i]) {
            zi = i;
            break;
          }
        }
      }
    }
    if (zi >= 0) {
      const m = opponentField.monsters[zi];
      await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, m);
      opponentField.monsters[zi] = null;
      if (!opponentField.graveyard) opponentField.graveyard = [];
      opponentField.graveyard.push(m);
      if (!opponentField.monsterDestroyedThisTurn) opponentField.monsterDestroyedThisTurn = true;
      await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Tribute to the Doomed resolvido' };
  };
};

/**
 * Ancient Rules — Invocação Especial de 1 Monstro Normal de Nível 5 ou mais da sua mão.
 */
export const createAncientRulesEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField?.hand) playerField.hand = [];
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    const hi = playerField.hand.findIndex((c: any) => {
      if (!isNormalMonsterCard(c)) return false;
      return Number(c.level ?? 0) >= 5;
    });
    const emptyZ = findFirstEmptyMonsterZone(playerField.monsters);
    if (hi >= 0 && emptyZ >= 0) {
      const card = playerField.hand.splice(hi, 1)[0];
      await placeSpecialSummonedFromCard(duelsService, String(duelId), duel, isPlayer1, playerField, card, emptyZ, 'attack');
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Ancient Rules resolvido' };
  };
};

/**
 * Silver's Cry — Invocação Especial de 1 Monstro Normal Dragão do seu Cemitério.
 */
export const createSilversCryEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField?.graveyard) playerField.graveyard = [];
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    let gi = -1;
    for (let i = 0; i < playerField.graveyard.length; i++) {
      const c = playerField.graveyard[i];
      const race = String(c?.race || '').toLowerCase();
      if (isNormalMonsterCard(c) && race.includes('dragon')) {
        gi = i;
        break;
      }
    }
    const emptyZ = findFirstEmptyMonsterZone(playerField.monsters);
    if (gi >= 0 && emptyZ >= 0) {
      const card = playerField.graveyard.splice(gi, 1)[0];
      await placeSpecialSummonedFromCard(duelsService, String(duelId), duel, isPlayer1, playerField, card, emptyZ, 'attack');
    }
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: "Silver's Cry resolvido" };
  };
};

/**
 * Double Summon — Neste turno você pode fazer 2 Invocações-Normais (não apenas 1).
 */
export const createDoubleSummonEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const prev = typeof playerField.bonusNormalSummonsRemaining === 'number' ? playerField.bonusNormalSummonsRemaining : 0;
    playerField.bonusNormalSummonsRemaining = prev + 1;
    logger.info(`✨ [DoubleSummon] bonusNormalSummonsRemaining=${playerField.bonusNormalSummonsRemaining}`);
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    return { success: true, createdPendingChoice: false, message: 'Double Summon: +1 invocação normal neste turno' };
  };
};

/**
 * Card of Sanctity — Banish all other cards you control and in your hand (min. 1 from each); draw until you have 2 cards in your hand.
 */
export const createCardOfSanctityEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const userId = isPlayer1 ? duel.player1Id : duel.player2Id;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField?.hand) playerField.hand = [];
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    if (!playerField.spellTrap) playerField.spellTrap = [null, null, null, null, null];
    if (!playerField.banished) playerField.banished = [];
    
    // Count other cards in hand (excluding Card of Sanctity if somehow it's there)
    const handCount = playerField.hand.length;
    
    // Count controlled monsters and S/T (excluding Card of Sanctity itself at zoneIndex)
    let fieldCount = 0;
    for (let i = 0; i < playerField.monsters.length; i++) {
      if (playerField.monsters[i]) fieldCount++;
    }
    for (let i = 0; i < playerField.spellTrap.length; i++) {
      if (i !== zoneIndex && playerField.spellTrap[i]) fieldCount++;
    }
    
    // Validation: need at least 1 from hand and 1 from field
    if (handCount < 1 || fieldCount < 1) {
      logger.info(`⚠️ [CardOfSanctity] Não pode ativar - precisa de ≥1 carta na mão (${handCount}) e ≥1 no campo (${fieldCount})`);
      // Move Card of Sanctity to GY without effect
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      return { success: false, createdPendingChoice: false, message: 'Card of Sanctity: Requer ≥1 carta na mão e ≥1 no campo' };
    }
    
    logger.info(`✨ [CardOfSanctity] Banindo ${handCount} carta(s) da mão e ${fieldCount} carta(s) do campo`);
    
    // Banish all cards from hand
    for (const card of [...playerField.hand]) {
      playerField.banished.push(card);
    }
    playerField.hand = [];
    
    // Banish all monsters
    for (let i = 0; i < playerField.monsters.length; i++) {
      if (playerField.monsters[i]) {
        // Handle equipment destruction before banishing
        await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, playerField.monsters[i]);
        playerField.banished.push(playerField.monsters[i]);
        playerField.monsters[i] = null;
      }
    }
    
    // Banish all S/T except Card of Sanctity itself
    for (let i = 0; i < playerField.spellTrap.length; i++) {
      if (i !== zoneIndex && playerField.spellTrap[i]) {
        const card = playerField.spellTrap[i];
        const cardId = card.idCarta || card.id || card.cardId;
        // Handle special cases like Change of Heart, United We Stand, etc.
        if (cardId === 'ChangeOfHeart' || (typeof cardId === 'string' && cardId.toLowerCase().includes('changeofheart'))) {
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, isPlayer1);
        } else if (cardId === 'BrainControl' || (typeof cardId === 'string' && cardId.toLowerCase().includes('braincontrol'))) {
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, isPlayer1);
        } else if (cardId === 'UnitedWeStand' || cardId === 'MagePower') {
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, undefined, card, i);
        }
        await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, isPlayer1, i);
        playerField.banished.push(card);
        playerField.spellTrap[i] = null;
      }
    }
    
    // Draw until hand size is 2
    while (playerField.hand.length < 2) {
      await duelsService.drawCard(duelId, userId);
    }
    
    // Move Card of Sanctity to graveyard
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    
    return { success: true, createdPendingChoice: false, message: `Card of Sanctity: Banido ${handCount + fieldCount} carta(s), comprou ${2 - 0}` };
  };
};

/**
 * Multiply — Tribute 1 face-up Kuriboh; Special Summon as many Kuriboh Tokens as possible.
 */
export const createMultiplyEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField?.monsters) playerField.monsters = [null, null, null, null, null];
    if (!playerField.graveyard) playerField.graveyard = [];
    
    // Find face-up Kuriboh
    let kuribohZone = -1;
    for (let i = 0; i < playerField.monsters.length; i++) {
      const m = playerField.monsters[i];
      if (!m) continue;
      const isFaceUp = m.position === 'attack' || m.position === 'defense';
      if (!isFaceUp) continue;
      
      const cardId = (m.idCarta || m.id || m.cardId || '').toString().toLowerCase().replace(/\s+|'/g, '');
      const name = (m.name || m.cardName || '').toString().toLowerCase().replace(/\s+|'/g, '');
      if (cardId.includes('kuriboh') || name.includes('kuriboh') || cardId === 'ygopro_40640057') {
        kuribohZone = i;
        break;
      }
    }
    
    if (kuribohZone === -1) {
      logger.info(`⚠️ [Multiply] Não encontrou Kuriboh face-up para tributar`);
      // Move Multiply to GY
      if (playerField?.spellTrap?.[zoneIndex]) {
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      return { success: false, createdPendingChoice: false, message: 'Multiply: Requer Kuriboh face-up para tributar' };
    }
    
    // Tribute the Kuriboh
    const kuriboh = playerField.monsters[kuribohZone];
    await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, kuriboh);
    playerField.monsters[kuribohZone] = null;
    playerField.graveyard.push(kuriboh);
    logger.info(`✨ [Multiply] Tributou Kuriboh da zona ${kuribohZone}`);
    
    // Count empty zones (including the one we just freed)
    const emptyZones: number[] = [];
    for (let i = 0; i < playerField.monsters.length; i++) {
      if (!playerField.monsters[i]) emptyZones.push(i);
    }
    
    // Create Kuriboh Tokens in all empty zones
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    for (const zone of emptyZones) {
      playerField.monsters[zone] = {
        name: 'Kuriboh Token',
        cardName: 'Kuriboh Token',
        idCarta: 'KuribohToken',
        type: 'Monster',
        race: 'Fiend',
        attribute: 'DARK',
        level: 1,
        atk: 300,
        ATK: 300,
        def: 200,
        DEF: 200,
        position: 'defense',
        isToken: true,
        cannotTributeForTributeSummon: true,
        summonedTurnNumber: currentTurnCounter,
        summonedByPlayer: duel.currentTurn,
        positionChangedThisTurn: false,
        attackedThisTurn: false,
        attacksThisTurn: 0,
        specialSummoned: true,
      };
    }
    
    logger.info(`✨ [Multiply] Invocou ${emptyZones.length} Kuriboh Token(s)`);
    
    // Move Multiply to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    
    return { success: true, createdPendingChoice: false, message: `Multiply: Invocou ${emptyZones.length} Kuriboh Token(s)` };
  };
};

/**
 * Burst Stream of Destruction (YGOPRO_17655904)
 * If you control "Blue-Eyes White Dragon": Destroy all monsters your opponent controls.
 * "Blue-Eyes White Dragon" you control cannot attack the turn you activate this card.
 */
export const createBurstStreamOfDestructionEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Check if player controls face-up Blue-Eyes White Dragon
    let hasBEWD = false;
    const bewdZones: number[] = [];
    if (playerField?.monsters) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        const m = playerField.monsters[i];
        if (!m || !isFaceUpMonster(m)) continue;
        const cardId = (m.idCarta || m.id || m.cardId || '').toString().toLowerCase().replace(/\s+|'/g, '');
        const name = (m.name || m.cardName || '').toString().toLowerCase().replace(/\s+|'/g, '');
        if (cardId.includes('blueeyeswhitedragon') || name.includes('blueeyeswhitedragon') || 
            name.includes('dragaobrancodelhoazuis') || cardId === 'ygopro_89631139') {
          hasBEWD = true;
          bewdZones.push(i);
        }
      }
    }
    
    if (!hasBEWD) {
      logger.info(`⚠️ [BurstStream] Não controla Blue-Eyes White Dragon`);
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      return { success: false, createdPendingChoice: false, message: 'Burst Stream: Requer Blue-Eyes White Dragon no campo' };
    }
    
    // Destroy all opponent monsters
    let destroyed = 0;
    if (opponentField?.monsters) {
      if (!opponentField.graveyard) opponentField.graveyard = [];
      for (let i = 0; i < opponentField.monsters.length; i++) {
        if (opponentField.monsters[i]) {
          const destroyedCard = opponentField.monsters[i];
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, destroyedCard);
          opponentField.graveyard.push(destroyedCard);
          opponentField.monsters[i] = null;
          destroyed++;
        }
      }
      if (destroyed > 0 && !opponentField.monsterDestroyedThisTurn) {
        opponentField.monsterDestroyedThisTurn = true;
      }
    }
    
    // Mark all BEWDs as cannot attack this turn
    for (const zone of bewdZones) {
      if (playerField.monsters[zone]) {
        playerField.monsters[zone].cannotAttackThisTurn = true;
      }
    }
    
    logger.info(`✨ [BurstStream] Destruiu ${destroyed} monstro(s), ${bewdZones.length} BEWD(s) não podem atacar`);
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `Burst Stream: Destruiu ${destroyed} monstro(s)` };
  };
};

/**
 * Detonate (YGOPRO_89086566)
 * Destroy as many "Kuriboh" and "Kuriboh Tokens" you control as possible,
 * then destroy cards your opponent controls, up to the number destroyed.
 */
export const createDetonateEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    
    // Count and destroy Kuribohs/tokens
    let kuribohCount = 0;
    if (!playerField.graveyard) playerField.graveyard = [];
    if (playerField?.monsters) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        const m = playerField.monsters[i];
        if (!m) continue;
        const cardId = (m.idCarta || m.id || m.cardId || '').toString().toLowerCase().replace(/\s+|'/g, '');
        const name = (m.name || m.cardName || '').toString().toLowerCase().replace(/\s+|'/g, '');
        const isKuriboh = cardId.includes('kuriboh') || name.includes('kuriboh') || m.isToken;
        if (isKuriboh) {
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1, m);
          if (!m.isToken) {
            playerField.graveyard.push(m);
          }
          playerField.monsters[i] = null;
          kuribohCount++;
        }
      }
    }
    
    logger.info(`✨ [Detonate] Destruiu ${kuribohCount} Kuriboh(s)`);
    
    // Destroy that many opponent cards (monsters + S/T from left to right)
    let destroyed = 0;
    if (kuribohCount > 0 && opponentField) {
      if (!opponentField.graveyard) opponentField.graveyard = [];
      
      // Destroy monsters first
      for (let i = 0; i < (opponentField.monsters?.length || 0) && destroyed < kuribohCount; i++) {
        if (opponentField.monsters[i]) {
          const card = opponentField.monsters[i];
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, card);
          opponentField.graveyard.push(card);
          opponentField.monsters[i] = null;
          destroyed++;
        }
      }
      
      // Then destroy S/T
      for (let i = 0; i < (opponentField.spellTrap?.length || 0) && destroyed < kuribohCount; i++) {
        if (opponentField.spellTrap[i]) {
          const card = opponentField.spellTrap[i];
          const cardId = card.idCarta || card.id || card.cardId;
          if (cardId === 'ChangeOfHeart' || cardId === 'BrainControl') {
            await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
          } else if (cardId === 'UnitedWeStand' || cardId === 'MagePower') {
            await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, card, i);
          }
          await (duelsService as any).onSpellTrapRemovedFromField(duelId, duel, !isPlayer1, i);
          opponentField.graveyard.push(card);
          opponentField.spellTrap[i] = null;
          destroyed++;
        }
      }
    }
    
    logger.info(`✨ [Detonate] Destruiu ${destroyed} carta(s) do oponente`);
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `Detonate: ${destroyed} carta(s) destruída(s)` };
  };
};

/**
 * Silent Doom (YGOPRO_42534368)
 * Target 1 Normal Monster in your GY; SS in face-up Defense; cannot attack.
 */
export const createSilentDoomEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField?.graveyard) playerField.graveyard = [];
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    
    // Find Normal Monster in GY
    let targetIdx = -1;
    for (let i = 0; i < playerField.graveyard.length; i++) {
      const c = playerField.graveyard[i];
      if (isNormalMonsterCard(c)) {
        targetIdx = i;
        break;
      }
    }
    
    // Find empty zone
    const emptyZ = findFirstEmptyMonsterZone(playerField.monsters);
    
    if (targetIdx >= 0 && emptyZ >= 0) {
      const card = playerField.graveyard.splice(targetIdx, 1)[0];
      const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
      playerField.monsters[emptyZ] = {
        ...card,
        position: 'defense',
        summonedTurnNumber: currentTurnCounter,
        summonedByPlayer: duel.currentTurn,
        positionChangedThisTurn: false,
        attackedThisTurn: false,
        attacksThisTurn: 0,
        specialSummoned: true,
        cannotAttack: true,
      };
      
      // Check traps
      const placed = playerField.monsters[emptyZ];
      if (placed && typeof (duelsService as any).checkTrapsOnMonsterSummon === 'function') {
        await (duelsService as any).checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, emptyZ, placed, 'defense');
      }
      
      logger.info(`✨ [SilentDoom] Invocou ${card.name || card.cardName} em DEF (não pode atacar)`);
    } else {
      logger.info(`⚠️ [SilentDoom] Sem Normal Monster no GY ou zona vazia`);
    }
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: 'Silent Doom resolvido' };
  };
};

/**
 * Limiter Removal (YGOPRO_23171610)
 * Double ATK of all Machine monsters you currently control until end of turn.
 * End Phase destroy those monsters.
 */
export const createLimiterRemovalEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    let machineCount = 0;
    if (playerField?.monsters) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        const m = playerField.monsters[i];
        if (!m) continue;
        const race = String(m.race || '').toLowerCase();
        if (race.includes('machine') || race.includes('maquina')) {
          if (!m.limiterRemovalDoubled) {
            m.limiterRemovalDoubled = true;
            machineCount++;
          }
        }
      }
    }
    
    logger.info(`✨ [LimiterRemoval] ${machineCount} Machine(s) terão ATK dobrado até End Phase`);
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `Limiter Removal: ${machineCount} Machine(s) ATK dobrado` };
  };
};

/**
 * The Flute of Summoning Dragon (YGOPRO_43973174)
 * SS up to 2 Dragon monsters from hand. "Lord of D." must be on the field to activate and resolve.
 */
export const createTheFluteOfSummoningDragonEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    // Check for Lord of D. face-up on field
    let hasLordOfD = false;
    if (playerField?.monsters) {
      for (let i = 0; i < playerField.monsters.length; i++) {
        const m = playerField.monsters[i];
        if (!m || !isFaceUpMonster(m)) continue;
        const cardId = (m.idCarta || m.id || m.cardId || '').toString().toLowerCase().replace(/\s+|'/g, '');
        const name = (m.name || m.cardName || '').toString().toLowerCase().replace(/\s+|'/g, '');
        if (cardId.includes('lordofd') || name.includes('lordofd') || 
            name.includes('senhordod') || cardId === 'ygopro_17985575') {
          hasLordOfD = true;
          break;
        }
      }
    }
    
    if (!hasLordOfD) {
      logger.info(`⚠️ [FluteOfSummoningDragon] Lord of D. não está no campo`);
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      return { success: false, createdPendingChoice: false, message: 'The Flute: Requer Lord of D. no campo' };
    }
    
    // Find Dragon monsters in hand
    if (!playerField.hand) playerField.hand = [];
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    
    const dragonIndices: number[] = [];
    for (let i = 0; i < playerField.hand.length; i++) {
      const c = playerField.hand[i];
      if (!c) continue;
      const isMonster = String(c.type || c.cardType).toLowerCase().includes('monster');
      const race = String(c.race || '').toLowerCase();
      if (isMonster && (race.includes('dragon') || race.includes('dragao'))) {
        dragonIndices.push(i);
      }
    }
    
    // Count empty zones
    const emptyZones: number[] = [];
    for (let i = 0; i < playerField.monsters.length; i++) {
      if (!playerField.monsters[i]) emptyZones.push(i);
    }
    
    // SS up to 2 Dragons
    const toSummon = Math.min(2, dragonIndices.length, emptyZones.length);
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    
    for (let i = 0; i < toSummon; i++) {
      const handIdx = dragonIndices[i];
      const card = playerField.hand.splice(handIdx - i, 1)[0]; // adjust for splice
      const zone = emptyZones[i];
      
      playerField.monsters[zone] = {
        ...card,
        position: 'attack',
        summonedTurnNumber: currentTurnCounter,
        summonedByPlayer: duel.currentTurn,
        positionChangedThisTurn: false,
        attackedThisTurn: false,
        attacksThisTurn: 0,
        specialSummoned: true,
      };
      
      // Check traps
      const placed = playerField.monsters[zone];
      if (placed && typeof (duelsService as any).checkTrapsOnMonsterSummon === 'function') {
        await (duelsService as any).checkTrapsOnMonsterSummon(duelId, duel, isPlayer1, zone, placed, 'attack');
      }
      
      if (typeof (duelsService as any).applySliferEffectOnOpponentSummon === 'function') {
        await (duelsService as any).applySliferEffectOnOpponentSummon(duelId, duel, isPlayer1, zone);
      }
    }
    
    logger.info(`✨ [FluteOfSummoningDragon] Invocou ${toSummon} Dragon(s)`);
    
    // Move to GY
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: `The Flute: ${toSummon} Dragon(s) invocado(s)` };
  };
};

/**
 * Fiend's Sanctuary (YGOPRO_24874630)
 * SS Metal Fiend Token (ATK 0 / DEF 0) cannot attack; opp takes battle damage involving it;
 * Standby Phase: pay 1000 LP or destroy token.
 */
export const createFiendsSanctuaryEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1, zoneIndex } = context;
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    
    if (!playerField.monsters) playerField.monsters = [null, null, null, null, null];
    const emptyZ = findFirstEmptyMonsterZone(playerField.monsters);
    
    if (emptyZ < 0) {
      logger.info(`⚠️ [FiendsSanctuary] Sem zona vazia para invocar token`);
      if (playerField?.spellTrap?.[zoneIndex]) {
        if (!playerField.graveyard) playerField.graveyard = [];
        playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
        playerField.spellTrap[zoneIndex] = null;
      }
      await (duelsService as any).syncDuelState(duelId, duel, {
        player1Field: (duel as any).player1Field,
        player2Field: (duel as any).player2Field,
      });
      return { success: false, createdPendingChoice: false, message: "Fiend's Sanctuary: Sem zona vazia" };
    }
    
    const currentTurnCounter = playerField?.turnCounter || duel.turnCounter || 1;
    playerField.monsters[emptyZ] = {
      name: 'Metal Fiend Token',
      cardName: 'Metal Fiend Token',
      idCarta: 'MetalFiendToken',
      type: 'Monster',
      race: 'Fiend',
      attribute: 'DARK',
      level: 1,
      atk: 0,
      ATK: 0,
      def: 0,
      DEF: 0,
      position: 'defense',
      isToken: true,
      cannotAttack: true,
      opponentTakesBattleDamage: true, // flag for later damage calc
      fiendsSanctuaryToken: true, // track for Standby
      summonedTurnNumber: currentTurnCounter,
      summonedByPlayer: duel.currentTurn,
      positionChangedThisTurn: false,
      attackedThisTurn: false,
      attacksThisTurn: 0,
      specialSummoned: true,
    };
    
    logger.info(`✨ [FiendsSanctuary] Invocou Metal Fiend Token`);
    
    if (playerField?.spellTrap?.[zoneIndex]) {
      if (!playerField.graveyard) playerField.graveyard = [];
      playerField.graveyard.push(playerField.spellTrap[zoneIndex]);
      playerField.spellTrap[zoneIndex] = null;
    }
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    await (duelsService as any).recalculateUnitedWeStandForBothPlayers(duelId, duel);
    await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1);
    
    return { success: true, createdPendingChoice: false, message: "Fiend's Sanctuary: Metal Fiend Token invocado" };
  };
};

/**
 * Frontline Base (YGOPRO_46181000)
 * Continuous Spell: 1x/turn SS Level 4 or lower Union from hand.
 */
export const createFrontlineBaseEffect = (duelsService: any): SimpleCardEffectFunction => {
  return async (context: CardEffectContext): Promise<CardEffectResult> => {
    const { duelId, duel, isPlayer1 } = context;
    logger.info(`✨ [FrontlineBase] Continuous Spell ativada - permanece no campo`);
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Frontline Base: Continuous Spell ativada',
    };
  };
};

