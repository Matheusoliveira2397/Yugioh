import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArenaService } from './arena.service';
import { ArenaController } from './arena.controller';
import { ArenaMatchmakingService } from './arena-matchmaking.service';
import { ArenaMatchmakingProcessorService } from './arena-matchmaking-processor.service';
import { ChallengeArena } from './arena.entity';
import { Duel } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupMember } from '../groups/entities/group-member.entity';
import { DuelsModule } from '../duels/duels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChallengeArena, Duel, User, Group, GroupMember]),
    forwardRef(() => DuelsModule),
  ],
  controllers: [ArenaController],
  providers: [ArenaService, ArenaMatchmakingService, ArenaMatchmakingProcessorService],
  exports: [ArenaService, ArenaMatchmakingService, ArenaMatchmakingProcessorService],
})
export class ArenaModule {}
