import { Module, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { CardEffectRegistryService } from './registry/card-effect-registry.service';
import { DuelsModule } from '../../duels.module';
import { DuelsService } from '../../duels.service';

// Importar serviços de segurança e monitoramento
import { EffectIntegrityService } from './validation/effect-integrity.service';
import { EffectBackupService } from './backup/effect-backup.service';
import { EffectMonitorService } from './monitoring/effect-monitor.service';

// Importar efeitos complexos (que precisam de classe)
import { DropOffEffect } from './effects/drop-off.effect';
import { MysticalSpaceTyphoonEffect } from './effects/mystical-space-typhoon.effect';
import { GracefulCharityEffect } from './effects/graceful-charity.effect';
import { ChangeOfHeartEffect } from './effects/change-of-heart.effect';
import { MonsterRebornEffect } from './effects/monster-reborn.effect';
import { ReinforcementOfTheArmyEffect } from './effects/reinforcement-of-the-army.effect';
import { LastWillEffect } from './effects/last-will.effect';
import { MonsterReincarnationEffect } from './effects/monster-reincarnation.effect';
import { BrainControlEffect } from './effects/brain-control.effect';
import { SoulTakerEffect } from './effects/soul-taker.effect';
import { UnitedWeStandEffect } from './effects/united-we-stand.effect';
import { MagePowerEffect } from './effects/mage-power.effect';
import { AutonomousActionUnitEffect } from './effects/autonomous-action-unit.effect';
import { TheForcefulSentryEffect } from './effects/the-forceful-sentry.effect';
import { ConfiscationEffect } from './effects/confiscation.effect';

// Importar efeitos simples (apenas funções)
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
} from './effects/simple-effects';

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
    // Efeitos simples não precisam ser providers, são apenas funções
  ],
  exports: [
    CardEffectRegistryService,
    EffectIntegrityService,
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
    private readonly integrityService: EffectIntegrityService,
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
      ['SwordsOfRevealingLight'],
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
  }
}

