import { SimpleCardEffectFunction, CardEffectContext, CardEffectResult } from '../interfaces/card-effect.interface';
import { logger } from '../../../../../common/utils/logger.util';

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
      duel.player2LifePoints = (duel.player2LifePoints || 0) + 1000;
    } else {
      duel.player1LifePoints = (duel.player1LifePoints || 0) + 1000;
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
        
        // Processar efeitos especiais antes de destruir
        if (destroyedCardId === 'ChangeOfHeart' || 
            (typeof destroyedCardId === 'string' && destroyedCardId.toLowerCase().includes('changeofheart'))) {
          logger.info(`💥 [HarpiesFeatherDuster] ChangeOfHeart destruída - devolvendo monstros controlados`);
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
        } else if (isExactCard(destroyedCard, 'BrainControl')) {
          logger.info(`💥 [HarpiesFeatherDuster] BrainControl destruída - devolvendo monstros controlados`);
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, !isPlayer1);
        } else if (isExactCard(destroyedCard, 'UnitedWeStand') || isExactCard(destroyedCard, 'MagePower')) {
          logger.info(`💥 [HarpiesFeatherDuster] ${destroyedCard.name || destroyedCard.cardName} destruída - removendo equipamento`);
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, destroyedCard, i);
        } else if (isExactCard(destroyedCard, 'PrematureBurial')) {
          logger.info(`💥 [HarpiesFeatherDuster] Premature Burial destruída - monstro equipado também vai ao cemitério`);
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, !isPlayer1, undefined, destroyedCard, i);
        } else {
          // Se outra spell/trap foi destruída, recalcular ATK do MagePower ANTES de remover
          await (duelsService as any).recalculateMagePowerAtk(duelId, duel, !isPlayer1);
        }
        
        destroyedCards.push(destroyedCard);
        if (opponentField.spellTrap[i] !== null && opponentField.spellTrap[i] !== undefined) {
          opponentField.spellTrap[i] = null;
          opponentField.graveyard.push(destroyedCard);
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
      
      // Processar efeitos especiais primeiro (antes de destruir)
      // CRÍTICO: Usar duelsService.isExactCard para Change Of Heart/Brain Control (reconhece por nome e id)
      for (const { card, zoneIndex } of cardsToDestroy) {
        const cardName = card.name || card.cardName || 'Desconhecida';
        const isChangeOrBrain = (duelsService as any).isExactCard?.(card, 'ChangeOfHeart') || (duelsService as any).isExactCard?.(card, 'BrainControl') || isExactCard(card, 'ChangeOfHeart') || isExactCard(card, 'BrainControl');
        
        // Processar efeitos especiais antes de destruir
        if (isChangeOrBrain) {
          logger.info(`💥 [HeavyStorm] ${cardName} destruída - devolvendo monstros controlados`);
          await (duelsService as any).returnChangeOfHeartMonsters(duelId, duel, isPlayer1Field);
        } else if (isExactCard(card, 'UnitedWeStand') || isExactCard(card, 'MagePower')) {
          logger.info(`💥 [HeavyStorm] ${cardName} destruída - removendo equipamento`);
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1Field, undefined, card, zoneIndex);
        } else if ((duelsService as any).isExactCard?.(card, 'PrematureBurial') || isExactCard(card, 'PrematureBurial')) {
          logger.info(`💥 [HeavyStorm] ${cardName} destruída - monstro equipado também vai ao cemitério`);
          await (duelsService as any).handleEquipmentDestruction(duelId, duel, isPlayer1Field, undefined, card, zoneIndex);
        } else if (isExactCard(card, 'AutonomousActionUnit')) {
          logger.info(`💥 [HeavyStorm] ${cardName} destruída - destruindo monstro equipado`);
          await (duelsService as any).handleAutonomousActionUnitDestruction(duelId, duel, isPlayer1Field, zoneIndex);
        }
      }
      
      // Recalcular ATK do MagePower uma única vez após processar todos os efeitos especiais
      await (duelsService as any).recalculateMagePowerAtk(duelId, duel, isPlayer1Field);
      
      // Agora destruir todas as cartas: Mover para o cemitério e limpar a zona (pular zonas já tratadas, ex: Premature Burial)
      let destroyed = 0;
      for (const { card, zoneIndex } of cardsToDestroy) {
        if (field.spellTrap[zoneIndex] === null || field.spellTrap[zoneIndex] === undefined) {
          continue;
        }
        const cardName = card.name || card.cardName || 'Desconhecida';
        logger.info(`💥 [HeavyStorm] Destruindo ${cardName} (zona ${zoneIndex})`);
        
        // CRÍTICO: Primeiro mover para o cemitério
        field.graveyard.push(card);
        
        // CRÍTICO: Depois limpar a zona do campo (remover do campo)
        field.spellTrap[zoneIndex] = null;
        
        destroyed++;
        logger.info(`✅ [HeavyStorm] ${cardName} removida do campo e movida para o cemitério`);
      }
      
      // Verificar se todas as cartas foram realmente removidas
      const remainingCards = field.spellTrap.filter((c: any) => c !== null && c !== undefined).length;
      if (remainingCards > 0) {
        logger.warn(`⚠️ [HeavyStorm] Ainda há ${remainingCards} carta(s) no campo após destruição!`);
        // Forçar remoção de qualquer carta restante
        for (let i = 0; i < field.spellTrap.length; i++) {
          if (field.spellTrap[i] !== null && field.spellTrap[i] !== undefined) {
            const remainingCard = field.spellTrap[i];
            field.graveyard.push(remainingCard);
            field.spellTrap[i] = null;
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
 * Swords Of Revealing Light - Bloqueia ataques do oponente por 3 turnos
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
          
          // Verificar se é Fiber Jar, SnowmanEater, MorphingJar ou Dekoichi e processar efeito de flip
          const monsterCardId = monster.idCarta || monster.id || monster.cardId;
          const isFiberJar = (monsterCardId === 'FiberJar' || (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('fiberjar')));
          const isSnowmanEater = (monsterCardId === 'SnowmanEater' || (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('snowmaneater')));
          const isMorphingJar = (monsterCardId === 'MorphingJar' || (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('morphingjar')));
          const isDekoichi = (monsterCardId === 'DekoichiTheBattlechantedLocomotive' || (typeof monsterCardId === 'string' && monsterCardId.toLowerCase().includes('dekoichi')));
          
          if (isFiberJar || isSnowmanEater || isMorphingJar || isDekoichi) {
            await (duelsService as any).cardEffectsService.processFlipEffect(duelId, duel, !isPlayer1, monster, i);
          }
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

