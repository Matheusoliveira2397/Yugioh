/**
 * Audit: active Spell/Trap/Effect(+Fusion with effect) cards without registered effects.
 * Usage: node scripts/_audit-missing-effects.js
 */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const root = path.join(__dirname, '..');
const envPath = fs.existsSync(path.join(root, '.env'))
  ? path.join(root, '.env')
  : path.join(root, '..', '.env');
dotenv.config({ path: envPath });

const { Client } = require('pg');

function normalizeCardKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function compactCardKey(value) {
  return normalizeCardKey(value).replace(/[\s_\-']/g, '');
}

function walkTsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsFiles(p, out);
    else if (/\.tsx?$/.test(ent.name)) out.push(p);
  }
  return out;
}

function extractQuotedStrings(src) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    out.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n'));
  }
  return out;
}

/** Collect effect card names from catalog + registry registrations + common name checks */
function collectEffectNames() {
  const effectsRoot = path.join(
    root,
    'src/modules/duels/services/card-effects',
  );
  const names = new Set();
  const ids = new Set();

  // 1) Catalog
  const catalogPath = path.join(effectsRoot, 'catalog/all-effects.catalog.ts');
  const catalogSrc = fs.readFileSync(catalogPath, 'utf8');
  for (const m of catalogSrc.matchAll(/name:\s*'([^']+)'/g)) {
    names.add(m[1]);
  }
  for (const m of catalogSrc.matchAll(/name:\s*"([^"]+)"/g)) {
    names.add(m[1]);
  }

  // 2) registerSimple / cardNames arrays in module + effect files
  const files = [
    path.join(effectsRoot, 'card-effects.module.ts'),
    ...walkTsFiles(path.join(effectsRoot, 'effects')),
    path.join(root, 'src/modules/duels/services/player-target-spell.helpers.ts'),
  ].filter((f) => fs.existsSync(f));

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');

    // registerSimple(['A', 'B'], ...)
    for (const m of src.matchAll(/registerSimple\(\s*\[([^\]]+)\]/gs)) {
      for (const s of extractQuotedStrings(m[1])) {
        if (s.length >= 2 && !s.includes('/') && !s.startsWith('.')) names.add(s);
      }
    }

    // cardNames = ['...'] or cardNames: ['...']
    for (const m of src.matchAll(/cardNames\s*[:=]\s*\[([^\]]+)\]/gs)) {
      for (const s of extractQuotedStrings(m[1])) {
        if (s.length >= 2) names.add(s);
      }
    }

    // super(['Name']) / this.cardNames
    for (const m of src.matchAll(/super\(\s*\[([^\]]+)\]/gs)) {
      for (const s of extractQuotedStrings(m[1])) {
        if (s.length >= 2) names.add(s);
      }
    }

    // YGOPRO ids
    for (const m of src.matchAll(/YGOPRO_[A-Za-z0-9_]+/g)) {
      ids.add(m[0]);
    }

    // exact name equality checks often used by traps/monsters
    for (const m of src.matchAll(
      /(?:name|trapName|cardName|monsterName|defenderName)\s*(?:===|==|\.includes\()\s*['"]([^'"]{3,80})['"]/g,
    )) {
      const s = m[1];
      // skip very generic fragments
      if (/^(attack|defense|monster|spell|trap|effect|normal|true|false)$/i.test(s)) continue;
      if (s.length < 4) continue;
      names.add(s);
    }

    // normalizeCardKey('Exact Name')
    for (const m of src.matchAll(/normalizeCardKey\(\s*['"]([^'"]{3,80})['"]\s*\)/g)) {
      names.add(m[1]);
    }
  }

  // 3) Explicit known continuous/equip hooks sometimes only named in duels.service
  const duelSvc = path.join(root, 'src/modules/duels/duels.service.ts');
  if (fs.existsSync(duelSvc)) {
    const src = fs.readFileSync(duelSvc, 'utf8');
    for (const m of src.matchAll(/['"]([A-Z][^'"]{2,70})['"]/g)) {
      // too noisy — only keep if looks like catalog-style names already partially known
      // skip
    }
  }

  return { names, ids, catalogCount: [...catalogSrc.matchAll(/name:\s*['"]/g)].length };
}

function isMaterialsOnlyFusion(description) {
  if (!description) return true;
  const d = description.replace(/\r\n/g, '\n').trim();
  // materials-only: lines of "A" + "B" (+ "C") without further effect sentences
  const withoutQuotes = d.replace(/"[^"]+"/g, 'X');
  const looksLikeFormula = /^\s*X(\s*\+\s*X)+\s*$/i.test(withoutQuotes.replace(/\n/g, ' ').trim());
  if (looksLikeFormula) return true;
  // Portuguese materials
  const pt = d.replace(/"[^"]+"/g, 'X');
  if (/^\s*X(\s*\+\s*X)+\s*$/i.test(pt.replace(/\n/g, ' ').trim())) return true;
  return false;
}

function needsEffect(card) {
  const type = card.type;
  const mt = card.monsterType;
  if (type === 'Spell' || type === 'Trap') return { need: true, reason: type.toLowerCase() };
  if (type !== 'Monster') return { need: false, reason: 'other' };
  if (mt === 'Normal') return { need: false, reason: 'normal' };
  if (mt === 'Fusion') {
    if (isMaterialsOnlyFusion(card.description)) {
      return { need: false, reason: 'fusion-materials-only' };
    }
    return { need: true, reason: 'fusion-effect' };
  }
  // Effect, Ritual, Synchro, Xyz, Pendulum, Link, or null treated as effect if description exists
  if (mt === 'Effect' || mt === 'Ritual' || mt === 'Synchro' || mt === 'Xyz' || mt === 'Pendulum' || mt === 'Link') {
    return { need: true, reason: mt.toLowerCase() };
  }
  // unknown monsterType with non-empty description → treat as needs effect
  if (card.description && String(card.description).trim().length > 0) {
    return { need: true, reason: 'monster-unknown-type' };
  }
  return { need: false, reason: 'monster-no-type' };
}

function hasRegisteredEffect(card, nameSetNorm, idSetNorm) {
  const n = normalizeCardKey(card.name);
  const c = compactCardKey(card.name);
  if (nameSetNorm.has(n) || nameSetNorm.has(c)) return true;
  if (card.idCarta) {
    const idn = normalizeCardKey(card.idCarta);
    const idc = compactCardKey(card.idCarta);
    if (idSetNorm.has(idn) || idSetNorm.has(idc)) return true;
  }
  return false;
}

async function main() {
  const { names, ids, catalogCount } = collectEffectNames();
  const nameSetNorm = new Set();
  for (const n of names) {
    nameSetNorm.add(normalizeCardKey(n));
    nameSetNorm.add(compactCardKey(n));
  }
  const idSetNorm = new Set();
  for (const id of ids) {
    idSetNorm.add(normalizeCardKey(id));
    idSetNorm.add(compactCardKey(id));
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Distinct by name among actives (skins share effect by name)
  const { rows } = await client.query(`
    SELECT DISTINCT ON (LOWER(TRIM(name)))
      name,
      description,
      type,
      "monsterType" AS "monsterType",
      "idCarta" AS "idCarta",
      archetype
    FROM cards
    WHERE "isActive" = true
    ORDER BY LOWER(TRIM(name)), "idCarta"
  `);

  await client.end();

  const missing = { spells: [], traps: [], monsters: [], other: [] };
  const have = [];
  const normals = [];
  const fusionOnly = [];
  let needCount = 0;

  for (const card of rows) {
    const { need, reason } = needsEffect(card);
    if (!need) {
      if (reason === 'normal') normals.push(card);
      if (reason === 'fusion-materials-only') fusionOnly.push(card);
      continue;
    }
    needCount++;
    if (hasRegisteredEffect(card, nameSetNorm, idSetNorm)) {
      have.push({ name: card.name, type: card.type, monsterType: card.monsterType, reason });
      continue;
    }
    const entry = {
      name: card.name,
      description: card.description,
      type: card.type,
      monsterType: card.monsterType,
      idCarta: card.idCarta,
      archetype: card.archetype,
      reason,
    };
    if (card.type === 'Spell') missing.spells.push(entry);
    else if (card.type === 'Trap') missing.traps.push(entry);
    else if (card.type === 'Monster') missing.monsters.push(entry);
    else missing.other.push(entry);
  }

  const sortByName = (a, b) => a.name.localeCompare(b.name);
  missing.spells.sort(sortByName);
  missing.traps.sort(sortByName);
  missing.monsters.sort(sortByName);

  const result = {
    generatedAt: new Date().toISOString(),
    counts: {
      activeDistinctNames: rows.length,
      normalsExcluded: normals.length,
      fusionMaterialsOnlyNoEffectNeeded: fusionOnly.length,
      needEffect: needCount,
      haveEffect: have.length,
      missingEffect:
        missing.spells.length +
        missing.traps.length +
        missing.monsters.length +
        missing.other.length,
      missingSpells: missing.spells.length,
      missingTraps: missing.traps.length,
      missingMonsters: missing.monsters.length,
      missingOther: missing.other.length,
      effectNamesIndexed: names.size,
      effectIdsIndexed: ids.size,
      catalogNameEntries: catalogCount,
    },
    fusionMaterialsOnly: fusionOnly.map((c) => ({
      name: c.name,
      type: c.type,
      monsterType: c.monsterType,
      idCarta: c.idCarta,
      description: c.description,
    })),
    missing,
    haveEffectSample: have.slice(0, 20).map((h) => h.name),
  };

  const outPath = path.join(__dirname, '_tmp-missing-effects-result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

  console.log(JSON.stringify(result.counts, null, 2));
  console.log('\n--- Missing Spells ---');
  for (const c of missing.spells) console.log(`  [Spell] ${c.name}`);
  console.log('\n--- Missing Traps ---');
  for (const c of missing.traps) console.log(`  [Trap] ${c.name}`);
  console.log('\n--- Missing Monsters ---');
  for (const c of missing.monsters) {
    console.log(`  [Monster/${c.monsterType || '?'}] ${c.name}`);
  }
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
