import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArenaService } from './arena.service';
import { ArenaController } from './arena.controller';
import { ChallengeArena } from './arena.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ChallengeArena])],
  controllers: [ArenaController],
  providers: [ArenaService],
  exports: [ArenaService],
})
export class ArenaModule {}
