import { logger } from '../../../../../../common/utils/logger.util';

/**
 * Light of Intervention (YGOPRO_62867251)
 * Continuous Trap: Monsters cannot be Set. Sets become face-up Defense.
 * (Enforcement handled in summon logic, not as activation)
 */
export const createLightOfInterventionEffect = (duelsService: any): any => {
  return async (context: any): Promise<any> => {
    const { duelId, duel } = context;
    logger.info(`✨ [LightOfIntervention] Continuous Trap ativada - permanece no campo`);
    
    await (duelsService as any).syncDuelState(duelId, duel, {
      player1Field: (duel as any).player1Field,
      player2Field: (duel as any).player2Field,
    });
    
    return {
      success: true,
      createdPendingChoice: false,
      message: 'Light of Intervention: Continuous Trap ativada',
    };
  };
};
