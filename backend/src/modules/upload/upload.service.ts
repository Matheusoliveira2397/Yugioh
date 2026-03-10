import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { SupabaseStorageService } from './supabase-storage.service';

@Injectable()
export class UploadService {
  // Caminho absoluto dentro do container - mesmo em produção compilada
  private readonly uploadPath = '/app/uploads/avatars';
  private readonly groupsPath = '/app/uploads/groups';
  private readonly achievementsPath = '/app/uploads/achievements';

  // Caminho para salvar no frontend (public/images/cards)
  // Em Docker: usa o volume mapeado /app/frontend-cards
  // Em desenvolvimento local: tenta acessar via caminho relativo
  private readonly frontendCardsPath = (() => {
    // Se tiver variável de ambiente, usar ela
    if (process.env.FRONTEND_CARDS_PATH) {
      return process.env.FRONTEND_CARDS_PATH;
    }

    // Se estiver em Docker (volume mapeado)
    if (fs.existsSync('/app/frontend-cards')) {
      return '/app/frontend-cards';
    }

    // Tentar encontrar o diretório raiz do projeto
    // __dirname em desenvolvimento: backend/src/modules/upload
    // __dirname em produção: backend/dist/modules/upload
    let projectRoot = __dirname;

    // Subir até encontrar a pasta raiz (que contém backend e frontend)
    while (projectRoot !== path.dirname(projectRoot)) {
      const frontendPath = path.join(projectRoot, '..', 'frontend', 'public', 'images', 'cards');
      if (fs.existsSync(path.join(projectRoot, '..', 'frontend'))) {
        return frontendPath;
      }
      projectRoot = path.dirname(projectRoot);
    }

    // Fallback: caminho relativo padrão
    return path.join(__dirname, '..', '..', '..', '..', 'frontend', 'public', 'images', 'cards');
  })();

  constructor(private readonly supabaseStorage: SupabaseStorageService) {
    // Cria a pasta de uploads se não existir
    if (!fs.existsSync(this.uploadPath)) {
      fs.mkdirSync(this.uploadPath, { recursive: true });
      console.log('📁 Pasta de uploads criada:', this.uploadPath);
    }
    if (!fs.existsSync(this.groupsPath)) {
      fs.mkdirSync(this.groupsPath, { recursive: true });
      console.log('📁 Pasta de grupos criada:', this.groupsPath);
    }
    if (!fs.existsSync(this.achievementsPath)) {
      fs.mkdirSync(this.achievementsPath, { recursive: true });
      console.log('📁 Pasta de conquistas criada:', this.achievementsPath);
    }
    
    // Criar pasta de cartas no frontend se não existir
    console.log('🔍 Caminho do frontend para cartas:', this.frontendCardsPath);
    if (!fs.existsSync(this.frontendCardsPath)) {
      try {
        fs.mkdirSync(this.frontendCardsPath, { recursive: true });
        console.log('📁 Pasta de cartas no frontend criada:', this.frontendCardsPath);
      } catch (error: any) {
        console.warn('⚠️ Não foi possível criar pasta no frontend (pode não estar mapeada):', this.frontendCardsPath, error.message);
      }
    } else {
      console.log('✅ Pasta de cartas no frontend já existe:', this.frontendCardsPath);
    }
  }

  async uploadAvatar(file: any, userId: string): Promise<string> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 5MB.');
    }

    const fileExtension = path.extname(file.originalname);
    const fileName = `user_${userId}_${Date.now()}${fileExtension}`;

    if (this.supabaseStorage.isEnabled()) {
      const publicUrl = await this.supabaseStorage.upload(
        'avatars',
        fileName,
        file.buffer,
        file.mimetype,
      );
      console.log('✅ Avatar salvo no Supabase:', fileName);
      return publicUrl;
    }

    const filePath = path.join(this.uploadPath, fileName);
    fs.writeFileSync(filePath, file.buffer);
    console.log('✅ Avatar salvo (local):', fileName);
    return `/uploads/avatars/${fileName}`;
  }

  async deleteAvatar(imageUrl: string): Promise<void> {
    try {
      if (!imageUrl || imageUrl.includes('/images/default') || imageUrl.includes('/avatars/default')) {
        return;
      }
      if (this.supabaseStorage.isSupabaseUrl(imageUrl)) {
        await this.supabaseStorage.deleteByPublicUrl(imageUrl);
        return;
      }
      const fileName = path.basename(imageUrl);
      const filePath = path.join(this.uploadPath, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ Avatar deletado (local):', fileName);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar avatar:', error);
    }
  }

  async uploadCardImage(file: any, cardName: string): Promise<string> {
    // Validações
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }

    // Limite de tamanho: 10MB (cartas podem ser maiores)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 10MB.');
    }

    // Gera nome único para o arquivo
    const fileExtension = path.extname(file.originalname);
    const sanitizedName = cardName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fileName = `card_${sanitizedName}_${Date.now()}${fileExtension}`;
    
    // Salvar APENAS no frontend (public/images/cards) - único local de salvamento
    const frontendFilePath = path.join(this.frontendCardsPath, fileName);
    try {
      fs.writeFileSync(frontendFilePath, file.buffer);
      console.log('✅ Carta salva no frontend:', frontendFilePath);
    } catch (error: any) {
      console.error('❌ Erro ao salvar carta no frontend:', error.message);
      throw new Error(`Erro ao salvar imagem: ${error.message}`);
    }

    // Retorna o caminho do frontend (acesso direto, sem chamar API)
    return `/images/cards/${fileName}`;
  }

  async deleteCardImage(imageUrl: string): Promise<void> {
    try {
      // Extrai o nome do arquivo da URL (pode ser /images/cards/ ou /uploads/cards/)
      let fileName = path.basename(imageUrl);
      
      // Se for caminho completo, extrair apenas o nome do arquivo
      if (imageUrl.includes('/')) {
        fileName = imageUrl.split('/').pop() || fileName;
      }
      
      // Deletar APENAS do frontend (public/images/cards)
      const frontendFilePath = path.join(this.frontendCardsPath, fileName);
      if (fs.existsSync(frontendFilePath)) {
        fs.unlinkSync(frontendFilePath);
        console.log('✅ Imagem da carta deletada do frontend:', fileName);
      } else {
        console.warn('⚠️ Arquivo não encontrado para deletar:', frontendFilePath);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar imagem da carta:', error);
    }
  }

  /**
   * Baixa uma imagem de uma URL e salva no servidor
   * @param imageUrl URL da imagem para baixar
   * @param cardName Nome da carta (usado como fallback se cardId não for fornecido)
   * @param cardId ID da carta (idCarta) - se fornecido, será usado para nomear o arquivo
   */
  async downloadAndSaveCardImage(imageUrl: string, cardName: string, cardId?: string): Promise<string> {
    try {
      // Validar URL
      if (!imageUrl || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
        throw new Error('URL de imagem inválida');
      }

      console.log(`📥 Baixando imagem de: ${imageUrl}`);

      // Baixar a imagem
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 segundos
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // Detectar tipo MIME
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
      
      if (!allowedMimeTypes.includes(contentType)) {
        throw new Error(`Formato de imagem inválido: ${contentType}`);
      }

      // Validar tamanho (10MB)
      const imageBuffer = Buffer.from(response.data);
      if (imageBuffer.length > 10 * 1024 * 1024) {
        throw new Error('Imagem muito grande. Tamanho máximo: 10MB.');
      }

      // Determinar extensão baseado no Content-Type ou URL
      let fileExtension = '.jpg';
      if (contentType.includes('png')) fileExtension = '.png';
      else if (contentType.includes('webp')) fileExtension = '.webp';
      else if (imageUrl.includes('.png')) fileExtension = '.png';
      else if (imageUrl.includes('.webp')) fileExtension = '.webp';

      // CRÍTICO: Sempre usar cardId (idCarta) como nome do arquivo
      // Se não tiver cardId, lançar erro porque é obrigatório
      if (!cardId) {
        throw new Error('cardId (idCarta) é obrigatório para salvar a imagem');
      }
      
      // Usar cardId diretamente como nome do arquivo (ex: YGOPRO_56747793.jpg)
      const fileName = `${cardId}${fileExtension}`;
      
      // Salvar APENAS no frontend (public/images/cards) - único local de salvamento
      const frontendFilePath = path.join(this.frontendCardsPath, fileName);
      console.log(`💾 Tentando salvar no frontend: ${frontendFilePath}`);
      console.log(`💾 Pasta existe? ${fs.existsSync(this.frontendCardsPath)}`);
      
      try {
        fs.writeFileSync(frontendFilePath, imageBuffer);
        console.log(`✅ Imagem salva no frontend: ${frontendFilePath}`);
        console.log(`✅ Arquivo existe após salvar? ${fs.existsSync(frontendFilePath)}`);
      } catch (error: any) {
        console.error('❌ Erro ao salvar imagem no frontend:', error.message);
        throw new Error(`Erro ao salvar imagem: ${error.message}`);
      }

      // Retorna o caminho do frontend (acesso direto, sem chamar API)
      const imagePath = `/images/cards/${fileName}`;
      console.log(`📝 Retornando caminho da imagem: ${imagePath}`);
      return imagePath;
    } catch (error: any) {
      console.error('❌ Erro ao baixar imagem:', error.message);
      throw new Error(`Erro ao baixar imagem: ${error.message}`);
    }
  }

  /**
   * Renomeia uma imagem de carta para usar idCarta como nome
   */
  async renameCardImage(oldPath: string, idCarta: string): Promise<string | null> {
    try {
      if (!oldPath || !idCarta) {
        console.warn(`⚠️ Parâmetros inválidos para renomear: oldPath=${oldPath}, idCarta=${idCarta}`);
        return null;
      }
      
      // Extrair nome do arquivo antigo do caminho
      let oldFileName: string;
      if (oldPath.includes('/')) {
        oldFileName = oldPath.split('/').pop() || path.basename(oldPath);
      } else {
        oldFileName = oldPath;
      }
      
      const oldFilePath = path.join(this.frontendCardsPath, oldFileName);
      
      // Verificar se arquivo existe
      if (!fs.existsSync(oldFilePath)) {
        console.warn(`⚠️ Arquivo não encontrado para renomear: ${oldFilePath}`);
        return null;
      }
      
      // Determinar extensão do arquivo antigo
      const fileExtension = path.extname(oldFileName);
      if (!fileExtension) {
        console.warn(`⚠️ Arquivo sem extensão: ${oldFileName}`);
        return null;
      }
      
      // Novo nome do arquivo usando idCarta
      const newFileName = `${idCarta}${fileExtension}`;
      const newFilePath = path.join(this.frontendCardsPath, newFileName);
      
      // Se o arquivo novo já existe e é o mesmo arquivo (mesmo tamanho), não renomear
      if (fs.existsSync(newFilePath)) {
        const oldStats = fs.statSync(oldFilePath);
        const newStats = fs.statSync(newFilePath);
        if (oldStats.size === newStats.size) {
          console.log(`ℹ️ Arquivo já existe com idCarta e mesmo tamanho: ${newFileName}, deletando original`);
          // Deletar arquivo antigo se o novo já existe
          fs.unlinkSync(oldFilePath);
          return `/images/cards/${newFileName}`;
        } else {
          console.warn(`⚠️ Arquivo já existe com idCarta mas tamanho diferente: ${newFileName}, mantendo ambos`);
          return null;
        }
      }
      
      // Renomear arquivo físico
      fs.renameSync(oldFilePath, newFilePath);
      console.log(`✅ Arquivo FÍSICO renomeado: ${oldFileName} -> ${newFileName} em ${this.frontendCardsPath}`);
      
      // Verificar se renomeação foi bem-sucedida
      if (!fs.existsSync(newFilePath)) {
        console.error(`❌ Erro: Arquivo não existe após renomeação: ${newFilePath}`);
        return null;
      }
      
      return `/images/cards/${newFileName}`;
    } catch (error: any) {
      console.error(`❌ Erro ao renomear arquivo físico:`, error.message);
      console.error(`❌ Stack:`, error.stack);
      return null;
    }
  }

  /**
   * Busca o arquivo de imagem de uma carta pelo nome
   * Retorna o caminho completo do arquivo se encontrado, ou null
   */
  findCardImageByName(cardName: string): string | null {
    try {
      if (!cardName) return null;
      
      // Sanitizar o nome da carta para corresponder ao formato dos arquivos
      const sanitizedName = cardName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const prefix = `card_${sanitizedName}_`;
      
      // Listar arquivos no diretório
      if (!fs.existsSync(this.frontendCardsPath)) {
        console.warn(`⚠️ Diretório de cartas não existe: ${this.frontendCardsPath}`);
        return null;
      }
      
      const files = fs.readdirSync(this.frontendCardsPath);
      
      // Buscar arquivo que começa com o prefixo
      const matchingFile = files.find(file => 
        file.toLowerCase().startsWith(prefix) && 
        (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.webp'))
      );
      
      if (matchingFile) {
        const imagePath = `/images/cards/${matchingFile}`;
        console.log(`✅ Arquivo encontrado para "${cardName}": ${imagePath}`);
        return imagePath;
      }
      
      console.warn(`⚠️ Arquivo não encontrado para "${cardName}" (prefixo: ${prefix})`);
      return null;
    } catch (error: any) {
      console.error(`❌ Erro ao buscar arquivo para "${cardName}":`, error.message);
      return null;
    }
  }

  async uploadGroupLogo(file: any, groupId: string): Promise<string> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 5MB.');
    }

    const fileExtension = path.extname(file.originalname);
    const fileName = `group_${groupId}_logo_${Date.now()}${fileExtension}`;

    if (this.supabaseStorage.isEnabled()) {
      const publicUrl = await this.supabaseStorage.upload(
        'groups',
        fileName,
        file.buffer,
        file.mimetype,
      );
      console.log('✅ Logo do grupo salvo no Supabase:', fileName);
      return publicUrl;
    }

    const filePath = path.join(this.groupsPath, fileName);
    fs.writeFileSync(filePath, file.buffer);
    console.log('✅ Logo do grupo salvo (local):', fileName);
    return `/uploads/groups/${fileName}`;
  }

  async uploadGroupBanner(file: any, groupId: string): Promise<string> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 10MB.');
    }

    const fileExtension = path.extname(file.originalname);
    const fileName = `group_${groupId}_banner_${Date.now()}${fileExtension}`;

    if (this.supabaseStorage.isEnabled()) {
      const publicUrl = await this.supabaseStorage.upload(
        'groups',
        fileName,
        file.buffer,
        file.mimetype,
      );
      console.log('✅ Banner do grupo salvo no Supabase:', fileName);
      return publicUrl;
    }

    const filePath = path.join(this.groupsPath, fileName);
    fs.writeFileSync(filePath, file.buffer);
    console.log('✅ Banner do grupo salvo (local):', fileName);
    return `/uploads/groups/${fileName}`;
  }

  /**
   * Upload de imagem de playmat ou sleeve para Supabase Storage.
   * Em produção as imagens ficam persistidas; sem Supabase salva em disco (efêmero no Fly.io).
   */
  async uploadCosmeticImage(
    file: any,
    type: 'playmat' | 'sleeve' | 'talisman',
    name: string,
  ): Promise<string> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 5MB.');
    }
    const dirName = type === 'sleeve' ? 'sleeves' : type === 'talisman' ? 'talismans' : 'playmats';
    const prefix = type === 'sleeve' ? 'sleeve' : type === 'talisman' ? 'talisman' : 'playmat';
    const fileExtension = path.extname(file.originalname);
    const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fileName = `${prefix}_${sanitizedName}_${Date.now()}${fileExtension}`;
    const filePath = `${dirName}/${fileName}`;

    if (this.supabaseStorage.isEnabled()) {
      const publicUrl = await this.supabaseStorage.upload(
        'cosmetics',
        filePath,
        file.buffer,
        file.mimetype,
      );
      console.log(`✅ Cosmético (${type}) salvo no Supabase:`, filePath);
      return publicUrl;
    }

    const localDir = path.join(__dirname, '..', '..', 'uploads', 'cosmetics', dirName);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const localPath = path.join(localDir, fileName);
    fs.writeFileSync(localPath, file.buffer);
    console.log(`✅ Cosmético (${type}) salvo (local):`, fileName);
    return `/uploads/cosmetics/${dirName}/${fileName}`;
  }

  async uploadAchievementImage(file: any, achievementTitle: string): Promise<string> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 5MB.');
    }

    const fileExtension = path.extname(file.originalname);
    const sanitizedName = achievementTitle.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const fileName = `achievement_${sanitizedName}_${Date.now()}${fileExtension}`;

    if (this.supabaseStorage.isEnabled()) {
      const publicUrl = await this.supabaseStorage.upload(
        'achievements',
        fileName,
        file.buffer,
        file.mimetype,
      );
      console.log('✅ Imagem de conquista salva no Supabase:', fileName);
      return publicUrl;
    }

    const filePath = path.join(this.achievementsPath, fileName);
    fs.writeFileSync(filePath, file.buffer);
    console.log('✅ Imagem de conquista salva (local):', fileName);
    return `/uploads/achievements/${fileName}`;
  }
}
