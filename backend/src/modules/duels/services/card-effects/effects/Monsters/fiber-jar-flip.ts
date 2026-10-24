import type { DuelsService } from '../../../../duels.service';
import { CardEffectContext, SimpleCardEffectFunction } from '../../interfaces/card-effect.interface';
import { logger } from '../../../../../../common/utils/logger.util';

export function createFiberJarFlipEffect(host: DuelsService): SimpleCardEffectFunction {
  return async (context: CardEffectContext) => {
    const { duel, isPlayer1, card, zoneIndex } = context;
    const duelId = String(context.duelId);
    await (async (): Promise<void> => {
    logger.info(`✨ [CardEffectsService] Processando efeito de flip do Fiber Jar`);

    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;

    // Função auxiliar para verificar se uma carta é de Fusion
    const isFusionMonster = (card: any): boolean => {
      if (!card) return false;

      // Verificar tipo da carta
      const cardType = (card.type || card.cardType || '').toString().toLowerCase().trim();
      const isMonster = cardType === 'monster' || cardType === 'monstro' || cardType.includes('monster');

      if (!isMonster) return false;

      // Verificar se é Fusion usando múltiplos campos e comparações case-insensitive
      const monsterType = (card.monsterType || card.monster_type || '').toString().toLowerCase().trim();
      const cardName = (card.name || card.cardName || '').toLowerCase();
      const cardId = (card.idCarta || card.id || card.cardId || '').toString().toLowerCase();

      // Verificar por monsterType (campo principal) - verificar exatamente "fusion" ou contém "fusion"
      if (monsterType === 'fusion' || monsterType.includes('fusion')) {
        logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por monsterType: ${card.name || card.cardName || cardId} (monsterType: ${card.monsterType || card.monster_type})`);
        return true;
      }

      // Verificar se monsterType está em maiúsculas (Fusion)
      const monsterTypeUpper = (card.monsterType || card.monster_type || '').toString();
      if (monsterTypeUpper === 'Fusion' || monsterTypeUpper === 'FUSION') {
        logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por monsterType (maiúsculas): ${card.name || card.cardName || cardId}`);
        return true;
      }

      // Verificar por cardId se contém "fusion"
      if (cardId.includes('fusion')) {
        logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por cardId: ${card.name || card.cardName || cardId}`);
        return true;
      }

      // Verificar se a carta veio do Extra Deck (se tiver flag specialSummoned ou se estiver marcada como do Extra Deck)
      // Monstros do Extra Deck que são invocados por invocação especial geralmente são Fusion, Synchro, XYZ, etc.
      // Mas só considerar Fusion se não for Synchro, XYZ, Link, etc.
      if (card.specialSummoned === true || card.summonedFromExtraDeck === true) {
        // Se não é Synchro, XYZ, Link, Pendulum, então provavelmente é Fusion
        const isSynchro = monsterType === 'synchro' || monsterType.includes('synchro') || monsterTypeUpper === 'Synchro';
        const isXyz = monsterType === 'xyz' || monsterType.includes('xyz') || monsterTypeUpper === 'Xyz' || monsterTypeUpper === 'XYZ';
        const isLink = monsterType === 'link' || monsterType.includes('link') || monsterTypeUpper === 'Link';
        const isPendulum = monsterType === 'pendulum' || monsterType.includes('pendulum') || monsterTypeUpper === 'Pendulum';

        if (!isSynchro && !isXyz && !isLink && !isPendulum) {
          logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por specialSummoned (não é Synchro/XYZ/Link/Pendulum): ${card.name || card.cardName || cardId}`);
          return true;
        }
      }

      // Verificar se está no Extra Deck atual (cartas que estão no Extra Deck devem voltar para o Extra Deck)
      // Mas isso só funciona se a carta ainda estiver no Extra Deck, não se estiver no campo/cemitério
      const isInExtraDeck1 = player1Field.extraDeck?.some((c: any) => {
        if (!c) return false;
        const cId = c.idCarta || c.id || c.cardId;
        const cardIdToCheck = card.idCarta || card.id || card.cardId;
        return String(cId) === String(cardIdToCheck) || c.instanceId === card.instanceId;
      });
      const isInExtraDeck2 = player2Field.extraDeck?.some((c: any) => {
        if (!c) return false;
        const cId = c.idCarta || c.id || c.cardId;
        const cardIdToCheck = card.idCarta || card.id || card.cardId;
        return String(cId) === String(cardIdToCheck) || c.instanceId === card.instanceId;
      });

      if (isInExtraDeck1 || isInExtraDeck2) {
        // Se está no Extra Deck, verificar se não é Synchro, XYZ, Link, Pendulum
        const isSynchro = monsterType === 'synchro' || monsterType.includes('synchro') || monsterTypeUpper === 'Synchro';
        const isXyz = monsterType === 'xyz' || monsterType.includes('xyz') || monsterTypeUpper === 'Xyz' || monsterTypeUpper === 'XYZ';
        const isLink = monsterType === 'link' || monsterType.includes('link') || monsterTypeUpper === 'Link';
        const isPendulum = monsterType === 'pendulum' || monsterType.includes('pendulum') || monsterTypeUpper === 'Pendulum';

        if (!isSynchro && !isXyz && !isLink && !isPendulum) {
          logger.info(`✅ [Fiber Jar] Carta identificada como Fusion por estar no Extra Deck (não é Synchro/XYZ/Link/Pendulum): ${card.name || card.cardName || cardId}`);
          return true;
        }
      }

      // Log para debug se não foi identificado como Fusion
      if (cardName && !cardName.includes('token') && !cardName.includes('ficha')) {
        logger.info(`🔍 [Fiber Jar] Carta não identificada como Fusion: ${card.name || card.cardName} (type: ${card.type || card.cardType}, monsterType: ${card.monsterType || card.monster_type}, cardId: ${cardId}, specialSummoned: ${card.specialSummoned})`);
      }

      return false;
    };

    // Coletar todas as cartas de ambos os jogadores
    const allPlayer1Cards: any[] = [];
    const allPlayer2Cards: any[] = [];

    // Separar cartas de Fusion para voltarem ao Extra Deck
    const player1FusionCards: any[] = [];
    const player2FusionCards: any[] = [];

    // PRIMEIRO: Incluir o deck atual (se existir) - separar Fusion das outras
    if (player1Field.deck && Array.isArray(player1Field.deck)) {
      for (const card of player1Field.deck) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no deck do Player 1: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player1FusionCards.push(card);
          } else {
            allPlayer1Cards.push(card);
          }
        }
      }
    }

    if (player2Field.deck && Array.isArray(player2Field.deck)) {
      for (const card of player2Field.deck) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no deck do Player 2: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player2FusionCards.push(card);
          } else {
            allPlayer2Cards.push(card);
          }
        }
      }
    }

    // Cartas do campo (monstros) - separar Fusion das outras
    if (player1Field.monsters) {
      for (let i = 0; i < player1Field.monsters.length; i++) {
        if (player1Field.monsters[i] !== null && player1Field.monsters[i] !== undefined) {
          const card = player1Field.monsters[i];
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no campo do Player 1: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player1FusionCards.push(card);
          } else {
            allPlayer1Cards.push(card);
          }
          player1Field.monsters[i] = null;
        }
      }
    }

    if (player2Field.monsters) {
      for (let i = 0; i < player2Field.monsters.length; i++) {
        if (player2Field.monsters[i] !== null && player2Field.monsters[i] !== undefined) {
          const card = player2Field.monsters[i];
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no campo do Player 2: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player2FusionCards.push(card);
          } else {
            allPlayer2Cards.push(card);
          }
          player2Field.monsters[i] = null;
        }
      }
    }

    // Cartas spell/trap
    if (player1Field.spellTrap) {
      for (let i = 0; i < player1Field.spellTrap.length; i++) {
        if (player1Field.spellTrap[i] !== null && player1Field.spellTrap[i] !== undefined) {
          allPlayer1Cards.push(player1Field.spellTrap[i]);
          player1Field.spellTrap[i] = null;
        }
      }
    }

    if (player2Field.spellTrap) {
      for (let i = 0; i < player2Field.spellTrap.length; i++) {
        if (player2Field.spellTrap[i] !== null && player2Field.spellTrap[i] !== undefined) {
          allPlayer2Cards.push(player2Field.spellTrap[i]);
          player2Field.spellTrap[i] = null;
        }
      }
    }

    // Cartas da mão
    if (player1Field.hand && Array.isArray(player1Field.hand)) {
      allPlayer1Cards.push(...player1Field.hand);
      player1Field.hand = [];
    }

    if (player2Field.hand && Array.isArray(player2Field.hand)) {
      allPlayer2Cards.push(...player2Field.hand);
      player2Field.hand = [];
    }

    // Cartas do cemitério - separar Fusion das outras
    if (player1Field.graveyard && Array.isArray(player1Field.graveyard)) {
      for (const card of player1Field.graveyard) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no cemitério do Player 1: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player1FusionCards.push(card);
          } else {
            allPlayer1Cards.push(card);
          }
        }
      }
      player1Field.graveyard = [];
    }

    if (player2Field.graveyard && Array.isArray(player2Field.graveyard)) {
      for (const card of player2Field.graveyard) {
        if (card) {
          if (isFusionMonster(card)) {
            logger.info(`🔍 [Fiber Jar] Monstro Fusion encontrado no cemitério do Player 2: ${card.name || card.cardName} (monsterType: ${card.monsterType}, type: ${card.type || card.cardType})`);
            player2FusionCards.push(card);
          } else {
            allPlayer2Cards.push(card);
          }
        }
      }
      player2Field.graveyard = [];
    }

    // Cartas do Extra Deck atual - manter no Extra Deck (não incluir no deck principal)
    // Mas incluir as cartas de Fusion que estavam no campo/cemitério
    if (!player1Field.extraDeck) {
      player1Field.extraDeck = [];
    }
    if (!player2Field.extraDeck) {
      player2Field.extraDeck = [];
    }

    // Adicionar cartas de Fusion do campo/cemitério ao Extra Deck
    player1Field.extraDeck.push(...player1FusionCards);
    player2Field.extraDeck.push(...player2FusionCards);

    logger.info(`📦 [CardEffectsService] Fiber Jar: ${player1FusionCards.length} cartas de Fusion do Player 1 voltaram para o Extra Deck`);
    logger.info(`📦 [CardEffectsService] Fiber Jar: ${player2FusionCards.length} cartas de Fusion do Player 2 voltaram para o Extra Deck`);

    // Embaralhar as cartas
    const shuffleArray = (array: any[]) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    // Embaralhar e definir como novo deck
    const shuffledPlayer1Deck = shuffleArray(allPlayer1Cards);
    const shuffledPlayer2Deck = shuffleArray(allPlayer2Cards);

    player1Field.deck = shuffledPlayer1Deck;
    player2Field.deck = shuffledPlayer2Deck;

    // IMPORTANTE: Embaralhar também o Extra Deck após adicionar as cartas Fusion
    if (player1Field.extraDeck && player1Field.extraDeck.length > 0) {
      player1Field.extraDeck = shuffleArray(player1Field.extraDeck);
      logger.info(`🔀 [CardEffectsService] Fiber Jar: Extra Deck do Player 1 embaralhado (${player1Field.extraDeck.length} cartas)`);
    }
    if (player2Field.extraDeck && player2Field.extraDeck.length > 0) {
      player2Field.extraDeck = shuffleArray(player2Field.extraDeck);
      logger.info(`🔀 [CardEffectsService] Fiber Jar: Extra Deck do Player 2 embaralhado (${player2Field.extraDeck.length} cartas)`);
    }

    logger.info(`✅ [CardEffectsService] Fiber Jar: ${allPlayer1Cards.length} cartas do Player 1 e ${allPlayer2Cards.length} cartas do Player 2 voltaram para os decks`);

    // ATUALIZAR NO BANCO ANTES DE COMPRAR CARTAS
    await host.updateDuelInDatabase(duelId, {
      player1Field: player1Field,
      player2Field: player2Field,
    } as any);

    // Atualizar cache através do método público
    const activeDuels = (host as any).activeDuels;
    if (activeDuels) {
      activeDuels.set(duelId, duel);
    }

    // AGORA cada jogador compra 5 cartas (usando o deck atualizado)
    for (let i = 0; i < 5; i++) {
      // Buscar duelo atualizado do cache/banco antes de cada compra
      const activeDuels = (host as any).activeDuels;
      let currentDuel = activeDuels ? activeDuels.get(duelId) : null;
      if (!currentDuel) {
        currentDuel = await host.findDuelByIdFromDatabase(duelId);
        if (currentDuel && activeDuels) {
          activeDuels.set(duelId, currentDuel);
        }
      }

      if (currentDuel) {
        const p1Field = (currentDuel as any).player1Field;
        const p2Field = (currentDuel as any).player2Field;

        // Comprar carta do Player 1
        if (p1Field && p1Field.deck && p1Field.deck.length > 0) {
          const card1 = p1Field.deck.shift();
          if (card1) {
            if (!p1Field.hand) p1Field.hand = [];
            p1Field.hand.push(card1);
          }
        }

        // Comprar carta do Player 2
        if (p2Field && p2Field.deck && p2Field.deck.length > 0) {
          const card2 = p2Field.deck.shift();
          if (card2) {
            if (!p2Field.hand) p2Field.hand = [];
            p2Field.hand.push(card2);
          }
        }

        // Atualizar no banco após cada compra
        await host.updateDuelInDatabase(duelId, {
          player1Field: p1Field,
          player2Field: p2Field,
        } as any);

        // Atualizar cache
        host['activeDuels'].set(duelId, currentDuel);
      }
    }

    logger.info(`✅ [CardEffectsService] Fiber Jar: Cada jogador comprou 5 cartas`);

    // Buscar duelo final atualizado
    const finalDuel = await host.findDuelByIdFromDatabase(duelId);
    if (finalDuel) {
      Object.assign(duel, finalDuel);
      host['activeDuels'].set(duelId, duel);
    }

    })();
    return { success: true };
  };
}
