import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startChaosSorcererSpecialSummon(host: DuelsService, duelId: string | number, userId: number, cardId: string): Promise<{ success: boolean; message?: string; data?: any }> {
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
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);

    if (!isCurrentTurn) {
      return { success: false, message: 'Não é seu turno' };
    }

    // Pode ser invocada em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode invocar esta carta nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    if (!playerField || !playerField.hand) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    logger.info(`🔍 [startChaosSorcererSpecialSummon] Buscando carta na mão com cardId: ${cardId}`);
    logger.info(`🔍 [startChaosSorcererSpecialSummon] Cartas na mão (${playerField.hand.length}):`, playerField.hand.map((c: any, idx: number) => ({
      index: idx,
      idCarta: c.idCarta,
      id: c.id,
      cardId: c.cardId,
      instanceId: c.instanceId,
      name: c.name || c.cardName,
    })));

    const cardIdStr = String(cardId).trim();
    const cardIdLower = cardIdStr.toLowerCase();

    // Buscar a carta na mão (pode ser qualquer uma das cartas Chaos)
    // Primeiro, tentar encontrar por ID exato (instanceId tem prioridade, depois idCarta, id, cardId)
    let cardIndex = playerField.hand.findIndex((c: any) => {
      // Verificar instanceId primeiro (mais confiável)
      if (c.instanceId && String(c.instanceId).trim() === cardIdStr) {
        return true;
      }

      // Verificar idCarta
      if (c.idCarta) {
        const cIdCarta = String(c.idCarta).trim();
        if (cIdCarta === cardIdStr || cIdCarta.toLowerCase() === cardIdLower) {
          return true;
        }
      }

      // Verificar id
      if (c.id) {
        const cId = String(c.id).trim();
        if (cId === cardIdStr || cId.toLowerCase() === cardIdLower) {
          return true;
        }
      }

      // Verificar cardId
      if (c.cardId) {
        const cCardId = String(c.cardId).trim();
        if (cCardId === cardIdStr || cCardId.toLowerCase() === cardIdLower) {
          return true;
        }
      }

      // Verificar se algum contém o outro (fallback)
      const cIdCarta = c.idCarta ? String(c.idCarta).toLowerCase().trim() : '';
      const cId = c.id ? String(c.id).toLowerCase().trim() : '';
      const cCardId = c.cardId ? String(c.cardId).toLowerCase().trim() : '';
      const cInstanceId = c.instanceId ? String(c.instanceId).toLowerCase().trim() : '';

      if ((cIdCarta && (cardIdLower.includes(cIdCarta) || cIdCarta.includes(cardIdLower))) ||
          (cId && (cardIdLower.includes(cId) || cId.includes(cardIdLower))) ||
          (cCardId && (cardIdLower.includes(cCardId) || cCardId.includes(cardIdLower))) ||
          (cInstanceId && (cardIdLower.includes(cInstanceId) || cInstanceId.includes(cardIdLower)))) {
        return true;
      }

      return false;
    });

    // Se não encontrou por ID, tentar encontrar por tipo de carta Chaos
    if (cardIndex === -1) {
      logger.info(`🔍 [startChaosSorcererSpecialSummon] Não encontrado por ID, tentando por tipo de carta Chaos...`);

      // Verificar se o cardId solicitado corresponde a uma carta Chaos
      const requestedIsChaosSorcerer = host['isExactCard']({ idCarta: cardId, name: cardId }, 'ChaosSorcerer');
      const requestedIsChaosEmperorDragon = host['isExactCard']({ idCarta: cardId, name: cardId }, 'ChaosEmperorDragon');
      const requestedIsBlackLusterSoldier = host['isExactCard']({ idCarta: cardId, name: cardId }, 'BlackLusterSoldierEnvoyOfTheBeginning');

      logger.info(`🔍 [startChaosSorcererSpecialSummon] Tipo solicitado:`, {
        requestedIsChaosSorcerer,
        requestedIsChaosEmperorDragon,
        requestedIsBlackLusterSoldier,
      });

      // Se o cardId solicitado é uma carta Chaos, buscar qualquer carta Chaos do mesmo tipo na mão
      if (requestedIsChaosSorcerer || requestedIsChaosEmperorDragon || requestedIsBlackLusterSoldier) {
        cardIndex = playerField.hand.findIndex((c: any) => {
          const isChaosSorcerer = host['isExactCard'](c, 'ChaosSorcerer');
          const isChaosEmperorDragon = host['isExactCard'](c, 'ChaosEmperorDragon');
          const isBlackLusterSoldier = host['isExactCard'](c, 'BlackLusterSoldierEnvoyOfTheBeginning');

          // Se o tipo solicitado corresponde ao tipo da carta na mão
          if (requestedIsChaosSorcerer && isChaosSorcerer) return true;
          if (requestedIsChaosEmperorDragon && isChaosEmperorDragon) return true;
          if (requestedIsBlackLusterSoldier && isBlackLusterSoldier) return true;

          return false;
        });
      }
    }

    if (cardIndex === -1) {
      logger.error(`❌ [startChaosSorcererSpecialSummon] Carta não encontrada na mão!`, {
        cardIdProcurado: cardId,
        cartasNaMao: playerField.hand.map((c: any) => ({
          idCarta: c.idCarta,
          id: c.id,
          cardId: c.cardId,
          instanceId: c.instanceId,
          name: c.name || c.cardName,
        })),
      });
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    logger.info(`✅ [startChaosSorcererSpecialSummon] Carta encontrada na mão no índice ${cardIndex}`);

    const card = playerField.hand[cardIndex];

    // Verificar se é uma carta Chaos válida
    const chaosCheck = host['isChaosSpecialSummonCard'](card);
    if (!chaosCheck.isChaos) {
      return { success: false, message: 'Esta carta não pode ser invocada por invocação especial desta forma' };
    }

    const cardDisplayName = chaosCheck.cardName;

    // Verificar se o cemitério existe
    if (!playerField.graveyard || !Array.isArray(playerField.graveyard)) {
      return { success: false, message: 'Cemitério não encontrado ou vazio' };
    }

    // Filtrar apenas monstros no cemitério (sem validar atributos ainda - isso será feito na confirmação)
    const monstersInGraveyard = playerField.graveyard
      .map((c: any, index: number) => ({ card: c, originalIndex: index }))
      .filter((item: any) => {
        const cardType = (item.card.type || item.card.cardType || '').toString().toUpperCase().trim();
        const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
        return isMonster;
      });

    logger.info(`🔍 [startChaosSorcererSpecialSummon] Total de monstros no cemitério: ${monstersInGraveyard.length}`);
    logger.info(`🔍 [startChaosSorcererSpecialSummon] Detalhes dos monstros no cemitério:`, monstersInGraveyard.map((item: any, idx: number) => {
      const card = item.card;
      const attributeRaw = card?.attribute || card?.cardAttribute || card?.card?.attribute || card?.card?.cardAttribute || '';
      return {
        index: idx,
        name: card?.name || card?.cardName,
        attribute: attributeRaw,
        attributeUpper: String(attributeRaw).toUpperCase().trim(),
        type: card?.type || card?.cardType,
        allKeys: card ? Object.keys(card) : [],
      };
    }));

    // Separar TODOS os monstros por atributo para mostrar no modal
    // A validação será feita quando o usuário confirmar a seleção
    // IMPORTANTE: As cartas no cemitério já foram compactadas, então o atributo pode estar em vários campos
    const lightMonsters = monstersInGraveyard.filter((item: any) => {
      // Tentar múltiplas formas de acessar o atributo
      const card = item.card;
      const attributeRaw = card?.attribute ||
                          card?.cardAttribute ||
                          card?.card?.attribute ||
                          card?.card?.cardAttribute || '';
      const attribute = String(attributeRaw).toUpperCase().trim();

      // Verificar se é LIGHT (enum CardAttribute.LIGHT = 'LIGHT')
      // Também verificar variações como 'LUZ', 'LIGHT', etc.
      const isLight = attribute === 'LIGHT' ||
                     attribute === 'LUZ' ||
                     (typeof attribute === 'string' && attribute.includes('LIGHT'));

      if (isLight) {
        logger.info(`✅ [startChaosSorcererSpecialSummon] Monstro LIGHT encontrado:`, {
        name: card?.name || card?.cardName,
        attribute: attribute,
      });
      }

      return isLight;
    });

    const darkMonsters = monstersInGraveyard.filter((item: any) => {
      // Tentar múltiplas formas de acessar o atributo
      const card = item.card;
      const attributeRaw = card?.attribute ||
                          card?.cardAttribute ||
                          card?.card?.attribute ||
                          card?.card?.cardAttribute || '';
      const attribute = String(attributeRaw).toUpperCase().trim();

      // Verificar se é DARK (enum CardAttribute.DARK = 'DARK')
      // Também verificar variações como 'TREVAS', 'DARK', etc.
      const isDark = attribute === 'DARK' ||
                    attribute === 'TREVAS' ||
                    (typeof attribute === 'string' && attribute.includes('DARK'));

      if (isDark) {
        logger.info(`✅ [startChaosSorcererSpecialSummon] Monstro DARK encontrado:`, {
        name: card?.name || card?.cardName,
        attribute: attribute,
      });
      }

      return isDark;
    });

    logger.info(`📊 [startChaosSorcererSpecialSummon] Monstros encontrados - LIGHT: ${lightMonsters.length}, DARK: ${darkMonsters.length}`);

    // SEMPRE abrir o modal, mesmo se não houver monstros suficientes
    // A validação será feita quando o usuário tentar confirmar

    // Criar pendingChoice para escolha dos monstros
    // Mapear os índices originais do cemitério para os índices atuais
    // IMPORTANTE: Incluir todos os IDs possíveis para facilitar a busca depois
    const lightMonstersWithIndex = lightMonsters.map((item: any) => {
      const card = item.card;
      // Encontrar o índice atual no cemitério usando múltiplos métodos
      let currentIndex = -1;

      // Tentar por instanceId primeiro
      if (card.instanceId) {
        currentIndex = playerField.graveyard.findIndex((c: any) => c.instanceId === card.instanceId);
      }

      // Se não encontrou, tentar por IDs
      if (currentIndex === -1) {
        const cardId = card.idCarta || card.id || card.cardId;
        if (cardId) {
          currentIndex = playerField.graveyard.findIndex((c: any) => {
        const cId = c.idCarta || c.id || c.cardId;
            return cId === cardId || String(cId) === String(cardId);
          });
        }
      }

      // Se ainda não encontrou, usar o índice original
      if (currentIndex === -1) {
        currentIndex = item.originalIndex;
      }

      return {
        ...card,
        idCarta: card.idCarta || card.id || card.cardId,
        id: card.id || card.idCarta || card.cardId,
        cardId: card.cardId || card.idCarta || card.id,
        instanceId: card.instanceId,
        graveyardIndex: currentIndex >= 0 ? currentIndex : item.originalIndex,
        originalIndex: item.originalIndex,
      };
    });

    const darkMonstersWithIndex = darkMonsters.map((item: any) => {
      const card = item.card;
      // Encontrar o índice atual no cemitério usando múltiplos métodos
      let currentIndex = -1;

      // Tentar por instanceId primeiro
      if (card.instanceId) {
        currentIndex = playerField.graveyard.findIndex((c: any) => c.instanceId === card.instanceId);
      }

      // Se não encontrou, tentar por IDs
      if (currentIndex === -1) {
        const cardId = card.idCarta || card.id || card.cardId;
        if (cardId) {
          currentIndex = playerField.graveyard.findIndex((c: any) => {
        const cId = c.idCarta || c.id || c.cardId;
            return cId === cardId || String(cId) === String(cardId);
          });
        }
      }

      // Se ainda não encontrou, usar o índice original
      if (currentIndex === -1) {
        currentIndex = item.originalIndex;
      }

      return {
        ...card,
        idCarta: card.idCarta || card.id || card.cardId,
        id: card.id || card.idCarta || card.cardId,
        cardId: card.cardId || card.idCarta || card.id,
        instanceId: card.instanceId,
        graveyardIndex: currentIndex >= 0 ? currentIndex : item.originalIndex,
        originalIndex: item.originalIndex,
      };
    });

    logger.info(`✅ [startChaosSorcererSpecialSummon] Validação concluída para ${cardDisplayName} - ${lightMonsters.length} LIGHT, ${darkMonsters.length} DARK`);

    // Retornar dados para o gateway emitir evento ao frontend
    return {
      success: true,
      data: {
        cardId: cardId,
        cardName: cardDisplayName,
        lightMonsters: lightMonstersWithIndex,
        darkMonsters: darkMonstersWithIndex,
      }
    };
  }
