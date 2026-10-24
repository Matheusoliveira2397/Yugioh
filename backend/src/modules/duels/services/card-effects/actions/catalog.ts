import { checkAndActivateTrapHole } from './check-and-activate-trap-hole';
import { checkAndActivateBottomlessTrapHole } from './check-and-activate-bottomless-trap-hole';
import { checkAndActivateSakuretsuArmor } from './check-and-activate-sakuretsu-armor';
import { checkAndActivateMagicCylinder } from './check-and-activate-magic-cylinder';
import { checkAndActivateNegateAttack } from './check-and-activate-negate-attack';
import { checkAndActivateHeroBarrier } from './check-and-activate-hero-barrier';
import { checkAndActivateRingOfDestruction } from './check-and-activate-ring-of-destruction';
import { tryStartArchfiendOfGilferEquip } from './try-start-archfiend-of-gilfer-equip';
import { tryStartDarkMagicianOfChaosEndPhase } from './try-start-dark-magician-of-chaos-end-phase';
import { processDarkMagicianOfChaosEndPhaseChoice } from './process-dark-magician-of-chaos-end-phase-choice';
import { skipDarkMagicianOfChaosEndPhase } from './skip-dark-magician-of-chaos-end-phase';
import { tryStartMagiciansRodSearch } from './try-start-magicians-rod-search';
import { processMagiciansRodSearchChoice } from './process-magicians-rod-search-choice';
import { skipMagiciansRodSearch } from './skip-magicians-rod-search';
import { tryStartMagiciansRodGyRecycle } from './try-start-magicians-rod-gy-recycle';
import { processMagiciansRodGyChoice } from './process-magicians-rod-gy-choice';
import { skipMagiciansRodGy } from './skip-magicians-rod-gy';
import { tryStartBerfometSearch } from './try-start-berfomet-search';
import { processBerfometSearchChoice } from './process-berfomet-search-choice';
import { skipBerfometSearch } from './skip-berfomet-search';
import { tryStartKingsKnightSearch } from './try-start-kings-knight-search';
import { processKingsKnightSearchChoice } from './process-kings-knight-search-choice';
import { skipKingsKnightSearch } from './skip-kings-knight-search';
import { activateElectromagneticTurtle } from './activate-electromagnetic-turtle';
import { tryStartMagiciansSalvationEternalSoul } from './try-start-magicians-salvation-eternal-soul';
import { processMagiciansSalvationEternalSoulChoice } from './process-magicians-salvation-eternal-soul-choice';
import { skipMagiciansSalvationEternalSoul } from './skip-magicians-salvation-eternal-soul';
import { tryStartMagiciansSalvationPairEffect } from './try-start-magicians-salvation-pair-effect';
import { processMagiciansSalvationPairChoice } from './process-magicians-salvation-pair-choice';
import { skipMagiciansSalvationPair } from './skip-magicians-salvation-pair';
import { checkAndActivateDefenseDraw } from './check-and-activate-defense-draw';
import { checkAndActivateKuriboh } from './check-and-activate-kuriboh';
import { checkAndActivateMirrorForce } from './check-and-activate-mirror-force';
import { checkAndActivateDimensionalPrison } from './check-and-activate-dimensional-prison';
import { checkAndActivateWaboku } from './check-and-activate-waboku';
import { processForcefulSentryChoice } from './process-forceful-sentry-choice';
import { processConfiscationChoice } from './process-confiscation-choice';
import { processGracefulCharityChoice } from './process-graceful-charity-choice';
import { processMonsterRebornChoice } from './process-monster-reborn-choice';
import { processPrematureBurialChoice } from './process-premature-burial-choice';
import { processReinforcementOfTheArmyChoice } from './process-reinforcement-of-the-army-choice';
import { processLastWillChoice } from './process-last-will-choice';
import { processAutonomousActionUnitChoice } from './process-autonomous-action-unit-choice';
import { onSpellTrapRemovedFromField } from './on-spell-trap-removed-from-field';
import { tryStartEternalSoulEffect } from './try-start-eternal-soul-effect';
import { processEternalSoulSpecialSummon } from './process-eternal-soul-special-summon';
import { processEternalSoulSearch } from './process-eternal-soul-search';
import { skipEternalSoulEffect } from './skip-eternal-soul-effect';
import { tryStartSkilledDarkMagicianEffect } from './try-start-skilled-dark-magician-effect';
import { processSkilledDarkMagicianChoice } from './process-skilled-dark-magician-choice';
import { skipSkilledDarkMagicianEffect } from './skip-skilled-dark-magician-effect';
import { startCyberSteinEffect } from './start-cyber-stein-effect';
import { processCyberSteinEffectChoice } from './process-cyber-stein-effect-choice';
import { startDarkArmedDragonSpecialSummon } from './start-dark-armed-dragon-special-summon';
import { startDarkArmedDragonEffect } from './start-dark-armed-dragon-effect';
import { processDarkArmedDragonEffect } from './process-dark-armed-dragon-effect';
import { processChangeOfHeartChoice } from './process-change-of-heart-choice';
import { processSoulTakerChoice } from './process-soul-taker-choice';
import { processLightningStormChoice } from './process-lightning-storm-choice';
import { processBrainControlChoice } from './process-brain-control-choice';
import { processUnitedWeStandChoice } from './process-united-we-stand-choice';
import { processMagePowerChoice } from './process-mage-power-choice';
import { processObeliskEffect } from './process-obelisk-effect';
import { processBreakerRemoveCounter } from './process-breaker-remove-counter';
import { processMysticalSpaceTyphoonChoice } from './process-mystical-space-typhoon-choice';
import { processSnowmanEaterChoice } from './process-snowman-eater-choice';
import { processMaskedSorcererEffect } from './process-masked-sorcerer-effect';
import { processWhiteMagicalHatEffect } from './process-white-magical-hat-effect';
import { startChaosSorcererSpecialSummon } from './start-chaos-sorcerer-special-summon';
import { startChaosSorcererEffect } from './start-chaos-sorcerer-effect';
import { startExiledForceEffect } from './start-exiled-force-effect';
import { processChaosSorcererEffect } from './process-chaos-sorcerer-effect';
import { startBlackLusterSoldierEffect } from './start-black-luster-soldier-effect';
import { processBlackLusterSoldierEffect } from './process-black-luster-soldier-effect';
import { processChaosEmperorDragonEffect } from './process-chaos-emperor-dragon-effect';
import { processExiledForceChoice } from './process-exiled-force-choice';
import { startRedEyesDarknessMetalDragonSpecialSummon } from './start-red-eyes-darkness-metal-dragon-special-summon';
import { startRedEyesDarknessMetalDragonEffect } from './start-red-eyes-darkness-metal-dragon-effect';
import { processRedEyesDarknessMetalDragonEffect } from './process-red-eyes-darkness-metal-dragon-effect';
import { processPlayerTargetSpellChoice } from './process-player-target-spell-choice';

/** One implementation per action; no legacy dispatcher. */
export const EFFECT_ACTIONS = {
  checkAndActivateTrapHole,
  checkAndActivateBottomlessTrapHole,
  checkAndActivateSakuretsuArmor,
  checkAndActivateMagicCylinder,
  checkAndActivateNegateAttack,
  checkAndActivateHeroBarrier,
  checkAndActivateRingOfDestruction,
  tryStartArchfiendOfGilferEquip,
  tryStartDarkMagicianOfChaosEndPhase,
  processDarkMagicianOfChaosEndPhaseChoice,
  skipDarkMagicianOfChaosEndPhase,
  tryStartMagiciansRodSearch,
  processMagiciansRodSearchChoice,
  skipMagiciansRodSearch,
  tryStartMagiciansRodGyRecycle,
  processMagiciansRodGyChoice,
  skipMagiciansRodGy,
  tryStartBerfometSearch,
  processBerfometSearchChoice,
  skipBerfometSearch,
  tryStartKingsKnightSearch,
  processKingsKnightSearchChoice,
  skipKingsKnightSearch,
  activateElectromagneticTurtle,
  tryStartMagiciansSalvationEternalSoul,
  processMagiciansSalvationEternalSoulChoice,
  skipMagiciansSalvationEternalSoul,
  tryStartMagiciansSalvationPairEffect,
  processMagiciansSalvationPairChoice,
  skipMagiciansSalvationPair,
  checkAndActivateDefenseDraw,
  checkAndActivateKuriboh,
  checkAndActivateMirrorForce,
  checkAndActivateDimensionalPrison,
  checkAndActivateWaboku,
  processForcefulSentryChoice,
  processConfiscationChoice,
  processGracefulCharityChoice,
  processMonsterRebornChoice,
  processPrematureBurialChoice,
  processReinforcementOfTheArmyChoice,
  processLastWillChoice,
  processAutonomousActionUnitChoice,
  onSpellTrapRemovedFromField,
  tryStartEternalSoulEffect,
  processEternalSoulSpecialSummon,
  processEternalSoulSearch,
  skipEternalSoulEffect,
  tryStartSkilledDarkMagicianEffect,
  processSkilledDarkMagicianChoice,
  skipSkilledDarkMagicianEffect,
  startCyberSteinEffect,
  processCyberSteinEffectChoice,
  startDarkArmedDragonSpecialSummon,
  startDarkArmedDragonEffect,
  processDarkArmedDragonEffect,
  processChangeOfHeartChoice,
  processSoulTakerChoice,
  processLightningStormChoice,
  processBrainControlChoice,
  processUnitedWeStandChoice,
  processMagePowerChoice,
  processObeliskEffect,
  processBreakerRemoveCounter,
  processMysticalSpaceTyphoonChoice,
  processSnowmanEaterChoice,
  processMaskedSorcererEffect,
  processWhiteMagicalHatEffect,
  startChaosSorcererSpecialSummon,
  startChaosSorcererEffect,
  startExiledForceEffect,
  processChaosSorcererEffect,
  startBlackLusterSoldierEffect,
  processBlackLusterSoldierEffect,
  processChaosEmperorDragonEffect,
  processExiledForceChoice,
  startRedEyesDarknessMetalDragonSpecialSummon,
  startRedEyesDarknessMetalDragonEffect,
  processRedEyesDarknessMetalDragonEffect,
  processPlayerTargetSpellChoice,
} as const;

export type EffectActionName = keyof typeof EFFECT_ACTIONS;
export type EffectActionArgs<K extends EffectActionName> = Parameters<typeof EFFECT_ACTIONS[K]> extends [unknown, ...infer A] ? A : never;
export type EffectActionResult<K extends EffectActionName> = ReturnType<typeof EFFECT_ACTIONS[K]>;

/** These actions carry a duel actor rather than a server-generated event context. */
export const PLAYER_EFFECT_ACTIONS = new Set<EffectActionName>([
  "activateElectromagneticTurtle",
  "processAutonomousActionUnitChoice",
  "processBerfometSearchChoice",
  "processBlackLusterSoldierEffect",
  "processBrainControlChoice",
  "processBreakerRemoveCounter",
  "processChangeOfHeartChoice",
  "processChaosEmperorDragonEffect",
  "processChaosSorcererEffect",
  "processConfiscationChoice",
  "processCyberSteinEffectChoice",
  "processDarkArmedDragonEffect",
  "processDarkMagicianOfChaosEndPhaseChoice",
  "processEternalSoulSearch",
  "processEternalSoulSpecialSummon",
  "processExiledForceChoice",
  "processForcefulSentryChoice",
  "processGracefulCharityChoice",
  "processKingsKnightSearchChoice",
  "processLastWillChoice",
  "processLightningStormChoice",
  "processMagePowerChoice",
  "processMagiciansRodGyChoice",
  "processMagiciansRodSearchChoice",
  "processMagiciansSalvationEternalSoulChoice",
  "processMagiciansSalvationPairChoice",
  "processMonsterRebornChoice",
  "processMysticalSpaceTyphoonChoice",
  "processObeliskEffect",
  "processPlayerTargetSpellChoice",
  "processPrematureBurialChoice",
  "processRedEyesDarknessMetalDragonEffect",
  "processReinforcementOfTheArmyChoice",
  "processSkilledDarkMagicianChoice",
  "processSnowmanEaterChoice",
  "processSoulTakerChoice",
  "processUnitedWeStandChoice",
  "skipBerfometSearch",
  "skipDarkMagicianOfChaosEndPhase",
  "skipEternalSoulEffect",
  "skipKingsKnightSearch",
  "skipMagiciansRodGy",
  "skipMagiciansRodSearch",
  "skipMagiciansSalvationEternalSoul",
  "skipMagiciansSalvationPair",
  "skipSkilledDarkMagicianEffect",
  "startBlackLusterSoldierEffect",
  "startChaosSorcererEffect",
  "startChaosSorcererSpecialSummon",
  "startCyberSteinEffect",
  "startDarkArmedDragonEffect",
  "startDarkArmedDragonSpecialSummon",
  "startExiledForceEffect",
  "startRedEyesDarknessMetalDragonEffect",
  "startRedEyesDarknessMetalDragonSpecialSummon",
  "tryStartEternalSoulEffect",
  "tryStartSkilledDarkMagicianEffect"
]);
