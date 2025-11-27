import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArenaService } from './arena.service';
import { ArenaController } from './arena.controller';
import { ChallengeArena } from './arena.entity';
import { Duel } from '../duels/entities/duel.entity';
import { User } from '../users/entities/user.entity';
import { DuelsModule } from '../duels/duels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChallengeArena, Duel, User]),
    forwardRef(() => DuelsModule),
  ],
  controllers: [ArenaController],
  providers: [ArenaService],
  exports: [ArenaService],
})
export class ArenaModule {}
