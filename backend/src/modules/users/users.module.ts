import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { UploadModule } from '../upload/upload.module';
import { SeasonRanking } from '../seasons/entities/season-ranking.entity';
import { Season } from '../seasons/entities/season.entity';
import { GroupMember } from '../groups/entities/group-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SeasonRanking, Season, GroupMember]),
    UploadModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
