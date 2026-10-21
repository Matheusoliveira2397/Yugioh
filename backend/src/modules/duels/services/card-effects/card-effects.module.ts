import { Module, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { CardEffectRegistryService } from './registry/card-effect-registry.service';
import { DuelsModule } from '../../duels.module';
import { DuelsService } from '../../duels.service';

// Importar serviços de segurança e monitoramento
import { EffectIntegrityService } from './validation/effect-integrity.service';
import { EffectSealService } from './validation/effect-seal.service';
import { EffectBackupService } from './backup/effect-backup.service';
import { EffectMonitorService } from './monitoring/effect-monitor.service';

// Efeitos: todos em effects/{spells|traps|monsters}/
import { DropOffEffect } from './effects/traps/drop-off.effect';
import { MysticalSpaceTyphoonEffect } from './effects/spells/mystical-space-typhoon.effect';
import { GracefulCharityEffect } from './effects/spells/graceful-charity.effect';
import { ChangeOfHeartEffect } from './effects/spells/change-of-heart.effect';
import { MonsterRebornEffect } from './effects/spells/monster-reborn.effect';
import { ReinforcementOfTheArmyEffect } from './effects/spells/reinforcement-of-the-army.effect';
import { LastWillEffect } from './effects/spells/last-will.effect';
import { MonsterReincarnationEffect } from './effects/spells/monster-reincarnation.effect';
import { BrainControlEffect } from './effects/spells/brain-control.effect';
import { SoulTakerEffect } from './effects/spells/soul-taker.effect';
import { UnitedWeStandEffect } from './effects/spells/united-we-stand.effect';
import { MagePowerEffect } from './effects/spells/mage-power.effect';
import { AutonomousActionUnitEffect } from './effects/spells/autonomous-action-unit.effect';
import { TheForcefulSentryEffect } from './effects/spells/the-forceful-sentry.effect';
import { ConfiscationEffect } from './effects/spells/confiscation.effect';
import { ShrinkEffect } from './effects/spells/shrink.effect';
import { MagicFormulaEffect } from './effects/spells/magic-formula.effect';
import { MegamorphEffect } from './effects/spells/megamorph.effect';
import { EnemyControllerEffect } from './effects/spells/enemy-controller.effect';

import { 
  createPotOfGreedEffect, 
  createUpstartGoblinEffect, 
  createHinotamaEffect,
  createRaigekiEffect,
  createDarkHoleEffect,
  createHeavyStormEffect,
  createHarpiesFeatherDusterEffect,
  createWabokuEffect,
  createBannerOfCourageEffect,
  createSwordsOfRevealingLightEffect,
  createJarOfGreedEffect,
  createCardDestructionEffect,
  createReloadEffect,
  createFissureEffect,
  createSmashingGroundEffect,
  createHammerShotEffect,
  createGiantTrunadeEffect,
  createDoubleSummonEffect,
  createCardOfSanctityEffect,
  createMultiplyEffect,
  createBurstStreamOfDestructionEffect,
  createDetonateEffect,
  createSilentDoomEffect,
  createLimiterRemovalEffect,
  createTheFluteOfSummoningDragonEffect,
  createFiendsSanctuaryEffect,
  createFrontlineBaseEffect,
} from './effects/spells/simple-effects';
import { createMagiciansSalvationEffect } from './effects/spells/magicians-salvation';
import { createFinalAttackOrdersEffect } from './effects/traps/final-attack-orders';
import { createLightOfInterventionEffect } from './effects/traps/light-of-intervention';
import {
  createEmergencyCallEffect,
  createOversoulEffect,
  createFakeHeroEffect,
  createSkyscraperEffect,
  createRighteousJusticeEffect,
  createMiracleFusionEffect,
  createFifthHopeEffect,
  createHeroHeartEffect,
  createBurstReturnEffect,
  createWrathOfNeosEffect,
  createPolymerizationEffect,
} from './effects/spells/hero-spells';

/**
 * Módulo responsável por gerenciar todos os efeitos de cartas
 * 
 * IMPORTANTE: Este módulo registra todos os efeitos automaticamente
 * ao ser inicializado. Adicione novos efeitos aqui.
 * 
 * SISTEMA DE SEGURANÇA:
 * - Validação automática de integridade
 * - Backup automático antes de mudanças
 * - Monitoramento contínuo de saúde
 */
@Module({
  imports: [forwardRef(() => DuelsModule)], // Importar DuelsModule para ter acesso ao DuelsService
  providers: [
    CardEffectRegistryService,
    // Serviços de segurança e monitoramento
    EffectIntegrityService,
    EffectSealService,
    EffectBackupService,
    EffectMonitorService,
    // Registrar apenas efeitos complexos como providers (que precisam de classe)
    DropOffEffect,
    MysticalSpaceTyphoonEffect,
    GracefulCharityEffect,
    ChangeOfHeartEffect,
    MonsterRebornEffect,
    ReinforcementOfTheArmyEffect,
    LastWillEffect,
    MonsterReincarnationEffect,
    BrainControlEffect,
    SoulTakerEffect,
    UnitedWeStandEffect,
    MagePowerEffect,
    AutonomousActionUnitEffect,
    TheForcefulSentryEffect,
    ConfiscationEffect,
    ShrinkEffect,
    MagicFormulaEffect,
    MegamorphEffect,
    EnemyControllerEffect,
    // Efeitos simples não precisam ser providers, são apenas funções
  ],
  exports: [
    CardEffectRegistryService,
    EffectIntegrityService,
    EffectSealService,
    EffectBackupService,
    EffectMonitorService,
  ],
})
export class CardEffectsModule implements OnModuleInit {
  constructor(
    private readonly registry: CardEffectRegistryService,
    private readonly dropOffEffect: DropOffEffect,
    private readonly mysticalSpaceTyphoonEffect: MysticalSpaceTyphoonEffect,
    private readonly gracefulCharityEffect: GracefulCharityEffect,
    private readonly changeOfHeartEffect: ChangeOfHeartEffect,
    private readonly monsterRebornEffect: MonsterRebornEffect,
    private readonly reinforcementOfTheArmyEffect: ReinforcementOfTheArmyEffect,
    private readonly lastWillEffect: LastWillEffect,
    private readonly monsterReincarnationEffect: MonsterReincarnationEffect,
    private readonly brainControlEffect: BrainControlEffect,
    private readonly soulTakerEffect: SoulTakerEffect,
    private readonly unitedWeStandEffect: UnitedWeStandEffect,
    private readonly magePowerEffect: MagePowerEffect,
    private readonly autonomousActionUnitEffect: AutonomousActionUnitEffect,
    private readonly theForcefulSentryEffect: TheForcefulSentryEffect,
    private readonly confiscationEffect: ConfiscationEffect,
    private readonly shrinkEffect: ShrinkEffect,
    private readonly magicFormulaEffect: MagicFormulaEffect,
    private readonly megamorphEffect: MegamorphEffect,
    private readonly enemyControllerEffect: EnemyControllerEffect,
    private readonly integrityService: EffectIntegrityService,
    private readonly sealService: EffectSealService,
    private readonly backupService: EffectBackupService,
    private readonly monitorService: EffectMonitorService,
    @Inject(forwardRef(() => DuelsService))
    private readonly duelsService: DuelsService,
  ) {}

  async onModuleInit() {
    // Criar backup antes de registrar efeitos
    try {
      await this.backupService.createBackup('module-init');
    } catch (error) {
      console.error('⚠️ [CardEffectsModule] Erro ao criar backup inicial:', error);
    }
    // Registrar efeitos complexos (classes)
    this.registry.register(DropOffEffect, this.dropOffEffect);
    this.registry.register(MysticalSpaceTyphoonEffect, this.mysticalSpaceTyphoonEffect);
    this.registry.register(GracefulCharityEffect, this.gracefulCharityEffect);
    this.registry.register(ChangeOfHeartEffect, this.changeOfHeartEffect);
    this.registry.register(MonsterRebornEffect, this.monsterRebornEffect);
    this.registry.register(ReinforcementOfTheArmyEffect, this.reinforcementOfTheArmyEffect);
    this.registry.register(LastWillEffect, this.lastWillEffect);
    this.registry.register(MonsterReincarnationEffect, this.monsterReincarnationEffect);
    this.registry.register(BrainControlEffect, this.brainControlEffect);
    this.registry.register(SoulTakerEffect, this.soulTakerEffect);
    this.registry.register(UnitedWeStandEffect, this.unitedWeStandEffect);
    this.registry.register(MagePowerEffect, this.magePowerEffect);
    this.registry.register(AutonomousActionUnitEffect, this.autonomousActionUnitEffect);
    this.registry.register(TheForcefulSentryEffect, this.theForcefulSentryEffect);
    this.registry.register(ConfiscationEffect, this.confiscationEffect);
    this.registry.register(ShrinkEffect, this.shrinkEffect);
    this.registry.register(MagicFormulaEffect, this.magicFormulaEffect);
    this.registry.register(MegamorphEffect, this.megamorphEffect);
    this.registry.register(EnemyControllerEffect, this.enemyControllerEffect);
    
    // Registrar efeitos simples (funções) - MUITO MAIS FÁCIL!
    // Para efeitos básicos, apenas uma função é suficiente - não precisa de classe!
    this.registry.registerSimple(
      ['pot of greed'],
      createPotOfGreedEffect(this.duelsService),
      ['PotOfGreed'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['upstart goblin'],
      createUpstartGoblinEffect(this.duelsService),
      ['UpstartGoblin'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['hinotama'],
      createHinotamaEffect(this.duelsService),
      ['Hinotama'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['raigeki'],
      createRaigekiEffect(this.duelsService),
      ['Raigeki'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['dark hole', 'darkhole'],
      createDarkHoleEffect(this.duelsService),
      ['DarkHole'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['heavy storm', 'heavystorm'],
      createHeavyStormEffect(this.duelsService),
      ['HeavyStorm'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ["harpie's feather duster", 'harpies feather duster', 'harpiesfeatherduster'],
      createHarpiesFeatherDusterEffect(this.duelsService),
      ['HarpiesFeatherDuster'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['waboku'],
      createWabokuEffect(this.duelsService),
      ['Waboku'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['banner of courage', 'bannerofcourage'],
      createBannerOfCourageEffect(this.duelsService),
      ['BannerOfCourage'],
      this.duelsService,
    );
    
    this.registry.registerSimple(
      ['swords of revealing light', 'swordsofrevealinglight'],
      createSwordsOfRevealingLightEffect(this.duelsService),
      ['SwordsOfRevealingLight', 'YGOPRO_72302403'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['jar of greed', 'jarofgreed'],
      createJarOfGreedEffect(this.duelsService),
      ['JarOfGreed', 'YGOPRO_83968380'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['card destruction', 'carddestruction'],
      createCardDestructionEffect(this.duelsService),
      ['CardDestruction', 'YGOPRO_72892473'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['reload'],
      createReloadEffect(this.duelsService),
      ['Reload', 'YGOPRO_22589918'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['fissure'],
      createFissureEffect(this.duelsService),
      ['Fissure', 'YGOPRO_66788016'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['smashing ground', 'smashingground'],
      createSmashingGroundEffect(this.duelsService),
      ['SmashingGround', 'YGOPRO_97169186'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['hammer shot', 'hammershot'],
      createHammerShotEffect(this.duelsService),
      ['HammerShot', 'YGOPRO_26412047'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['giant trunade', 'gianttrunade'],
      createGiantTrunadeEffect(this.duelsService),
      ['GiantTrunade', 'YGOPRO_42703248'],
      this.duelsService,
    );

    // Player-target spells (Lightning Vortex, Trade-In, etc.): helpers em
    // helpers/player-target-spell.helpers.ts — ver catalog/all-effects.catalog.ts

    this.registry.registerSimple(
      ['double summon', 'doublesummon'],
      createDoubleSummonEffect(this.duelsService),
      ['DoubleSummon', 'YGOPRO_43422537'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ["magician's salvation", 'magicians salvation', 'magicianssalvation', 'salvacao do mago', 'salvação do mago'],
      createMagiciansSalvationEffect(this.duelsService),
      ['MagiciansSalvation', 'MagicianSSalvation', 'YGOPRO_35158295', '35158295'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['card of sanctity', 'cardofsanctity'],
      createCardOfSanctityEffect(this.duelsService),
      ['CardOfSanctity', 'YGOPRO_42664989', '42664989'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['multiply'],
      createMultiplyEffect(this.duelsService),
      ['Multiply', 'YGOPRO_40703222', '40703222'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['final attack orders', 'finalattackorders'],
      createFinalAttackOrdersEffect(this.duelsService),
      ['FinalAttackOrders', 'YGOPRO_52503575', '52503575'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['burst stream of destruction', 'burststreamofdestruction'],
      createBurstStreamOfDestructionEffect(this.duelsService),
      ['BurstStreamOfDestruction', 'YGOPRO_17655904', '17655904'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['detonate'],
      createDetonateEffect(this.duelsService),
      ['Detonate', 'YGOPRO_89086566', '89086566'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['silent doom', 'silentdoom'],
      createSilentDoomEffect(this.duelsService),
      ['SilentDoom', 'YGOPRO_42534368', '42534368'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['limiter removal', 'limiterremoval'],
      createLimiterRemovalEffect(this.duelsService),
      ['LimiterRemoval', 'YGOPRO_23171610', '23171610'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['the flute of summoning dragon', 'thefluteofsummoningdragon', 'flute of summoning dragon'],
      createTheFluteOfSummoningDragonEffect(this.duelsService),
      ['TheFluteOfSummoningDragon', 'YGOPRO_43973174', '43973174'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ["fiend's sanctuary", 'fiends sanctuary', 'fiendssanctuary'],
      createFiendsSanctuaryEffect(this.duelsService),
      ['FiendsSanctuary', 'FiendSanctuary', 'YGOPRO_24874630', '24874630'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['frontline base', 'frontlinebase'],
      createFrontlineBaseEffect(this.duelsService),
      ['FrontlineBase', 'YGOPRO_46181000', '46181000'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['light of intervention', 'lightofintervention'],
      createLightOfInterventionEffect(this.duelsService),
      ['LightOfIntervention', 'YGOPRO_62867251', '62867251'],
      this.duelsService,
    );

    // HERO Spells
    this.registry.registerSimple(
      ['e - emergency call', 'emergency call', 'emergencycall'],
      createEmergencyCallEffect(this.duelsService),
      ['EmergencyCall', 'YGOPRO_213326', '213326'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['o - oversoul', 'oversoul'],
      createOversoulEffect(this.duelsService),
      ['Oversoul', 'YGOPRO_63703130', '63703130'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['fake hero', 'fakehero'],
      createFakeHeroEffect(this.duelsService),
      ['FakeHero', 'YGOPRO_78387742', '78387742'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['skyscraper'],
      createSkyscraperEffect(this.duelsService),
      ['Skyscraper', 'YGOPRO_63035430', '63035430'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['r - righteous justice', 'righteous justice', 'righteousjustice'],
      createRighteousJusticeEffect(this.duelsService),
      ['RighteousJustice', 'YGOPRO_37318031', '37318031'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['miracle fusion', 'miraclefusion'],
      createMiracleFusionEffect(this.duelsService),
      ['MiracleFusion', 'YGOPRO_45906428', '45906428'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['fifth hope', 'fifthhope'],
      createFifthHopeEffect(this.duelsService),
      ['FifthHope', 'YGOPRO_55428811', '55428811'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['hero heart', 'heroheart'],
      createHeroHeartEffect(this.duelsService),
      ['HeroHeart', 'YGOPRO_67951831', '67951831'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['burst return', 'burstreturn'],
      createBurstReturnEffect(this.duelsService),
      ['BurstReturn', 'YGOPRO_27191436', '27191436'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['wrath of neos', 'wrathofneos'],
      createWrathOfNeosEffect(this.duelsService),
      ['WrathOfNeos', 'YGOPRO_52098461', '52098461'],
      this.duelsService,
    );

    this.registry.registerSimple(
      ['polymerization'],
      createPolymerizationEffect(this.duelsService),
      ['Polymerization', 'YGOPRO_24094653', '24094653'],
      this.duelsService,
    );
    
    // Adicionar mais efeitos simples aqui - é só uma linha!
    // this.registry.registerSimple(['nome da carta'], funcaoDoEfeito, ['IdCarta'], this.duelsService);
    
    console.log('✅ [CardEffectsModule] Todos os efeitos foram registrados');
    console.log(`📋 [CardEffectsModule] Total de cartas registradas: ${this.registry.getRegisteredCards().length}`);
    
    // Validar integridade após registro
    try {
      const integrityReport = await this.integrityService.validateAllEffects();
      if (!integrityReport.isHealthy) {
        console.error(`❌ [CardEffectsModule] PROBLEMAS DETECTADOS: ${integrityReport.invalidEffects} efeitos inválidos!`);
        console.error(`❌ [CardEffectsModule] Detalhes:`, integrityReport.results.filter(r => !r.isValid));
      } else {
        console.log(`✅ [CardEffectsModule] Validação de integridade: ${integrityReport.validEffects} efeitos válidos`);
      }
    } catch (error) {
      console.error('⚠️ [CardEffectsModule] Erro ao validar integridade:', error);
    }

    // Selo anti-regressão: acusa se algum efeito antigo sumiu do registry
    try {
      const seal = await this.sealService.verifyAndUpdateSeal();
      if (!seal.ok) {
        console.error(
          `❌ [CardEffectsModule] REGRESSÃO DE EFEITOS: faltando ${seal.missing.length}: ${seal.missing.join(', ')}`,
        );
      }
    } catch (error) {
      console.error('⚠️ [CardEffectsModule] Erro no selo de efeitos:', error);
    }
  }
}

