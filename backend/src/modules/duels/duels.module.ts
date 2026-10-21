import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DuelsService } from './duels.service';
import { DuelsController } from './duels.controller';
import { DuelsGateway } from './duels.gateway';
import { MatchmakingService } from './matchmaking.service';
import { DuelQueueService } from './duel-queue.service';
import { DuelsDbMigrationService } from './duels-db-migration.service';
import { CardEffectsService } from './services/card-effects.service';
import { DuelUtilsService } from './services/duel-utils.service';
import { CardEffectHandlersService } from './services/card-effect-handlers.service';
import { CardEffectsModule } from './services/card-effects/card-effects.module';
import { FieldActionsService } from './services/field-actions.service';
import { TurnPhaseService } from './services/turn-phase.service';
// Battle Services
import { BattleService } from './services/battle/battle.service';
import { TrapService } from './services/battle/trap.service';
import { DamageCalculationService } from './services/battle/damage-calculation.service';
import { GraveyardService } from './services/battle/graveyard.service';
import { EquipmentService } from './services/battle/equipment.service';
import { AttackValidationService } from './services/battle/attack-validation.service';
import { MonsterBattleService } from './services/battle/monster-battle.service';
import { FieldStateService } from './services/battle/field-state.service';
// Spell, Monster, Summon Services
import { SpellService } from './services/spell/spell.service';
import { MonsterService } from './services/monster/monster.service';
import { SummonService } from './services/summon/summon.service';
import { Duel } from './entities/duel.entity';
import { DuelLog } from './entities/duel-log.entity';
import { DuelHistory } from './entities/duel-history.entity';
import { User } from '../users/entities/user.entity';
import { DecksModule } from '../decks/decks.module';
import { ArenaModule } from '../arena/arena.module';
import { GroupsModule } from '../groups/groups.module';
import { CardsModule } from '../cards/cards.module';
import { AuthModule } from '../auth/auth.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { UsersModule } from '../users/users.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { LevelsModule } from '../levels/levels.module';
import { AdminModule } from '../admin/admin.module';
import { AnimeDecksModule } from '../anime-decks/anime-decks.module';
import { EconomyModule } from '../economy/economy.module';
import { ShopModule } from '../shop/shop.module';
import { BattlePassModule } from '../battle-pass/battle-pass.module';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Duel, DuelLog, DuelHistory, User]),
    ShopModule,
    DecksModule,
    AnimeDecksModule,
    forwardRef(() => ArenaModule),
    forwardRef(() => GroupsModule),
    forwardRef(() => CardsModule),
    forwardRef(() => TournamentsModule),
    forwardRef(() => SeasonsModule),
    AuthModule,
    UsersModule,
    LevelsModule,
    forwardRef(() => AdminModule),
    EconomyModule,
    BattlePassModule,
    MissionsModule,
    forwardRef(() => CardEffectsModule), // Novo sistema de efeitos de cartas (forwardRef para evitar dependência circular)
  ],
  controllers: [DuelsController],
  providers: [
    DuelsService,
    DuelsGateway,
    MatchmakingService,
    DuelQueueService,
    DuelsDbMigrationService,
    CardEffectsService,
    DuelUtilsService,
    CardEffectHandlersService,
    FieldActionsService,
    TurnPhaseService,
    // Battle Services
    BattleService,
    TrapService,
    DamageCalculationService,
    GraveyardService,
    EquipmentService,
    AttackValidationService,
    MonsterBattleService,
    FieldStateService,
    // Spell, Monster, Summon Services
    SpellService,
    MonsterService,
    SummonService,
  ],
  exports: [
    DuelsService, // CRÍTICO: Exportar DuelsService para CardEffectsModule
    DuelQueueService,
    DuelsGateway,
    MatchmakingService,
    CardEffectsService,
    DuelUtilsService,
    CardEffectHandlersService,
    FieldActionsService,
    TurnPhaseService,
    // Battle Services
    BattleService,
    TrapService,
    DamageCalculationService,
    GraveyardService,
    EquipmentService,
    AttackValidationService,
    MonsterBattleService,
    FieldStateService,
    // Spell, Monster, Summon Services
    SpellService,
    MonsterService,
    SummonService,
  ],
})
export class DuelsModule {}
