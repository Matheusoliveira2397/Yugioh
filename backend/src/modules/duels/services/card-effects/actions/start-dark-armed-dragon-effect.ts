import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startDarkArmedDragonEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
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
      return { success: false, message: 'Você só pode usar este efeito nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;

    // Verificar se o Dark Armed Dragon existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do Dark Armed Dragon inválida' };
    }

    const darkArmedDragon = playerField.monsters[monsterZoneIndex];
    if (!darkArmedDragon || darkArmedDragon === null) {
      return { success: false, message: 'Dark Armed Dragon não encontrado no campo' };
    }

    // Verificar se é realmente Dark Armed Dragon
    const cardId = darkArmedDragon.idCarta || darkArmedDragon.id || darkArmedDragon.cardId;
    const cardName = (darkArmedDragon.name || darkArmedDragon.cardName || '').toLowerCase();
    const isDarkArmedDragon = cardId === 'DarkArmedDragon' ||
                              cardId === 'darkarmeddragon' ||
                              cardId === 'Dark-ArmedDragon' ||
                              cardId === 'DarkArmed-Dragon' ||
                              cardName === 'dark armed dragon' ||
                              cardName === 'dark-armed dragon' ||
                              cardName === 'darkarmeddragon' ||
                              host['isExactCard'](darkArmedDragon, 'DarkArmedDragon');

    if (!isDarkArmedDragon) {
      return { success: false, message: 'Carta no campo não é Dark Armed Dragon' };
    }

    // Coletar monstros Dark do cemitério (pode usar quantas vezes quiser enquanto houver monstros Dark)
    const graveyard = playerField.graveyard || [];
    const darkMonsters = graveyard.filter((c: any, index: number) => {
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
    }).map((c: any, index: number) => ({
      ...c,
      graveyardIndex: graveyard.findIndex((gc: any) => {
        const gcId = gc?.idCarta || gc?.id || gc?.cardId;
        const cId = c?.idCarta || c?.id || c?.cardId;
        return gcId === cId || String(gcId) === String(cId);
      }),
    }));

    if (darkMonsters.length === 0) {
      return { success: false, message: 'Não há monstros do atributo Dark no seu cemitério para banir' };
    }

    // Preparar dados para o frontend
    const darkMonstersWithIndex = darkMonsters.map((c: any, index: number) => ({
      ...c,
      graveyardIndex: graveyard.findIndex((gc: any) => {
        const gcId = gc?.idCarta || gc?.id || gc?.cardId;
        const cId = c?.idCarta || c?.id || c?.cardId;
        return gcId === cId || String(gcId) === String(cId);
      }),
    }));

    logger.info(`✅ [startDarkArmedDragonEffect] Validação concluída - ${darkMonsters.length} monstros Dark disponíveis (efeito pode ser usado múltiplas vezes)`);

    // Retornar dados para o gateway emitir evento ao frontend
    return {
      success: true,
      data: {
        monsterZoneIndex: monsterZoneIndex,
        darkMonsters: darkMonstersWithIndex,
      }
    };
  }
