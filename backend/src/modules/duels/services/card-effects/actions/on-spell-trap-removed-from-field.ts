import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as EternalSoul from '../effects/traps/eternal-soul';

/** Registered effect action; public API remains on DuelsService. */
export async function onSpellTrapRemovedFromField(host: DuelsService, duelId: string | number, duel: Duel, isPlayer1: boolean, zoneIndex: number): Promise<void> {
    const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    if (!playerField?.spellTrap || zoneIndex < 0 || zoneIndex >= playerField.spellTrap.length) return;
    const card = playerField.spellTrap[zoneIndex];
    if (card === null || card === undefined) return;
    if (host['isExactCard'](card, 'AutonomousActionUnit')) {
      await host['handleAutonomousActionUnitDestruction'](duelId, duel, isPlayer1, zoneIndex);
      return;
    }
    if (host['isExactCard'](card, 'PrematureBurial')) {
      await host['handleEquipmentDestruction'](duelId, duel, isPlayer1, undefined, card, zoneIndex);
      return;
    }
    // Eternal Soul face-up saindo do campo → destruir todos os monstros que você controla
    if (EternalSoul.isEternalSoul(card)) {
      const pos = String(card.position || '').toLowerCase();
      if (pos === 'face-up' || pos === 'activated') {
        await host['destroyAllMonstersControlledByEternalSoulLeave'](duelId, duel, isPlayer1);
      }
    }

    // Magic Formula: gain 1000 LP when sent from field to GY
    if (host['isExactCard'](card, 'MagicFormula')) {
      const pos = String(card.position || '').toLowerCase();
      if (pos === 'face-up' || pos === 'activated') {
        if (isPlayer1) {
          duel.player1LifePoints = (duel.player1LifePoints || 0) + 1000;
        } else {
          duel.player2LifePoints = (duel.player2LifePoints || 0) + 1000;
        }
        logger.info(`✨ [MagicFormula] Jogador ${isPlayer1 ? 1 : 2} ganhou 1000 LP ao enviá-la ao GY`);
      }
    }
  }
