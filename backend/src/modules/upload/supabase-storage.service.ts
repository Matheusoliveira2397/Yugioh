import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BUCKETS = ['avatars', 'groups', 'achievements', 'cosmetics', 'cards'] as const;

/** Valores típicos de .env de exemplo — não são chaves reais. */
function looksLikePlaceholderUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.includes('seu-projeto') || u.includes('xxx.supabase');
}

function looksLikePlaceholderKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return (
    k.includes('cole_aqui') ||
    k.includes('sua-service-role') ||
    k.includes('your_service') ||
    k === 'changeme'
  );
}

function looksLikeCompactJws(key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  // JWS compacto (JWT) geralmente tem 2 pontos: header.payload.signature
  const dotCount = (k.match(/\./g) || []).length;
  if (dotCount < 2) return false;
  // Normalmente começa com "eyJ..." (base64 de header JSON)
  if (!/^eyJ/i.test(k) && !/^eyp/i.test(k) && !/^ewo/i.test(k)) {
    // alguns JWTs podem começar diferente, mas "sb_secret_" ou similares definitivamente não são JWT
    if (k.toLowerCase().startsWith('sb_secret_')) return false;
  }
  return true;
}

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
  private warnedMissingConfig = false;

  constructor(private config: ConfigService) {}

  private getClient(): SupabaseClient | null {
    if (this.initialized) {
      return this.client;
    }
    this.initialized = true;
    const url = (
      this.config.get<string>('SUPABASE_URL') ||
      process.env.SUPABASE_URL ||
      ''
    ).trim();
    const key = (
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      ''
    ).trim();

    const invalid =
      !url ||
      !key ||
      looksLikePlaceholderUrl(url) ||
      looksLikePlaceholderKey(key) ||
      !looksLikeCompactJws(key);
    if (invalid) {
      const dbUrl = process.env.DATABASE_URL || '';
      const usesSupabase =
        typeof dbUrl === 'string' &&
        (dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase'));
      if (usesSupabase && !this.warnedMissingConfig) {
        this.warnedMissingConfig = true;
        console.warn(
          '⚠️ Supabase Storage não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY com valores reais ' +
            '(Dashboard > Project Settings > API > Secret API key — a chave longa, que é um JWT "compact JWS", não a "anon"). ' +
            'Remova textos como COLE_AQUI do .env. Com Docker: .env na raiz do projeto + recrie o container do backend.',
        );
      }
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
    const urlNoQuery = publicUrl.split('?')[0].trim();
    const match = urlNoQuery.match(
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
