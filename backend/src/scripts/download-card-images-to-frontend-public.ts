/**
 * Baixa (ou copia) todas as imagens das cartas cadastradas no banco para:
 *   <repo>/frontend/public/images/cards
 *
 * Assim o Vite/serve passa a entregar em /images/cards/<arquivo> (igual getCardImageDisplayUrl).
 *
 * Uso (na pasta backend):
 *   npm run download:card-images
 *   npm run download:card-images -- --dry-run
 *   npm run download:card-images -- --update-db
 *   npm run download:card-images -- --only-active
 *   npm run download:card-images -- --force          # baixar de novo mesmo se o arquivo já existir
 *
 * Variáveis opcionais no .env:
 *   API_BASE_URL=http://localhost:3000          → buscar /uploads/cards/*
 *   FRONTEND_BASE_URL=http://localhost:5173    → buscar /images/cards/* se ainda não existir no disco
 *   UPLOADS_ROOT=...                           → copiar arquivo local em vez de HTTP (mesma lógica do backend)
 */

import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { Card } from '../modules/cards/entities/card.entity';

config({ path: path.join(__dirname, '..', '..', '.env') });
config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const UPDATE_DB = argv.has('--update-db');
const ONLY_ACTIVE = argv.has('--only-active');
const FORCE = argv.has('--force');

const API_BASE = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const FRONT_BASE = (process.env.FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const CONCURRENCY = Math.max(1, parseInt(process.env.DOWNLOAD_CARD_IMAGES_CONCURRENCY || '5', 10) || 5);
const REQUEST_TIMEOUT_MS = Math.max(5000, parseInt(process.env.DOWNLOAD_CARD_IMAGES_TIMEOUT_MS || '60000', 10) || 60000);

function resolveUploadsRoot(): string {
  if (process.env.UPLOADS_ROOT?.trim()) {
    return path.normalize(process.env.UPLOADS_ROOT.trim());
  }
  if (fs.existsSync('/app/uploads')) return '/app/uploads';
  return path.join(__dirname, '..', '..', 'uploads');
}

function repoRoot(): string {
  return path.join(__dirname, '..', '..', '..');
}

function outputDir(): string {
  return path.join(repoRoot(), 'frontend', 'public', 'images', 'cards');
}

function extFromContentType(ct: string | undefined): string {
  if (!ct) return '.jpg';
  const c = ct.split(';')[0].trim().toLowerCase();
  if (c.includes('png')) return '.png';
  if (c.includes('webp')) return '.webp';
  if (c.includes('gif')) return '.gif';
  if (c.includes('jpeg') || c.includes('jpg')) return '.jpg';
  return '.jpg';
}

function extFromPath(p: string): string {
  const e = path.extname(p.split('?')[0]).toLowerCase();
  if (e && /^\.(jpe?g|png|gif|webp)$/i.test(e)) return e;
  return '';
}

function safeBaseName(card: Card): string {
  const raw = (card.idCarta && card.idCarta.trim()) || card.id;
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function resolveSourceUrl(cardImage: string): { kind: 'http'; url: string } | { kind: 'path'; url: string } | null {
  const s = (cardImage || '').trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) {
    return { kind: 'http', url: s };
  }
  if (s.startsWith('/')) {
    if (s.startsWith('/uploads/cards') || s.startsWith('/images/cards')) {
      return { kind: 'path', url: s };
    }
    return { kind: 'path', url: s };
  }
  return { kind: 'path', url: `/${s}`.replace(/\/+/g, '/') };
}

async function fetchBuffer(url: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
    headers: { 'User-Agent': 'YugiohAdminCardImageSync/1.0' },
    validateStatus: (st) => st >= 200 && st < 300,
  });
  const ct = res.headers['content-type'] as string | undefined;
  return { buffer: Buffer.from(res.data), contentType: ct };
}

async function obtainImageBuffer(cardImage: string): Promise<{ buffer: Buffer; ext: string } | null> {
  const src = resolveSourceUrl(cardImage);
  if (!src) return null;

  if (src.kind === 'http') {
    const { buffer, contentType } = await fetchBuffer(src.url);
    const ext = extFromPath(src.url) || extFromContentType(contentType);
    return { buffer, ext };
  }

  const p = src.url;
  const uploadsRoot = resolveUploadsRoot();

  if (p.startsWith('/uploads/cards/')) {
    const file = path.join(uploadsRoot, 'cards', path.basename(p.split('?')[0]));
    if (fs.existsSync(file)) {
      const ext = extFromPath(file) || '.jpg';
      return { buffer: fs.readFileSync(file), ext };
    }
    const url = `${API_BASE}${p}`;
    const { buffer, contentType } = await fetchBuffer(url);
    const ext = extFromPath(p) || extFromContentType(contentType);
    return { buffer, ext };
  }

  if (p.startsWith('/images/cards/')) {
    const name = path.basename(p.split('?')[0]);
    const localPublic = path.join(outputDir(), name);
    if (fs.existsSync(localPublic)) {
      const ext = extFromPath(localPublic) || '.jpg';
      return { buffer: fs.readFileSync(localPublic), ext };
    }
    const url = `${FRONT_BASE}${p}`;
    const { buffer, contentType } = await fetchBuffer(url);
    const ext = extFromPath(p) || extFromContentType(contentType);
    return { buffer, ext };
  }

  const rest = p.startsWith('/') ? p : `/${p}`;
  const url = `${API_BASE}${rest}`;
  const { buffer, contentType } = await fetchBuffer(url);
  const ext = extFromPath(rest) || extFromContentType(contentType);
  return { buffer, ext };
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Card],
  synchronize: false,
  logging: false,
});

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definido (.env na raiz ou em backend/).');
    process.exit(1);
  }

  const out = outputDir();
  const uploadsRoot = resolveUploadsRoot();

  console.log('📁 Pasta de saída:', out);
  console.log('🌐 API_BASE_URL:', API_BASE);
  console.log('🌐 FRONTEND_BASE_URL:', FRONT_BASE);
  console.log('📁 UPLOADS_ROOT:', uploadsRoot);
  if (DRY_RUN) console.log('🔎 Modo --dry-run (não grava arquivos nem banco).');
  if (UPDATE_DB) console.log('💾 Modo --update-db (atualiza cardImage para /images/cards/...).');
  if (FORCE) console.log('⚠️  Modo --force (sobrescreve arquivos já existentes).');

  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Card);

  const cards = ONLY_ACTIVE
    ? await repo.find({ where: { isActive: true } })
    : await repo.find();
  const withImage = cards.filter((c) => c.cardImage && String(c.cardImage).trim() !== '');

  console.log(`\n🎴 Cartas no banco: ${cards.length} | com cardImage: ${withImage.length}\n`);

  if (!DRY_RUN) {
    fs.mkdirSync(out, { recursive: true });
  }

  const summary = { ok: 0, skip: 0, err: 0 };
  const errors: string[] = [];

  async function processOne(card: Card): Promise<void> {
    const destBase = safeBaseName(card);
    if (!destBase) {
      errors.push(`Sem idCarta/id: ${card.name}`);
      summary.err++;
      return;
    }

    let existingFile: string | null = null;
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
      const fp = path.join(out, `${destBase}${ext}`);
      if (fs.existsSync(fp)) {
        existingFile = `${destBase}${ext}`;
        break;
      }
    }

    try {
      if (existingFile && !FORCE) {
        if (DRY_RUN) {
          summary.skip++;
          return;
        }
        const newPath = `/images/cards/${existingFile}`;
        if (UPDATE_DB && card.cardImage !== newPath) {
          await repo.update({ id: card.id }, { cardImage: newPath });
        }
        summary.skip++;
        return;
      }

      if (DRY_RUN) {
        const src = resolveSourceUrl(card.cardImage);
        if (src) console.log(`  [dry-run] ${card.name} (${destBase}) ← ${src.url}`);
        summary.ok++;
        return;
      }

      const obtained = await obtainImageBuffer(card.cardImage);
      if (!obtained) {
        errors.push(`Sem fonte: ${card.name}`);
        summary.err++;
        return;
      }

      const { buffer, ext } = obtained;
      const fileName = `${destBase}${ext}`;
      const destPath = path.join(out, fileName);
      fs.writeFileSync(destPath, buffer);

      if (UPDATE_DB) {
        const newPath = `/images/cards/${fileName}`;
        if (card.cardImage !== newPath) {
          await repo.update({ id: card.id }, { cardImage: newPath });
        }
      }

      summary.ok++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${card.name} (${destBase}): ${msg}`);
      summary.err++;
    }
  }

  for (let i = 0; i < withImage.length; i += CONCURRENCY) {
    const batch = withImage.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((c) => processOne(c)));
    process.stdout.write(`\r  Processadas ${Math.min(i + CONCURRENCY, withImage.length)}/${withImage.length}`);
  }
  process.stdout.write('\n');

  console.log('\n📊 Resumo');
  console.log(`   ✅ ${summary.ok} ok/simuladas`);
  console.log(`   ⏭️  ${summary.skip} já OK (pular)`);
  console.log(`   ❌ ${summary.err} falhas`);
  if (errors.length) {
    console.log('\nDetalhes (até 30):');
    errors.slice(0, 30).forEach((l) => console.log(`   - ${l}`));
    if (errors.length > 30) console.log(`   ... +${errors.length - 30} erros`);
  }

  if (UPDATE_DB && !DRY_RUN) {
    console.log('\n💡 Reinicie o frontend se já estiver rodando; confira no admin se cardImage aponta para /images/cards/.');
  }

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
