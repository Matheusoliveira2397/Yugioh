import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { SupabaseStorageService } from './supabase-storage.service';

/** Retorna true se DATABASE_URL aponta para Supabase (comportamento igual local/produção). */
function isSupabaseDatabase(): boolean {
  const url = process.env.DATABASE_URL || '';
  return typeof url === 'string' && (url.includes('supabase.co') || url.includes('pooler.supabase'));
}

/** Mensagem única quando o banco é Supabase mas o Storage não está configurado. */
const SUPABASE_STORAGE_REQUIRED_MSG =
  'Supabase Storage não está ativo: em backend/.env (ou variáveis do deploy) defina SUPABASE_URL=https://SEU_REF.supabase.co e ' +
  'SUPABASE_SERVICE_ROLE_KEY com a chave Secret correta (ela é um JWT "compact JWS", geralmente começa com "eyJ..."). ' +
  'Não use texto placeholder (ex.: COLE_AQUI) nem outra chave que não seja a Service Role. ' +
  'Docker: coloque no .env da raiz do projeto e rode docker compose up -d --force-recreate backend.';

function ensureSupabaseStorageIfNeeded(supabaseStorage: SupabaseStorageService): void {
  if (isSupabaseDatabase() && !supabaseStorage.isEnabled()) {
    throw new Error(SUPABASE_STORAGE_REQUIRED_MSG);
  }
}

/** Raiz `backend/uploads`: Docker (/app/uploads) ou pasta do projeto (Windows/mac/Linux). */
function resolveUploadsRoot(): string {
  if (process.env.UPLOADS_ROOT && process.env.UPLOADS_ROOT.trim()) {
    return path.normalize(process.env.UPLOADS_ROOT.trim());
  }
  if (fs.existsSync('/app/uploads')) {
    return '/app/uploads';
  }
  return path.join(__dirname, '..', '..', '..', 'uploads');
}

@Injectable()
export class UploadService {
  private readonly uploadsRoot: string;
  private readonly uploadPath: string;
  private readonly groupsPath: string;
  private readonly achievementsPath: string;
  private readonly cardsPath: string;

  constructor(private readonly supabaseStorage: SupabaseStorageService) {
    this.uploadsRoot = resolveUploadsRoot();
    this.uploadPath = path.join(this.uploadsRoot, 'avatars');
    this.groupsPath = path.join(this.uploadsRoot, 'groups');
    this.achievementsPath = path.join(this.uploadsRoot, 'achievements');
    this.cardsPath = process.env.CARDS_UPLOAD_PATH?.trim()
      ? path.normalize(process.env.CARDS_UPLOAD_PATH.trim())
      : path.join(this.uploadsRoot, 'cards');

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

    if (!fs.existsSync(this.cardsPath)) {
      fs.mkdirSync(this.cardsPath, { recursive: true });
      console.log('📁 Pasta de cartas (uploads) criada:', this.cardsPath);
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

    ensureSupabaseStorageIfNeeded(this.supabaseStorage);

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
      const urlBase = imageUrl.split('?')[0].trim();
      if (this.supabaseStorage.isSupabaseUrl(urlBase)) {
        await this.supabaseStorage.deleteByPublicUrl(urlBase);
        return;
      }
      const fileName = path.basename(urlBase);
      const filePath = path.join(this.uploadPath, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ Avatar deletado (local):', fileName);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar avatar:', error);
    }
  }

  async uploadCardImage(file: any, cardName: string, cardId?: string): Promise<string> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new Error('Formato de imagem inválido. Use PNG, JPG ou WEBP.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Imagem muito grande. Tamanho máximo: 10MB.');
    }

    ensureSupabaseStorageIfNeeded(this.supabaseStorage);

    const fileExtension = path.extname(file.originalname);
    const baseName = cardId || `card_${cardName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const fileName = `${baseName}${fileExtension}`;

    if (this.supabaseStorage.isEnabled()) {
      const publicUrl = await this.supabaseStorage.upload(
        'cards',
        fileName,
        file.buffer,
        file.mimetype,
      );
      console.log('✅ Imagem da carta salva no Supabase:', fileName);
      return publicUrl;
    }

    const filePath = path.join(this.cardsPath, fileName);
    fs.writeFileSync(filePath, file.buffer);
    console.log('✅ Imagem da carta salva (local):', fileName);
    return `/uploads/cards/${fileName}`;
  }

  async deleteCardImage(imageUrl: string): Promise<void> {
    try {
      if (!imageUrl || imageUrl.trim() === '') return;
      if (this.supabaseStorage.isSupabaseUrl(imageUrl)) {
        await this.supabaseStorage.deleteByPublicUrl(imageUrl);
        return;
      }
      const fileName = path.basename(imageUrl.split('?')[0]);
      const filePath = path.join(this.cardsPath, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ Imagem da carta deletada:', fileName);
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
      ensureSupabaseStorageIfNeeded(this.supabaseStorage);

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

      if (!cardId) {
        throw new Error('cardId (idCarta) é obrigatório para salvar a imagem');
      }

      const fileName = `${cardId}${fileExtension}`;

      if (this.supabaseStorage.isEnabled()) {
        const publicUrl = await this.supabaseStorage.upload(
          'cards',
          fileName,
          imageBuffer,
          contentType,
        );
        console.log('✅ Imagem da carta salva no Supabase:', fileName);
        return publicUrl;
      }

      if (!fs.existsSync(this.cardsPath)) {
        fs.mkdirSync(this.cardsPath, { recursive: true });
      }
      const filePath = path.join(this.cardsPath, fileName);
      fs.writeFileSync(filePath, imageBuffer);
      console.log('✅ Imagem da carta salva (local):', filePath);
      return `/uploads/cards/${fileName}`;
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
      
      const oldFilePath = path.join(this.cardsPath, oldFileName);
      
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
      const newFilePath = path.join(this.cardsPath, newFileName);
      
      // Se o arquivo novo já existe e é o mesmo arquivo (mesmo tamanho), não renomear
      if (fs.existsSync(newFilePath)) {
        const oldStats = fs.statSync(oldFilePath);
        const newStats = fs.statSync(newFilePath);
        if (oldStats.size === newStats.size) {
          console.log(`ℹ️ Arquivo já existe com idCarta e mesmo tamanho: ${newFileName}, deletando original`);
          // Deletar arquivo antigo se o novo já existe
          fs.unlinkSync(oldFilePath);
          return `/uploads/cards/${newFileName}`;
        } else {
          console.warn(`⚠️ Arquivo já existe com idCarta mas tamanho diferente: ${newFileName}, mantendo ambos`);
          return null;
        }
      }
      
      // Renomear arquivo físico
      fs.renameSync(oldFilePath, newFilePath);
      console.log(`✅ Arquivo FÍSICO renomeado: ${oldFileName} -> ${newFileName} em ${this.cardsPath}`);
      
      // Verificar se renomeação foi bem-sucedida
      if (!fs.existsSync(newFilePath)) {
        console.error(`❌ Erro: Arquivo não existe após renomeação: ${newFilePath}`);
        return null;
      }
      
      return `/uploads/cards/${newFileName}`;
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
      if (!fs.existsSync(this.cardsPath)) {
        console.warn(`⚠️ Diretório de cartas não existe: ${this.cardsPath}`);
        return null;
      }
      
      const files = fs.readdirSync(this.cardsPath);
      
      // Buscar arquivo que começa com o prefixo
      const matchingFile = files.find(file => 
        file.toLowerCase().startsWith(prefix) && 
        (file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.webp'))
      );
      
      if (matchingFile) {
        const imagePath = `/uploads/cards/${matchingFile}`;
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

    ensureSupabaseStorageIfNeeded(this.supabaseStorage);

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

    ensureSupabaseStorageIfNeeded(this.supabaseStorage);

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

  /** Remove logo ou banner de grupo (Supabase Storage ou pasta uploads/groups). */
  async deleteGroupAsset(imageUrl: string | null | undefined): Promise<void> {
    try {
      if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) return;
      const urlBase = imageUrl.split('?')[0].trim();
      if (
        urlBase.includes('/images/default') ||
        urlBase.includes('/groups/default') ||
        urlBase.includes('/avatars/default')
      ) {
        return;
      }
      if (this.supabaseStorage.isSupabaseUrl(urlBase)) {
        await this.supabaseStorage.deleteByPublicUrl(urlBase);
        return;
      }
      const fileName = path.basename(urlBase);
      const filePath = path.join(this.groupsPath, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('✅ Arquivo de grupo deletado (local):', fileName);
      }
    } catch (error) {
      console.error('❌ Erro ao deletar imagem do grupo:', error);
    }
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

    ensureSupabaseStorageIfNeeded(this.supabaseStorage);

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

    ensureSupabaseStorageIfNeeded(this.supabaseStorage);

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
