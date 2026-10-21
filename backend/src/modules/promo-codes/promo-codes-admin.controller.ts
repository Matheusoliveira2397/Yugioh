import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { PromoCodesService, PromoCodeInput } from './promo-codes.service';

@Controller('admin/promo-codes')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PromoCodesAdminController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Get()
  list() {
    return this.promoCodesService.findAllAdmin();
  }

  @Post()
  create(@Body() body: PromoCodeInput) {
    return this.promoCodesService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: PromoCodeInput) {
    return this.promoCodesService.update(id, body);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.promoCodesService.setActive(id, true);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.promoCodesService.setActive(id, false);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promoCodesService.remove(id);
  }
}
