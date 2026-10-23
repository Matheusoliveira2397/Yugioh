import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const asset = fileURLToPath(new URL('../public/images/ui/yugioh-fantasy-icons.webp', import.meta.url));
const source = fileURLToPath(new URL('../src/components/GameIcon.tsx', import.meta.url));
const buffer = readFileSync(asset);

function dimensions(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Atlas de ícones não é um arquivo WEBP válido');
  }
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  }
  if (kind === 'VP8L') {
    return [
      1 + buf[21] + ((buf[22] & 63) << 8),
      1 + (buf[22] >> 6) + (buf[23] << 2) + ((buf[24] & 15) << 10),
    ];
  }
  if (kind === 'VP8 ') {
    return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  throw new Error('Formato WEBP não suportado: ' + kind);
}
const [width, height] = dimensions(buffer);
if (width !== height || width % 4 !== 0 || height % 4 !== 0) {
  throw new Error(`O atlas 4x4 precisa ter células quadradas iguais. Dimensões recebidas: ${width}x${height}.`);
}
const tsx = readFileSync(source, 'utf8');
const mapping = tsx.match(/const ILLUSTRATED_ICONS:[^=]+=[^{}]*\{([\s\S]*?)\n\};/);
if (!mapping) throw new Error('Mapa de sprites do GameIcon não encontrado');
const used = [...mapping[1].matchAll(/'[^']+'\s*:\s*(\d+)/g)].map((match) => Number(match[1]));
if (used.length === 0 || used.some((slot) => slot < 0 || slot >= 16)) {
  throw new Error('Uma rota usa posição inválida fora das 16 células do atlas');
}
console.log(`OK: atlas ${width}x${height}, ${used.length} rotas, todas nas 16 células.`);
