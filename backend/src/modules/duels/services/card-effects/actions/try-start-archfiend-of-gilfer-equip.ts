import type { DuelsService } from '../../../duels.service';
import { Duel } from '../../../entities/duel.entity';
import { logger } from '../../../../../common/utils/logger.util';
import * as ArchfiendOfGilfer from '../effects/Monsters/archfiend-of-gilfer';

/** Registered effect action; public API remains on DuelsService. */
export async function tryStartArchfiendOfGilferEquip(host: DuelsService, duelId: string | number, duel: Duel, ownerIsPlayer1: boolean): Promise<boolean> {
    const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();

    if ((duel as any).pendingChoice) {
      logger.info(`👹 [Gilfer] skip: já existe pendingChoice ${(duel as any).pendingChoice?.type}`);
      return false;
    }

    const ownerField = ownerIsPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const playerField = ownerIsPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
    const opponentField = ownerIsPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;

    // Check for Gilfer trigger flag
    if (!ownerField.gilferTriggerPending || ownerField.gilferTriggerPending.length === 0) {
      return false;
    }

    // Clear trigger flag
    ownerField.gilferTriggerPending = [];

    // Check if Gilfer is in GY
    const gy = ownerField.graveyard || [];
    const gilferIndex = gy.findIndex((c: any) => c && ArchfiendOfGilfer.isArchfiendOfGilfer(c));
    if (gilferIndex === -1) {
      logger.info(`👹 [Gilfer] não encontrado no cemitério`);
      return false;
    }

    // Check if owner has empty S/T zone
    if (!ArchfiendOfGilfer.canActivateArchfiendOfGilferEffect(ownerField)) {
      logger.info(`👹 [Gilfer] sem zona S/T vazia para equipar`);
      return false;
    }

    // Check for face-up monsters on field (both sides)
    const targets = ArchfiendOfGilfer.collectFaceUpMonstersBothFields(playerField, opponentField);
    if (targets.length === 0) {
      logger.info(`👹 [Gilfer] sem monstros face-up para equipar`);
      return false;
    }

    logger.info(`👹 [Gilfer] criando pendingChoice: ${targets.length} alvo(s) disponível(is)`);

    await host['setPendingChoice'](duelIdStr, {
      type: 'ARCHFIEND_OF_GILFER',
      userId: ownerIsPlayer1 ? Number(duel.player1Id) : Number(duel.player2Id),
      turnWhenStarted: duel.currentTurn,
      phaseWhenStarted: duel.currentPhase || 'MAIN1',
      data: {
        gilferGyIndex: gilferIndex,
        availableTargets: targets,
      },
    });

    return true;
  }
