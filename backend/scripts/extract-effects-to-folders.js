/**
 * Extrai ativações de trap do duels.service para effects/traps/
 * e cria wrappers finos no service.
 */
const fs = require('fs');
const path = require('path');

const svcPath = path.join(__dirname, '../src/modules/duels/duels.service.ts');
const trapDir = path.join(__dirname, '../src/modules/duels/services/card-effects/effects/traps');
const monsterDir = path.join(__dirname, '../src/modules/duels/services/card-effects/effects/Monsters');
const spellDir = path.join(__dirname, '../src/modules/duels/services/card-effects/effects/spells');

fs.mkdirSync(trapDir, { recursive: true });
fs.mkdirSync(monsterDir, { recursive: true });
fs.mkdirSync(spellDir, { recursive: true });

const lines = fs.readFileSync(svcPath, 'utf8').split(/\r?\n/);

const trapMethods = [
  { name: 'trap-hole', start: 1952, end: 2048 },
  { name: 'bottomless-trap-hole', start: 2055, end: 2134 },
  { name: 'sakuretsu-armor', start: 2158, end: 2259 },
  {
    name: 'ring-of-destruction',
    start: 2266,
    end: 2373,
    extraImports: [
      "import * as Pts from '../spells/player-target-spell.helpers';",
      "import { TurnPhase, DuelResult } from '../../../../entities/duel.entity';",
    ],
  },
  { name: 'defense-draw', start: 2453, end: 2521 },
  { name: 'mirror-force', start: 2523, end: 2655 },
  { name: 'dimensional-prison', start: 2663, end: 2754 },
  { name: 'waboku-activation', start: 2762, end: 2836 },
];

function extractMethod(start, end) {
  let chunk = lines.slice(start - 1, end).join('\n');
  chunk = chunk.replace(/^\s*private async /, 'export async function ');
  chunk = chunk.replace(/^\s*async checkAndActivate/, 'export async function checkAndActivate');
  chunk = chunk.replace(/export async function (\w+)\(/, 'export async function $1(host: any, ');
  chunk = chunk.replace(/\bthis\./g, 'host.');
  // desindent 2 spaces from class method body (optional, keep as-is)
  return chunk;
}

const exportNames = [];
for (const m of trapMethods) {
  const body = extractMethod(m.start, m.end);
  const fnMatch = body.match(/export async function (\w+)/);
  const fnName = fnMatch ? fnMatch[1] : m.name;
  exportNames.push({ file: m.name, fn: fnName });

  const header = [
    "import { logger } from '../../../../../../common/utils/logger.util';",
    "import type { Duel } from '../../../../entities/duel.entity';",
    ...(m.extraImports || []),
    '',
    `/** Trap activation — ${m.name} (effects/traps) */`,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(trapDir, `${m.name}.ts`), header + body + '\n');
  console.log('Wrote traps/' + m.name + '.ts -> ' + fnName);
}

// traps/index.ts
const trapsIndex = [
  "export * from './drop-off.effect';",
  ...exportNames.map((e) => `export * from './${e.file}';`),
  '',
].join('\n');
fs.writeFileSync(path.join(trapDir, 'index.ts'), trapsIndex);

// Replace methods in duels.service with thin wrappers
let svc = fs.readFileSync(svcPath, 'utf8');

// Ensure import for trap activations
const trapImport =
  "import * as TrapActivations from './services/card-effects/effects/traps';\n";
if (!svc.includes("card-effects/effects/traps")) {
  svc = svc.replace(
    /import \* as Pts from ['"].*player-target-spell\.helpers['"];?\n/,
    (match) => match + trapImport,
  );
}

function makeWrapper(fnName, paramsSignature) {
  return `  private async ${fnName}(${paramsSignature}): Promise<boolean> {\n    return TrapActivations.${fnName}(this as any, ${paramsSignature.split(/,\s*/).map((p) => p.trim().split(/[:?]/)[0].trim()).filter(Boolean).join(', ')});\n  }`;
}

// Simpler: replace each method body range with wrapper by string match on function start/end
function replaceMethodWithWrapper(source, startLine, endLine, fnName) {
  const srcLines = source.split(/\r?\n/);
  const methodLines = srcLines.slice(startLine - 1, endLine);
  const first = methodLines[0];
  // Get params from original
  const full = methodLines.join('\n');
  const sigMatch = full.match(/(?:private\s+)?async\s+(\w+)\s*\(([\s\S]*?)\)\s*:\s*Promise<boolean>/);
  if (!sigMatch) {
    console.warn('Could not parse signature for', fnName);
    return source;
  }
  const params = sigMatch[2].replace(/\s+/g, ' ').trim();
  const paramNames = params
    .split(',')
    .map((p) => p.trim().split(/[:?=]/)[0].trim())
    .filter(Boolean);

  const wrapper = [
    `  private async ${fnName}(${params}): Promise<boolean> {`,
    `    return TrapActivations.${fnName}(this as any, ${paramNames.join(', ')});`,
    `  }`,
  ].join('\n');

  const before = srcLines.slice(0, startLine - 1);
  const after = srcLines.slice(endLine);
  return [...before, wrapper, ...after].join('\n');
}

// Replace from bottom to top so line numbers stay valid
const sorted = [...trapMethods].sort((a, b) => b.start - a.start);
for (const m of sorted) {
  const fn = exportNames.find((e) => e.file === m.name).fn;
  svc = replaceMethodWithWrapper(svc, m.start, m.end, fn);
  console.log('Wrapped', fn);
}

fs.writeFileSync(svcPath, svc);
console.log('Updated duels.service.ts');

// --- Monster stub files (catalog of cards; logic still delegated via host until full migrate) ---
const monsters = [
  'fiber-jar',
  'snowman-eater',
  'morphing-jar',
  'dekoichi',
  'cyber-stein',
  'cyber-dragon',
  'chaos-sorcerer',
  'chaos-emperor-dragon',
  'black-luster-soldier',
  'dark-armed-dragon',
  'breaker-the-magical-warrior',
  'thestalos',
  'exiled-force',
  'red-eyes-darkness-metal-dragon',
  'mataza-the-zapper',
  'swift-gaia',
  'jinzo',
];

for (const name of monsters) {
  const file = path.join(monsterDir, `${name}.ts`);
  if (fs.existsSync(file)) continue;
  fs.writeFileSync(
    file,
    `/**
 * Efeito: ${name}
 * Pasta: effects/Monsters/
 *
 * A lógica runtime ainda é chamada via DuelsService / gateway.
 * Mova a implementação para este arquivo e registre no CardEffectsModule.
 */
export const CARD_KEY = '${name}';
`,
  );
}

fs.writeFileSync(
  path.join(monsterDir, 'index.ts'),
  monsters.map((n) => `export * from './${n}';`).join('\n') + '\n',
);

// Remove old monsters README if present under either casing
const oldReadme = path.join(__dirname, '../src/modules/duels/services/card-effects/effects/monsters/README.md');
if (fs.existsSync(oldReadme)) {
  try {
    fs.unlinkSync(oldReadme);
  } catch (_) {}
}

console.log('Monster stubs written:', monsters.length);
console.log('Done.');
