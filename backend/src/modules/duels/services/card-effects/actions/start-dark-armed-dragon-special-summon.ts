import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startDarkArmedDragonSpecialSummon(host: DuelsService, duelId: string | number, userId: number, cardId: string): Promise<{ success: boolean; message?: string; data?: any }> {
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

    // Pode ser usado em qualquer fase principal
    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode invocar por invocação especial nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Verificar se a carta está na mão
    if (!playerField || !playerField.hand || !Array.isArray(playerField.hand)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    // Buscar a carta na mão - cartas com mesmo nome são tratadas como iguais
    const cardIndex = playerField.hand.findIndex((c: any) => {
      if (!c) return false;

      // Comparar por nome primeiro (cartas com mesmo nome são iguais)
      const cName = (c.name || c.cardName || '').trim().toLowerCase();
      const searchName = String(cardId).trim().toLowerCase();
      // Se cardId parece ser um nome (contém espaços ou é "dark armed dragon")
      if (cName && (cName === searchName || cName === 'dark armed dragon' || searchName === 'dark armed dragon')) {
        return true;
      }

      const cId = c.idCarta || c.id || c.cardId;
      const cInstanceId = c.instanceId;
      // Comparar por idCarta/id/cardId ou instanceId (com conversão de string para garantir compatibilidade)
      return cId === cardId ||
             String(cId) === String(cardId) ||
             cInstanceId === cardId ||
             String(cInstanceId) === String(cardId);
    });

    if (cardIndex === -1) {
      logger.error(`❌ [startDarkArmedDragonSpecialSummon] Carta não encontrada na mão - cardId procurado: ${cardId}, mão:`,
        playerField.hand.map((c: any) => ({
          idCarta: c?.idCarta,
          id: c?.id,
          cardId: c?.cardId,
          instanceId: c?.instanceId,
          name: c?.name || c?.cardName
        }))
      );
      return { success: false, message: 'Carta não encontrada na mão' };
    }

    const card = playerField.hand[cardIndex];

    // Verificar se é Dark Armed Dragon
    const cardIdCheck = card.idCarta || card.id || card.cardId;
    const cardName = (card.name || card.cardName || '').toLowerCase();
    const isDarkArmedDragon = cardIdCheck === 'DarkArmedDragon' ||
                              cardIdCheck === 'darkarmeddragon' ||
                              cardIdCheck === 'Dark-ArmedDragon' ||
                              cardIdCheck === 'DarkArmed-Dragon' ||
                              cardName === 'dark armed dragon' ||
                              cardName === 'dark-armed dragon' ||
                              cardName === 'darkarmeddragon' ||
                              host['isExactCard'](card, 'DarkArmedDragon');

    if (!isDarkArmedDragon) {
      return { success: false, message: 'Carta não é Dark Armed Dragon' };
    }

    // Verificar se há espaço no campo
    if (!playerField.monsters || !Array.isArray(playerField.monsters)) {
      playerField.monsters = [null, null, null, null, null];
    }
    const emptyZoneIndex = playerField.monsters.findIndex((m: any) => m === null || m === undefined);
    if (emptyZoneIndex === -1) {
      return { success: false, message: 'Não há espaço no seu campo para invocar um monstro' };
    }

    // Coletar monstros Dark do cemitério
    // IMPORTANTE: Conta TODOS os monstros Dark, mesmo que tenham o mesmo nome
    // Cada carta no cemitério é contada separadamente, independente do nome
    const graveyard = playerField.graveyard || [];
    const darkMonsters = graveyard.filter((c: any) => {
      if (!c) return false;
      const cardType = (c.type || c.cardType || '').toString().toUpperCase().trim();
      const isMonster = cardType === 'MONSTER' || cardType === 'MONSTRO' || cardType.includes('MONSTER');
      if (!isMonster) return false;

      const attributeRaw = c.attribute || c.cardAttribute || '';
      const attribute = String(attributeRaw).toUpperCase().trim();
      const isDark = attribute === 'DARK' ||
                    attribute === 'TREVAS' ||
                    (typeof attribute === 'string' && attribute.includes('DARK'));

      return isDark;
    });

    logger.info(`🔍 [startDarkArmedDragonSpecialSummon] Monstros Dark no cemitério: ${darkMonsters.length} (contando todos, mesmo com mesmo nome)`);

    // Verificar se há EXATAMENTE 3 monstros Dark no cemitério
    if (darkMonsters.length !== 3) {
      return { success: false, message: `Você precisa ter exatamente 3 monstros do atributo Dark no seu cemitério para invocar Dark Armed Dragon (você tem ${darkMonsters.length})` };
    }

    // Verificar se há zona vazia
    const emptyZones = [];
    for (let i = 0; i < 5; i++) {
      if (!playerField.monsters[i] || playerField.monsters[i] === null) {
        emptyZones.push(i);
      }
    }

    if (emptyZones.length === 0) {
      return { success: false, message: 'Não há zonas de monstro vazias' };
    }

    logger.info(`✅ [startDarkArmedDragonSpecialSummon] Validação concluída - ${emptyZones.length} zonas vazias disponíveis`);

    // Retornar dados para o gateway emitir evento ao frontend
    // Usar instanceId como prioridade para garantir que a busca na mão funcione corretamente
    const cardIdToReturn = card.instanceId || card.idCarta || card.id || card.cardId || cardId;

    return {
      success: true,
      data: {
        cardId: cardIdToReturn,
        cardInstanceId: card.instanceId,
        cardData: card,
        emptyZones: emptyZones,
      }
    };
  }
