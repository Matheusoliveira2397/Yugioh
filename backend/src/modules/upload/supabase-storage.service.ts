import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BUCKETS = ['avatars', 'groups', 'achievements'] as const;

/** Tipo mínimo do cliente Supabase usado aqui (evita import do pacote em build). */
type SupabaseClient = {
  storage: {
    createBucket: (name: string, opts: { public: boolean; fileSizeLimit?: number; allowedMimeTypes?: string[] }) => Promise<{ error: { message?: string; error?: string } | null }>;
    from: (bucket: string) => {
      upload: (path: string, body: Buffer, opts: { contentType: string; upsert?: boolean }) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
    };
  };
};

@Injectable()
export class SupabaseStorageService {
  private client: SupabaseClient | null = null;
  private initialized = false;

  constructor(private config: ConfigService) {}

  private getClient(): SupabaseClient | null {
    if (this.initialized) {
      return this.client;
    }
    this.initialized = true;
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) {
      return (this.client = null);
    }
    try {
      // Carregamento dinâmico para o build passar mesmo sem o pacote instalado (ex.: Docker com npm ci sem lock atualizado)
      const supabase = require('@supabase/supabase-js');
      this.client = supabase.createClient(url, key) as SupabaseClient;
      console.log('✅ Supabase Storage configurado (URL:', url, ')');
    } catch (e) {
      console.warn('⚠️ Supabase Storage não disponível (instale @supabase/supabase-js ou defina SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY):', (e as Error).message);
      this.client = null;
    }
    return this.client;
  }

  isEnabled(): boolean {
    return this.getClient() !== null;
  }

  private async ensureBucket(bucket: string): Promise<void> {
    const supabase = this.getClient();
    if (!supabase) return;
    const { error } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
    });
    if (error && (error.message?.includes('already exists') || (error as any).error === 'BucketAlreadyExists')) {
      return;
    }
    if (error) {
      console.warn(`⚠️ Supabase bucket "${bucket}":`, error.message);
    }
  }

  async upload(
    bucket: string,
    filePath: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const supabase = this.getClient();
    if (!supabase) {
      throw new Error('Supabase Storage não está configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY e instale @supabase/supabase-js.');
    }
    if (!BUCKETS.includes(bucket as any)) {
      throw new Error(`Bucket inválido: ${bucket}. Use: ${BUCKETS.join(', ')}`);
    }
    await this.ensureBucket(bucket);
    const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
      contentType,
      upsert: true,
    });
    if (error) {
      throw new Error(`Erro ao enviar arquivo para Supabase: ${error.message}`);
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  }

  /**
   * Remove um arquivo do Storage a partir da URL pública.
   * A URL deve ser do formato: https://xxx.supabase.co/storage/v1/object/public/bucket/path
   */
  async deleteByPublicUrl(publicUrl: string): Promise<void> {
    const supabase = this.getClient();
    if (!supabase) return;
    const match = publicUrl.match(
      /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/,
    );
    if (!match) {
      console.warn('⚠️ URL não é do Supabase Storage:', publicUrl);
      return;
    }
    const [, bucket, filePath] = match;
    const decodedPath = decodeURIComponent(filePath);
    const { error } = await supabase.storage.from(bucket).remove([decodedPath]);
    if (error) {
      console.error('❌ Erro ao remover do Supabase:', error.message);
    } else {
      console.log('✅ Arquivo removido do Supabase:', decodedPath);
    }
  }

  isSupabaseUrl(url: string): boolean {
    return typeof url === 'string' && url.includes('supabase.co/storage');
  }
}
