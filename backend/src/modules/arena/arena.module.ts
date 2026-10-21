import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArenaService } from './arena.service';
import { ArenaScheduleService } from './arena-schedule.service';
import { ArenaController } from './arena.controller';
import { ArenaMatchmakingService } from './arena-matchmaking.service';
import { ArenaMatchmakingProcessorService } from './arena-matchmaking-processor.service';
import { ChallengeArena } from './arena.entity';
import { ArenaSchedule } from './entities/arena-schedule.entity';
import { ArenaLevelRange } from './entities/arena-level-range.entity';
import { Duel } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { DuelsModule } from '../duels/duels.module';
import { ShopModule } from '../shop/shop.module';
import { GroupsModule } from '../groups/groups.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { MissionsModule } from '../missions/missions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChallengeArena, ArenaSchedule, ArenaLevelRange, Duel, User, Group, GroupMember]),
    forwardRef(() => DuelsModule),
    ShopModule,
    forwardRef(() => GroupsModule),
    forwardRef(() => SeasonsModule),
    MissionsModule,
  ],
  controllers: [ArenaController],
  providers: [ArenaService, ArenaScheduleService, ArenaMatchmakingService, ArenaMatchmakingProcessorService],
  exports: [ArenaService, ArenaScheduleService, ArenaMatchmakingService, ArenaMatchmakingProcessorService],
})
export class ArenaModule {}
