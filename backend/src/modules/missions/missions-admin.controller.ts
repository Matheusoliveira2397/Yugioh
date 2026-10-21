import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { MissionsService, MissionInput, ObjectiveInput } from './missions.service';

@Controller('admin/missions')
@UseGuards(JwtAuthGuard, AdminGuard)
export class MissionsAdminController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get('objective-types')
  getObjectiveTypes() {
    return this.missionsService.getObjectiveCatalog();
  }

  @Get('categories')
  listCategories() {
    return this.missionsService.listCategoriesAdmin();
  }

  @Post('categories')
  createCategory(
    @Body()
    body: {
      name: string;
      description?: string | null;
      icon?: string;
      sortOrder?: number;
      isActive?: boolean;
      resetType?: string;
      startsAt?: string | null;
      endsAt?: string | null;
    },
  ) {
    return this.missionsService.createCategory(body);
  }

  @Put('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      icon?: string;
      sortOrder?: number;
      isActive?: boolean;
      resetType?: string;
      startsAt?: string | null;
      endsAt?: string | null;
    },
  ) {
    return this.missionsService.updateCategory(id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.missionsService.deleteCategory(id);
  }

  @Get()
  listMissions(@Query('categoryId') categoryId?: string) {
    return this.missionsService.listMissionsAdmin(categoryId || undefined);
  }

  @Post()
  createMission(@Body() body: MissionInput) {
    return this.missionsService.createMission(body);
  }

  @Put(':id')
  updateMission(
    @Param('id') id: string,
    @Body() body: Partial<MissionInput> & { objectives?: ObjectiveInput[] },
  ) {
    return this.missionsService.updateMission(id, body);
  }

  @Delete(':id')
  deleteMission(@Param('id') id: string) {
    return this.missionsService.deleteMission(id);
  }
}
