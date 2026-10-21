/**
 * Cyber Twin Dragon
 * 
 * This card can make a second attack during each Battle Phase.
 * 
 * Note: The double attack logic is implemented directly in the attack validation service.
 * See: backend/src/modules/duels/services/battle/attack-validation.service.ts
 */

export const CYBER_TWIN_DRAGON_KEY = 'cyber-twin-dragon';

export const CYBER_TWIN_DRAGON_IDS = [
  'CyberTwinDragon',
  'YGOPRO_74157028',
  '74157028',
] as const;
