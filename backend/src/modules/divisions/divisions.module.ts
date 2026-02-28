import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Division } from '../admin/entities/division.entity';
import { DivisionsService } from './divisions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Division]),
  ],
  providers: [DivisionsService],
  exports: [DivisionsService],
})
export class DivisionsModule {}

