import type { DuelsService } from '../../../duels.service';
import { TurnPhase } from '../../../entities/duel.entity';

/** Registered effect action; public API remains on DuelsService. */
export async function startBlackLusterSoldierEffect(host: DuelsService, duelId: string | number, userId: number, monsterZoneIndex: number): Promise<{ success: boolean; message?: string; data?: any }> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
    let duel = await host['findDuelByIdFromDatabase'](duelIdStr);
    if (!duel) return { success: false, message: 'Duelo não encontrado' };

    const player1IdNum = Number(duel.player1Id);
    const player2IdNum = Number(duel.player2Id);
    const userIdNum = Number(userId);
    const isPlayer1 = player1IdNum === userIdNum;
    const isCurrentTurn = (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
    if (!isCurrentTurn) return { success: false, message: 'Não é seu turno' };

    if (duel.currentPhase !== TurnPhase.MAIN1 && duel.currentPhase !== TurnPhase.MAIN2) {
      return { success: false, message: 'Você só pode usar este efeito nas fases principais' };
    }

    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
    if (!playerField?.monsters || monsterZoneIndex < 0 || monsterZoneIndex >= 5) {
      return { success: false, message: 'Campo ou zona inválida' };
    }

    const bls = playerField.monsters[monsterZoneIndex];
    if (!bls) return { success: false, message: 'Black Luster Soldier não encontrado no campo' };

    const isBLS = host['isExactCard'](bls, 'BlackLusterSoldierEnvoyOfTheBeginning') ||
      (typeof (bls.name || bls.cardName || '') === 'string' && (bls.name || bls.cardName).toLowerCase().includes('black luster soldier'));
    if (!isBLS) return { success: false, message: 'Carta no campo não é Black Luster Soldier - Envoy of the Beginning' };

    if (bls.effectUsedThisTurn === true) {
      return { success: false, message: 'O efeito do Black Luster Soldier já foi usado neste turno' };
    }

    const p1Field = (duel as any).player1Field;
    const p2Field = (duel as any).player2Field;
    const availableMonsters: Array<{ monster: any; zoneIndex: number; player: 'player' | 'opponent' }> = [];
    if (p1Field?.monsters) {
      p1Field.monsters.forEach((m: any, i: number) => {
        if (m && (m.position === 'attack' || m.position === 'defense')) {
          availableMonsters.push({ monster: m, zoneIndex: i, player: isPlayer1 ? 'player' : 'opponent' });
        }
      });
    }
    if (p2Field?.monsters) {
      p2Field.monsters.forEach((m: any, i: number) => {
        if (m && (m.position === 'attack' || m.position === 'defense')) {
          availableMonsters.push({ monster: m, zoneIndex: i, player: isPlayer1 ? 'opponent' : 'player' });
        }
      });
    }

    return {
      success: true,
      data: { monsterZoneIndex, availableMonsters },
    };
  }
