import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';

/** Registered effect action; public API remains on DuelsService. */
export async function startChaosSorcererEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
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

    // Verificar se o ChaosSorcerer existe e está no campo
    if (!playerField || !playerField.monsters || !Array.isArray(playerField.monsters)) {
      return { success: false, message: 'Campo do jogador não encontrado' };
    }

    if (monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Zona do ChaosSorcerer inválida' };
    }

    const chaosSorcerer = playerField.monsters[monsterZoneIndex];
    if (!chaosSorcerer || chaosSorcerer === null) {
      return { success: false, message: 'ChaosSorcerer não encontrado no campo' };
    }

    // Verificar se é realmente ChaosSorcerer
    const cardId = chaosSorcerer.idCarta || chaosSorcerer.id || chaosSorcerer.cardId;
    const cardName = (chaosSorcerer.name || chaosSorcerer.cardName || '').toLowerCase();
    const isChaosSorcerer = cardId === 'ChaosSorcerer' ||
                           cardId === 'chaossorcerer' ||
                           cardName === 'chaos sorcerer' ||
                           (typeof cardId === 'string' && cardId.toLowerCase().includes('chaossorcerer'));

    if (!isChaosSorcerer) {
      return { success: false, message: 'Carta no campo não é ChaosSorcerer' };
    }

    // Verificar se o efeito já foi usado neste turno
    logger.info(`🔍 [startChaosSorcererEffect] Verificando se efeito já foi usado:`, {
      effectUsedThisTurn: chaosSorcerer.effectUsedThisTurn,
      cannotAttackThisTurn: chaosSorcerer.cannotAttackThisTurn,
      monsterName: chaosSorcerer.name || chaosSorcerer.cardName,
      monsterZoneIndex,
    });

    if (chaosSorcerer.effectUsedThisTurn === true) {
      logger.warn(`⚠️ [startChaosSorcererEffect] Efeito já foi usado neste turno!`);
      return { success: false, message: 'O efeito do ChaosSorcerer já foi usado neste turno' };
    }

    // Verificar se há monstros face-up no campo
    const player1Field = (duel as any).player1Field;
    const player2Field = (duel as any).player2Field;

    let hasFaceUpMonsters = false;

    // Verificar monstros do Player1
    if (player1Field && player1Field.monsters && Array.isArray(player1Field.monsters)) {
      for (const monster of player1Field.monsters) {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          hasFaceUpMonsters = true;
          break;
        }
      }
    }

    // Verificar monstros do Player2
    if (!hasFaceUpMonsters && player2Field && player2Field.monsters && Array.isArray(player2Field.monsters)) {
      for (const monster of player2Field.monsters) {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          hasFaceUpMonsters = true;
          break;
        }
      }
    }

    if (!hasFaceUpMonsters) {
      return { success: false, message: 'Não há monstros face-up no campo para banir' };
    }

    // Coletar monstros face-up do campo (próprio e oponente)
    const availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];

    // Coletar monstros do próprio campo
    if (playerField && playerField.monsters && Array.isArray(playerField.monsters)) {
      playerField.monsters.forEach((monster: any, index: number) => {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          availableMonsters.push({ monster, zoneIndex: index, player: 'player' });
        }
      });
    }

    // Coletar monstros do campo do oponente
    if (opponentField && opponentField.monsters && Array.isArray(opponentField.monsters)) {
      opponentField.monsters.forEach((monster: any, index: number) => {
        if (monster && monster !== null && (monster.position === 'attack' || monster.position === 'defense')) {
          availableMonsters.push({ monster, zoneIndex: index, player: 'opponent' });
        }
      });
    }

    logger.info(`✅ [startChaosSorcererEffect] Validação concluída para ChaosSorcerer - ${availableMonsters.length} monstros face-up encontrados`);

    // Retornar dados para o gateway emitir evento ao frontend
    return {
      success: true,
      data: {
        monsterZoneIndex: monsterZoneIndex,
        availableMonsters: availableMonsters,
      }
    };
  }
