import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startExiledForceEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
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
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Verificar se o Exiled Force existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do Exiled Force inválida' };
    }

    const exiledForce = playerField.monsters[monsterZoneIndex];
    if (!exiledForce || exiledForce === null) {
      return { success: false, message: 'Exiled Force não encontrado no campo' };
    }

    // Verificar se é realmente Exiled Force
    const cardId = exiledForce.idCarta || exiledForce.id || exiledForce.cardId;
    const cardName = (exiledForce.name || exiledForce.cardName || '').toLowerCase();
    const isExiledForce = cardId === 'ExiledForce' ||
                         cardId === 'exiledforce' ||
                         cardId === 'Exiled-Force' ||
                         cardName === 'exiled force' ||
                         cardName === 'exiled-force' ||
                         (typeof cardId === 'string' && cardId.toLowerCase().includes('exiledforce')) ||
                         (typeof cardName === 'string' && cardName.includes('exiled force'));

    if (!isExiledForce) {
      return { success: false, message: 'Carta no campo não é Exiled Force' };
    }

    // Verificar se o efeito já foi usado neste turno
    if (exiledForce.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do Exiled Force já foi usado neste turno' };
    }

    // Coletar todos os monstros disponíveis no campo (próprio e oponente)
    const availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];

    // Monstros do próprio jogador
    if (playerField.monsters && Array.isArray(playerField.monsters)) {
      playerField.monsters.forEach((m: any, index: number) => {
        if (m && m !== null && m !== undefined && index !== monsterZoneIndex) {
          // Incluir todos os monstros (face-up e face-down)
          availableMonsters.push({ monster: m, zoneIndex: index, player: 'player' });
        }
      });
    }

    // Monstros do oponente
    if (opponentField && opponentField.monsters && Array.isArray(opponentField.monsters)) {
      opponentField.monsters.forEach((m: any, index: number) => {
        if (m && m !== null && m !== undefined) {
          // Incluir todos os monstros (face-up e face-down)
          availableMonsters.push({ monster: m, zoneIndex: index, player: 'opponent' });
        }
      });
    }

    if (availableMonsters.length === 0) {
      return { success: false, message: 'Não há monstros no campo para destruir' };
    }

    logger.info(`✅ [startExiledForceEffect] Validação concluída para Exiled Force - ${availableMonsters.length} monstros disponíveis`);

    // Retornar dados para o gateway emitir evento ao frontend
    return {
      success: true,
      data: {
        monsterZoneIndex: monsterZoneIndex,
        availableMonsters: availableMonsters,
      }
    };
  }
