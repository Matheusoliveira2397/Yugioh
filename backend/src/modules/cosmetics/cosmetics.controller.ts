import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CosmeticsService } from './cosmetics.service';
import { UploadService } from '../upload/upload.service';
import { CreatePlaymatDto } from './dto/create-playmat.dto';
import { CreateSleeveDto } from './dto/create-sleeve.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('cosmetics')
export class CosmeticsController {
  constructor(
    private readonly cosmeticsService: CosmeticsService,
    private readonly uploadService: UploadService,
  ) {
    console.log('🎨 CosmeticsController initialized');
  }

  // ==================== TESTE ====================
  @Get('test')
  test() {
    return { message: 'Cosmetics module is working!', timestamp: new Date() };
  }

  // ==================== UPLOAD DE IMAGENS (Supabase ou local - persiste em produção) ====================
  @Post('admin/upload-playmat')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  async uploadPlaymatImage(@UploadedFile() file: any, @Body('name') name?: string) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie um arquivo de imagem (campo "image")');
    }
    const imageUrl = await this.uploadService.uploadCosmeticImage(file, 'playmat', name || 'playmat');
    return { imageUrl };
  }

  @Post('admin/upload-sleeve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  async uploadSleeveImage(@UploadedFile() file: any, @Body('name') name?: string) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie um arquivo de imagem (campo "image")');
    }
    const imageUrl = await this.uploadService.uploadCosmeticImage(file, 'sleeve', name || 'sleeve');
    return { imageUrl };
  }

  @Post('admin/upload-talisman')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  async uploadTalismanImage(@UploadedFile() file: any, @Body('name') name?: string) {
    if (!file?.buffer) {
      throw new BadRequestException('Envie um arquivo de imagem (campo "image")');
    }
    const imageUrl = await this.uploadService.uploadCosmeticImage(file, 'talisman', name || 'talisman');
    return { imageUrl };
  }

  // ==================== PLAYMATS - ADMIN (DEVEM VIR ANTES DAS ROTAS PÚBLICAS) ====================
  @Post('admin/playmats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createPlaymat(@Body() createPlaymatDto: CreatePlaymatDto) {
    console.log('🎨 [CosmeticsController] Creating playmat:', createPlaymatDto);
    try {
      const playmat = await this.cosmeticsService.createPlaymat(createPlaymatDto);
      console.log('✅ [CosmeticsController] Playmat created:', playmat.id);
      return playmat;
    } catch (error) {
      console.error('❌ [CosmeticsController] Error creating playmat:', error);
      throw error;
    }
  }

  @Get('admin/playmats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllPlaymats() {
    return this.cosmeticsService.findAllPlaymats();
  }

  @Get('admin/playmats/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getPlaymat(@Param('id') id: string) {
    return this.cosmeticsService.findOnePlaymat(id);
  }

  @Put('admin/playmats/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updatePlaymat(@Param('id') id: string, @Body() updateData: Partial<CreatePlaymatDto>) {
    return this.cosmeticsService.updatePlaymat(id, updateData);
  }

  @Delete('admin/playmats/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deletePlaymat(@Param('id') id: string) {
    await this.cosmeticsService.deletePlaymat(id);
    return { message: 'Playmat deletado com sucesso' };
  }

  // ==================== SLEEVES - ADMIN (DEVEM VIR ANTES DAS ROTAS PÚBLICAS) ====================
  @Post('admin/sleeves')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createSleeve(@Body() createSleeveDto: CreateSleeveDto) {
    return this.cosmeticsService.createSleeve(createSleeveDto);
  }

  @Get('admin/sleeves')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllSleeves() {
    return this.cosmeticsService.findAllSleeves();
  }

  @Get('admin/sleeves/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getSleeve(@Param('id') id: string) {
    return this.cosmeticsService.findOneSleeve(id);
  }

  @Put('admin/sleeves/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateSleeve(@Param('id') id: string, @Body() updateData: Partial<CreateSleeveDto>) {
    return this.cosmeticsService.updateSleeve(id, updateData);
  }

  @Delete('admin/sleeves/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteSleeve(@Param('id') id: string) {
    await this.cosmeticsService.deleteSleeve(id);
    return { message: 'Sleeve deletado com sucesso' };
  }

  // ==================== PLAYMATS - PÚBLICO ====================
  @Get('playmats/for-sale')
  async getPlaymatsForSale() {
    return this.cosmeticsService.findPlaymatsForSale();
  }

  // ==================== SLEEVES - PÚBLICO ====================
  @Get('sleeves/for-sale')
  async getSleevesForSale() {
    return this.cosmeticsService.findSleevesForSale();
  }
}

