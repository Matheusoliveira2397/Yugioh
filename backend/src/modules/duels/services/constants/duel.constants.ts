/**
 * Constantes do sistema de duelos
 * Centraliza valores mágicos e configurações
 */

/**
 * Limites do campo
 */
export const FIELD_LIMITS = {
  MONSTER_ZONES: 5,
  SPELL_TRAP_ZONES: 5,
  HAND_SIZE: 7,
  DECK_SIZE: 40,
  EXTRA_DECK_SIZE: 15,
} as const;

/**
 * Life Points padrão
 */
export const DEFAULT_LIFE_POINTS = 8000;

/**
 * Limites de ataque
 */
export const ATTACK_LIMITS = {
  NORMAL_MONSTER: 1,
  MATAZA_THE_ZAPPER: 2,
  CYBER_TWIN_DRAGON: 2,
} as const;

/**
 * Níveis de monstros e tributos necessários
 */
export const TRIBUTE_REQUIREMENTS = {
  LEVEL_1_TO_4: 0,
  LEVEL_5_TO_6: 1,
  LEVEL_7_PLUS: 2,
} as const;

/**
 * Fases do turno
 */
export const TURN_PHASES = {
  DRAW: 'DRAW',
  STANDBY: 'STANDBY',
  MAIN1: 'MAIN1',
  BATTLE: 'BATTLE',
  MAIN2: 'MAIN2',
  END: 'END',
} as const;

/**
 * Posições de monstros
 */
export const MONSTER_POSITIONS = {
  ATTACK: 'attack',
  DEFENSE: 'defense',
  SET: 'set',
  FACE_UP: 'face-up',
} as const;

/**
 * Tipos de cartas
 */
export const CARD_TYPES = {
  MONSTER: 'Monster',
  SPELL: 'Spell',
  TRAP: 'Trap',
} as const;

/**
 * Tipos de spells
 */
export const SPELL_TYPES = {
  NORMAL: 'Normal',
  CONTINUOUS: 'Continuous',
  EQUIP: 'Equip',
  FIELD: 'Field',
  QUICK_PLAY: 'Quick-Play',
  RITUAL: 'Ritual',
} as const;

/**
 * Tipos de traps
 */
export const TRAP_TYPES = {
  NORMAL: 'Normal',
  CONTINUOUS: 'Continuous',
  COUNTER: 'Counter',
} as const;

/**
 * IDs de cartas especiais (para comparação)
 */
export const SPECIAL_CARD_IDS = {
  MATAZA_THE_ZAPPER: 'MatazaTheZapper',
  CYBER_TWIN_DRAGON: 'CyberTwinDragon',
  CHAOS_SORCERER: 'ChaosSorcerer',
  FIBER_JAR: 'FiberJar',
  SNOWMAN_EATER: 'SnowmanEater',
  MORPHING_JAR: 'MorphingJar',
  MARSHMALLON: 'Marshmallon',
  JINZO: 'Jinzo',
} as const;

/**
 * Nomes de cartas especiais (para comparação)
 */
export const SPECIAL_CARD_NAMES = {
  MATAZA_THE_ZAPPER: 'mataza the zapper',
  CYBER_TWIN_DRAGON: 'cyber twin dragon',
  CHAOS_SORCERER: 'chaos sorcerer',
  FIBER_JAR: 'fiber jar',
  SNOWMAN_EATER: 'snowman eater',
  MORPHING_JAR: 'morphing jar',
  MARSHMALLON: 'marshmallon',
  JINZO: 'jinzo',
} as const;

/**
 * Duração de efeitos (em turnos)
 */
export const EFFECT_DURATIONS = {
  SWORDS_OF_REVEALING_LIGHT: 3,
} as const;

/**
 * Valores de dano especiais
 */
export const SPECIAL_DAMAGE = {
  MARSHMALLON_FACE_DOWN: 1000,
} as const;

