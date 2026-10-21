import { logger } from '../../../../../../common/utils/logger.util';
import type { Duel } from '../../../../entities/duel.entity';

/**
 * Cloning (YGOPRO_86871614)
 * Trap: When opponent NS/Flip Summons, SS Clone Token with same stats.
 * When original is destroyed, destroy token.
 */
export async function checkAndActivateCloning(
  host: any,
  duelId: string | number,
  duel: Duel,
  isPlayer1: boolean,
  monsterZoneIndex: number,
  monster: any,
): Promise<boolean> {
  const duelIdStr = typeof duelId === 'string' ? duelId : duelId.toString();
  
  if (host.isJinzoOnField(duel)) {
    logger.info(`🤖 [Cloning] Jinzo está no campo - trap não pode ser ativada`);
    return false;
  }
  
  const playerField = isPlayer1 ? (duel as any).player1Field : (duel as any).player2Field;
  const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
  
  if (!opponentField || !opponentField.spellTrap || !Array.isArray(opponentField.spellTrap)) {
    return false;
  }
  
  // Find Cloning set
  let cloningZone = -1;
  for (let i = 0; i < opponentField.spellTrap.length; i++) {
    const trap = opponentField.spellTrap[i];
    if (trap && trap !== null) {
      const trapPosition = trap.position || 'set';
      const isCloning = host.isExactCard(trap, 'Cloning') || 
                       host.isExactCard(trap, 'YGOPRO_86871614');
      if (isCloning && trapPosition === 'set') {
        cloningZone = i;
        logger.info(`🧬 [Cloning] Encontrada na zona ${i}`);
        break;
      }
    }
  }
  
  if (cloningZone === -1) {
    return false;
  }
  
  // Find empty zone for token
  if (!opponentField.monsters) opponentField.monsters = [null, null, null, null, null];
  let emptyZ = -1;
  for (let i = 0; i < opponentField.monsters.length; i++) {
    if (!opponentField.monsters[i]) {
      emptyZ = i;
      break;
    }
  }
  
  if (emptyZ < 0) {
    logger.info(`⚠️ [Cloning] Sem zona vazia para Clone Token`);
    return false;
  }
  
  logger.info(`🧬 [Cloning] Ativada! Criando Clone Token`);
  
  // Create Clone Token copying monster stats
  const currentTurnCounter = opponentField?.turnCounter || duel.turnCounter || 1;
  const originalInstanceId = monster.instanceId || `monster_${Date.now()}_${Math.random()}`;
  
  opponentField.monsters[emptyZ] = {
    name: `${monster.name || monster.cardName} (Clone Token)`,
    cardName: `${monster.name || monster.cardName} (Clone Token)`,
    idCarta: 'CloneToken',
    type: 'Monster',
    race: monster.race || 'Warrior',
    attribute: monster.attribute || 'EARTH',
    level: monster.level || 4,
    atk: monster.atk || monster.ATK || 0,
    ATK: monster.atk || monster.ATK || 0,
    def: monster.def || monster.DEF || 0,
    DEF: monster.def || monster.DEF || 0,
    position: 'attack',
    isToken: true,
    cloneToken: true,
    clonedFrom: originalInstanceId,
    summonedTurnNumber: currentTurnCounter,
    summonedByPlayer: duel.currentTurn,
    positionChangedThisTurn: false,
    attackedThisTurn: false,
    attacksThisTurn: 0,
    specialSummoned: true,
  };
  
  // Mark original with clone link
  if (monster) {
    monster.hasCloneToken = true;
    monster.cloneTokenZone = emptyZ;
    monster.cloneTokenOwner = !isPlayer1;
  }
  
  logger.info(`🧬 [Cloning] Clone Token criado na zona ${emptyZ}`);
  
  // Move Cloning to GY
  const cloningTrap = opponentField.spellTrap[cloningZone];
  if (cloningTrap) {
    if (!opponentField.graveyard) opponentField.graveyard = [];
    opponentField.graveyard.push(cloningTrap);
    opponentField.spellTrap[cloningZone] = null;
    logger.info(`✅ [Cloning] Movida para o cemitério após ativação`);
    await host.recalculateMagePowerAtk(duelId, duel, !isPlayer1);
  }
  
  await host.recalculateUnitedWeStandForBothPlayers(duelId, duel);
  
  await host.updateDuelInDatabase(duelId, {
    player1Field: (duel as any).player1Field,
    player2Field: (duel as any).player2Field,
  } as any);
  
  host.activeDuels.set(duelIdStr, duel);
  
  return true;
}
