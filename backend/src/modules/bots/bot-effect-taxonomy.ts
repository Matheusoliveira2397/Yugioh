/**
 * Taxonomia de efeitos reutilizável.
 * Classifica qualquer carta por papéis (roles) — a IA avalia ações legais
 * com base nesses papéis, não em ifs por carta popular.
 */

export type EffectRole =
  | 'draw'
  | 'search'
  | 'revive'
  | 'board_wipe_monster'
  | 'board_wipe_spell'
  | 'target_destroy_monster'
  | 'target_destroy_spell'
  | 'steal'
  | 'burn'
  | 'equip_boost'
  | 'protection'
  | 'summon_extra'
  | 'hand_disruption'
  | 'discard_draw'
  | 'special_summon'
  | 'banish_remove'
  | 'field_control'
  | 'generic_spell'
  | 'generic_trap'
  | 'beatstick'
  | 'utility_monster';

export type EffectTiming = 'ignition' | 'quick' | 'trigger' | 'continuous' | 'activation' | 'summon';

export interface EffectProfile {
  roles: EffectRole[];
  timing: EffectTiming;
  requiresOppMonster?: boolean;
  requiresOppSpell?: boolean;
  requiresGyMonster?: boolean;
  requiresOwnMonster?: boolean;
  /** Valor intrínseco relativo (0–100) quando condições são satisfeitas. */
  baseValue: number;
  /** Tags de sinergia (archetype / recurso). */
  comboTags: string[];
  /** Custo aproximado em cards/LP (para preservação de recursos). */
  resourceCost?: number;
}

function norm(s: any): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function blobOf(card: any): string {
  return [
    card?.idCarta,
    card?.id,
    card?.cardId,
    card?.name,
    card?.cardName,
    card?.description,
    card?.effect,
    card?.cardText,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
}

/** Registro explícito de cartas com efeito implementado no motor. */
const KNOWN: Record<string, EffectProfile> = {
  potofgreed: { roles: ['draw'], timing: 'activation', baseValue: 92, comboTags: ['draw'], resourceCost: 1 },
  upstartgoblin: { roles: ['draw'], timing: 'activation', baseValue: 78, comboTags: ['draw'], resourceCost: 1 },
  jarofgreed: { roles: ['draw'], timing: 'trigger', baseValue: 70, comboTags: ['draw'], resourceCost: 1 },
  gracefulcharity: { roles: ['discard_draw', 'draw'], timing: 'activation', baseValue: 88, comboTags: ['draw', 'gy_setup'], resourceCost: 1 },
  reload: { roles: ['discard_draw'], timing: 'activation', baseValue: 55, comboTags: ['draw'], resourceCost: 1 },
  carddestruction: { roles: ['discard_draw'], timing: 'activation', baseValue: 60, comboTags: ['draw', 'gy_setup'], resourceCost: 1 },
  raigeki: { roles: ['board_wipe_monster'], timing: 'activation', requiresOppMonster: true, baseValue: 95, comboTags: ['removal'], resourceCost: 1 },
  darkhole: { roles: ['board_wipe_monster'], timing: 'activation', requiresOppMonster: true, baseValue: 80, comboTags: ['removal'], resourceCost: 1 },
  lightningstorm: { roles: ['board_wipe_monster', 'board_wipe_spell'], timing: 'activation', baseValue: 90, comboTags: ['removal'], resourceCost: 1 },
  heavystorm: { roles: ['board_wipe_spell'], timing: 'activation', requiresOppSpell: true, baseValue: 85, comboTags: ['backrow'], resourceCost: 1 },
  harpiesfeatherduster: { roles: ['board_wipe_spell'], timing: 'activation', requiresOppSpell: true, baseValue: 92, comboTags: ['backrow'], resourceCost: 1 },
  gianttrunade: { roles: ['board_wipe_spell', 'field_control'], timing: 'activation', baseValue: 72, comboTags: ['backrow'], resourceCost: 1 },
  mysticalspacetyphoon: { roles: ['target_destroy_spell'], timing: 'quick', requiresOppSpell: true, baseValue: 75, comboTags: ['backrow'], resourceCost: 1 },
  mst: { roles: ['target_destroy_spell'], timing: 'quick', requiresOppSpell: true, baseValue: 75, comboTags: ['backrow'], resourceCost: 1 },
  cosmiccyclone: { roles: ['target_destroy_spell'], timing: 'quick', requiresOppSpell: true, baseValue: 78, comboTags: ['backrow'], resourceCost: 1 },
  fissure: { roles: ['target_destroy_monster'], timing: 'activation', requiresOppMonster: true, baseValue: 68, comboTags: ['removal'], resourceCost: 1 },
  smashingground: { roles: ['target_destroy_monster'], timing: 'activation', requiresOppMonster: true, baseValue: 72, comboTags: ['removal'], resourceCost: 1 },
  hammershot: { roles: ['target_destroy_monster'], timing: 'activation', requiresOppMonster: true, baseValue: 70, comboTags: ['removal'], resourceCost: 1 },
  soultaker: { roles: ['target_destroy_monster'], timing: 'activation', requiresOppMonster: true, baseValue: 74, comboTags: ['removal'], resourceCost: 1 },
  tributetothedoomed: { roles: ['target_destroy_monster'], timing: 'activation', requiresOppMonster: true, baseValue: 70, comboTags: ['removal'], resourceCost: 1 },
  changeofheart: { roles: ['steal'], timing: 'activation', requiresOppMonster: true, baseValue: 96, comboTags: ['steal', 'removal'], resourceCost: 1 },
  braincontrol: { roles: ['steal'], timing: 'activation', requiresOppMonster: true, baseValue: 90, comboTags: ['steal'], resourceCost: 1 },
  monsterreborn: { roles: ['revive', 'special_summon'], timing: 'activation', requiresGyMonster: true, baseValue: 90, comboTags: ['revive'], resourceCost: 1 },
  prematureburial: { roles: ['revive', 'special_summon'], timing: 'activation', requiresGyMonster: true, baseValue: 82, comboTags: ['revive'], resourceCost: 1 },
  autonomousactionunit: { roles: ['revive', 'special_summon'], timing: 'activation', requiresGyMonster: true, baseValue: 78, comboTags: ['revive'], resourceCost: 1 },
  callofthehaunted: { roles: ['revive', 'special_summon'], timing: 'trigger', requiresGyMonster: true, baseValue: 80, comboTags: ['revive'], resourceCost: 1 },
  monsterreincarnation: { roles: ['revive', 'search'], timing: 'activation', requiresGyMonster: true, baseValue: 65, comboTags: ['revive'], resourceCost: 1 },
  reinforcementofthearmy: { roles: ['search'], timing: 'activation', baseValue: 85, comboTags: ['search', 'warrior'], resourceCost: 1 },
  rota: { roles: ['search'], timing: 'activation', baseValue: 85, comboTags: ['search', 'warrior'], resourceCost: 1 },
  unitedwestand: { roles: ['equip_boost'], timing: 'activation', requiresOwnMonster: true, baseValue: 70, comboTags: ['equip'], resourceCost: 1 },
  magepower: { roles: ['equip_boost'], timing: 'activation', requiresOwnMonster: true, baseValue: 68, comboTags: ['equip'], resourceCost: 1 },
  axeofdespair: { roles: ['equip_boost'], timing: 'activation', requiresOwnMonster: true, baseValue: 65, comboTags: ['equip'], resourceCost: 1 },
  megamorph: { roles: ['equip_boost'], timing: 'activation', requiresOwnMonster: true, baseValue: 60, comboTags: ['equip'], resourceCost: 1 },
  swordsofrevealinglight: { roles: ['protection', 'field_control'], timing: 'continuous', baseValue: 72, comboTags: ['stall'], resourceCost: 1 },
  waboku: { roles: ['protection'], timing: 'trigger', baseValue: 68, comboTags: ['stall'], resourceCost: 1 },
  scrapironscarecrow: { roles: ['protection'], timing: 'trigger', baseValue: 60, comboTags: ['stall'], resourceCost: 1 },
  mirrorforce: { roles: ['board_wipe_monster', 'protection'], timing: 'trigger', requiresOppMonster: true, baseValue: 88, comboTags: ['removal', 'battle'], resourceCost: 1 },
  sakuretsuarmor: { roles: ['target_destroy_monster', 'protection'], timing: 'trigger', requiresOppMonster: true, baseValue: 75, comboTags: ['removal', 'battle'], resourceCost: 1 },
  bottomlesstraphole: { roles: ['banish_remove', 'protection'], timing: 'trigger', baseValue: 82, comboTags: ['removal'], resourceCost: 1 },
  traphole: { roles: ['target_destroy_monster', 'protection'], timing: 'trigger', baseValue: 70, comboTags: ['removal'], resourceCost: 1 },
  dropoff: { roles: ['hand_disruption'], timing: 'trigger', baseValue: 62, comboTags: ['hand'], resourceCost: 1 },
  confiscation: { roles: ['hand_disruption'], timing: 'activation', baseValue: 78, comboTags: ['hand'], resourceCost: 1 },
  theforcefulsentry: { roles: ['hand_disruption'], timing: 'activation', baseValue: 80, comboTags: ['hand'], resourceCost: 1 },
  forcefulsentry: { roles: ['hand_disruption'], timing: 'activation', baseValue: 80, comboTags: ['hand'], resourceCost: 1 },
  hinotama: { roles: ['burn'], timing: 'activation', baseValue: 40, comboTags: ['burn'], resourceCost: 1 },
  ookazi: { roles: ['burn'], timing: 'activation', baseValue: 45, comboTags: ['burn'], resourceCost: 1 },
  finalflame: { roles: ['burn'], timing: 'activation', baseValue: 42, comboTags: ['burn'], resourceCost: 1 },
  sparks: { roles: ['burn'], timing: 'activation', baseValue: 35, comboTags: ['burn'], resourceCost: 1 },
  doublesummon: { roles: ['summon_extra'], timing: 'activation', baseValue: 70, comboTags: ['summon'], resourceCost: 1 },
  lastwill: { roles: ['special_summon'], timing: 'activation', baseValue: 45, comboTags: ['summon'], resourceCost: 1 },
  cyberdragon: { roles: ['special_summon', 'beatstick'], timing: 'summon', baseValue: 80, comboTags: ['machine', 'special'], resourceCost: 0 },
  chaossorcerer: { roles: ['banish_remove', 'special_summon', 'beatstick'], timing: 'ignition', requiresOppMonster: true, baseValue: 88, comboTags: ['chaos', 'removal'], resourceCost: 0 },
  darkarmeddragon: { roles: ['target_destroy_monster', 'special_summon', 'beatstick'], timing: 'ignition', requiresOppMonster: true, baseValue: 94, comboTags: ['dark', 'removal'], resourceCost: 0 },
  blacklustersoldierenvoyofthebeginning: {
    roles: ['banish_remove', 'special_summon', 'beatstick'],
    timing: 'ignition',
    requiresOppMonster: true,
    baseValue: 93,
    comboTags: ['chaos', 'removal'],
    resourceCost: 0,
  },
  exiledforce: { roles: ['target_destroy_monster'], timing: 'ignition', requiresOppMonster: true, baseValue: 72, comboTags: ['removal'], resourceCost: 1 },
  redeyesdarknessmetaldragon: {
    roles: ['special_summon', 'revive', 'beatstick'],
    timing: 'ignition',
    baseValue: 90,
    comboTags: ['dragon', 'revive'],
    resourceCost: 0,
  },
  chaosemperordragon: {
    roles: ['board_wipe_monster', 'board_wipe_spell', 'special_summon'],
    timing: 'ignition',
    baseValue: 96,
    comboTags: ['chaos', 'removal'],
    resourceCost: 1,
  },
  obeliskthetormentor: { roles: ['board_wipe_monster', 'beatstick'], timing: 'ignition', requiresOppMonster: true, baseValue: 95, comboTags: ['god', 'removal'], resourceCost: 2 },
  cyberstein: { roles: ['special_summon'], timing: 'ignition', baseValue: 85, comboTags: ['fusion', 'special'], resourceCost: 1 },
  ringofdestruction: { roles: ['target_destroy_monster', 'burn'], timing: 'quick', requiresOppMonster: true, baseValue: 86, comboTags: ['removal', 'burn'], resourceCost: 1 },
  breakerthemagicalwarrior: {
    roles: ['target_destroy_spell', 'beatstick'],
    timing: 'ignition',
    requiresOppSpell: true,
    baseValue: 78,
    comboTags: ['backrow', 'removal'],
    resourceCost: 0,
  },
  breaker: {
    roles: ['target_destroy_spell', 'beatstick'],
    timing: 'ignition',
    requiresOppSpell: true,
    baseValue: 78,
    comboTags: ['backrow', 'removal'],
    resourceCost: 0,
  },
  skilleddarkmagician: {
    roles: ['special_summon', 'search'],
    timing: 'ignition',
    baseValue: 88,
    comboTags: ['dark_magician', 'summon'],
    resourceCost: 1,
  },
  snowmaneater: {
    roles: ['target_destroy_monster'],
    timing: 'trigger',
    requiresOppMonster: true,
    baseValue: 72,
    comboTags: ['removal', 'flip'],
    resourceCost: 0,
  },
};

const ROLE_FROM_DESC: Array<{ re: RegExp; roles: EffectRole[]; baseValue: number; tags?: string[] }> = [
  { re: /draw\s+\d+\s+card|buy\s+\d+|compre\s+\d+|compra\s+\d+/i, roles: ['draw'], baseValue: 75, tags: ['draw'] },
  { re: /add\s+.{0,40}from\s+your\s+deck|procure|busque|search.{0,20}deck/i, roles: ['search'], baseValue: 80, tags: ['search'] },
  { re: /special\s+summon.{0,40}graveyard|from\s+(?:either\s+)?graveyard|reviva|do\s+cemit[eé]rio/i, roles: ['revive', 'special_summon'], baseValue: 82, tags: ['revive'] },
  { re: /destroy\s+all\s+monsters|destrua\s+todos\s+os\s+monstros/i, roles: ['board_wipe_monster'], baseValue: 90, tags: ['removal'] },
  { re: /destroy\s+all\s+(?:spell|trap)|destrua\s+todas/i, roles: ['board_wipe_spell'], baseValue: 88, tags: ['backrow'] },
  { re: /destroy\s+(?:1|one|target).{0,30}monster|destrua\s+.{0,20}monstro/i, roles: ['target_destroy_monster'], baseValue: 70, tags: ['removal'] },
  { re: /destroy\s+(?:1|one|target).{0,30}(?:spell|trap)|destrua\s+.{0,20}(?:magia|armadilha)/i, roles: ['target_destroy_spell'], baseValue: 72, tags: ['backrow'] },
  { re: /take\s+control|gain\s+control|controle|change\s+of\s+heart/i, roles: ['steal'], baseValue: 90, tags: ['steal'] },
  { re: /inflict.{0,20}damage|cause\s+\d+|cause\s+dano|burn/i, roles: ['burn'], baseValue: 40, tags: ['burn'] },
  { re: /equip\s+only|increase.{0,15}atk|aumenta.{0,15}atk|\+\d+\s*atk/i, roles: ['equip_boost'], baseValue: 60, tags: ['equip'] },
  { re: /cannot\s+be\s+destroyed|negat(?:e|ion)|cannot\s+attack|n[aã]o\s+pode\s+atacar|waboku/i, roles: ['protection'], baseValue: 65, tags: ['stall'] },
  { re: /banish|banir|remove\s+from\s+play/i, roles: ['banish_remove'], baseValue: 78, tags: ['removal'] },
  { re: /look\s+at.{0,20}hand|discard.{0,20}hand|descart/i, roles: ['hand_disruption'], baseValue: 70, tags: ['hand'] },
  { re: /you\s+can\s+normal\s+summon|double\s+summon|invoca[cç][aã]o\s+adicional/i, roles: ['summon_extra'], baseValue: 68, tags: ['summon'] },
  { re: /special\s+summon/i, roles: ['special_summon'], baseValue: 70, tags: ['special'] },
];

function lookupKnown(card: any): EffectProfile | null {
  const keys = [norm(card?.idCarta), norm(card?.id), norm(card?.cardId), norm(card?.name), norm(card?.cardName)].filter(
    Boolean,
  );
  for (const k of keys) {
    if (KNOWN[k]) return { ...KNOWN[k], roles: [...KNOWN[k].roles], comboTags: [...KNOWN[k].comboTags] };
    for (const [id, profile] of Object.entries(KNOWN)) {
      if (k.includes(id) || id.includes(k)) {
        return { ...profile, roles: [...profile.roles], comboTags: [...profile.comboTags] };
      }
    }
  }
  return null;
}

function fromDescription(card: any): EffectProfile | null {
  const text = blobOf(card);
  if (!text || text.length < 8) return null;
  const roles = new Set<EffectRole>();
  let baseValue = 35;
  const comboTags = new Set<string>();
  for (const rule of ROLE_FROM_DESC) {
    if (rule.re.test(text)) {
      rule.roles.forEach((r) => roles.add(r));
      baseValue = Math.max(baseValue, rule.baseValue);
      (rule.tags || []).forEach((t) => comboTags.add(t));
    }
  }
  if (!roles.size) return null;
  const isTrap = String(card?.type || card?.cardType || '').toLowerCase().includes('trap');
  return {
    roles: [...roles],
    timing: isTrap ? 'trigger' : roles.has('equip_boost') ? 'continuous' : 'activation',
    requiresOppMonster: roles.has('board_wipe_monster') || roles.has('target_destroy_monster') || roles.has('steal'),
    requiresOppSpell: roles.has('board_wipe_spell') || roles.has('target_destroy_spell'),
    requiresGyMonster: roles.has('revive'),
    requiresOwnMonster: roles.has('equip_boost'),
    baseValue,
    comboTags: [...comboTags],
    resourceCost: 1,
  };
}

function fallbackProfile(card: any): EffectProfile {
  const type = String(card?.type || card?.cardType || '').toLowerCase();
  const atk = Number(card?.atk ?? card?.attack ?? 0) || 0;
  if (type.includes('monster')) {
    return {
      roles: atk >= 1800 ? ['beatstick'] : ['utility_monster'],
      timing: 'summon',
      baseValue: Math.min(90, 20 + atk / 40),
      comboTags: [],
      resourceCost: 0,
    };
  }
  if (type.includes('trap')) {
    return { roles: ['generic_trap'], timing: 'trigger', baseValue: 45, comboTags: [], resourceCost: 1 };
  }
  return { roles: ['generic_spell'], timing: 'activation', baseValue: 40, comboTags: [], resourceCost: 1 };
}

/** Perfil de efeito para qualquer carta do banco. */
export function classifyCardEffect(card: any): EffectProfile {
  return lookupKnown(card) || fromDescription(card) || fallbackProfile(card);
}

export function hasRole(profile: EffectProfile, role: EffectRole): boolean {
  return profile.roles.includes(role);
}

export function conditionsMet(
  profile: EffectProfile,
  ctx: {
    oppMonsters: number;
    oppSpells: number;
    gyMonsters: number;
    ownMonsters: number;
  },
): boolean {
  if (profile.requiresOppMonster && ctx.oppMonsters <= 0) return false;
  if (profile.requiresOppSpell && ctx.oppSpells <= 0) return false;
  if (profile.requiresGyMonster && ctx.gyMonsters <= 0) return false;
  if (profile.requiresOwnMonster && ctx.ownMonsters <= 0) return false;
  return true;
}

/**
 * Classifica somente informações públicas do campo adversário.
 * Cartas setadas não expõem identidade nem texto para a IA.
 */
export function evaluatePublicMonsterThreat(card: any): number {
  if (!card) return 0;
  const position = String(card.position || '').toLowerCase();
  if (position === 'set' || position.includes('face-down') || position.includes('facedown')) {
    return 100; // possível flip, sem consultar atributos escondidos
  }
  const profile = classifyCardEffect(card);
  const atk = Math.max(0, Number(card.atk ?? card.attack ?? 0) || 0);
  const def = Math.max(0, Number(card.def ?? card.defense ?? 0) || 0);
  let threat = Math.max(0, atk - 1400) / 20;
  if (position.includes('defen')) threat = Math.max(0, def - 1800) / 35;
  if (profile.roles.some((r) => ['target_destroy_monster', 'banish_remove', 'steal', 'board_wipe_monster'].includes(r))) threat += 90;
  if (profile.roles.some((r) => ['special_summon', 'revive', 'search', 'draw'].includes(r))) threat += 60;
  if (profile.roles.includes('protection')) threat += 35;
  if (card.cannotBeDestroyedByBattle === true || card.indestructible === true) threat += 45;
  return Math.min(300, threat);
}

/** Valor situacional do efeito (0–~150). */
export function situationalEffectValue(
  profile: EffectProfile,
  ctx: {
    oppMonsters: number;
    oppSpells: number;
    gyMonsters: number;
    ownMonsters: number;
    oppLp: number;
    myLp: number;
    oppAtkSum: number;
    bestGyAtk: number;
  },
): number {
  if (!conditionsMet(profile, ctx)) return -60;

  let v = profile.baseValue;
  if (hasRole(profile, 'board_wipe_monster')) v += Math.min(40, ctx.oppAtkSum / 40 + ctx.oppMonsters * 8);
  if (hasRole(profile, 'board_wipe_spell')) v += ctx.oppSpells * 15;
  if (hasRole(profile, 'target_destroy_monster') || hasRole(profile, 'banish_remove')) {
    v += Math.min(35, ctx.oppAtkSum / 50);
  }
  if (hasRole(profile, 'steal')) v += Math.min(40, ctx.oppAtkSum / 45);
  if (hasRole(profile, 'revive')) v += Math.min(35, ctx.bestGyAtk / 50);
  if (hasRole(profile, 'draw') || hasRole(profile, 'search') || hasRole(profile, 'discard_draw')) {
    v += 8;
  }
  if (hasRole(profile, 'burn') && ctx.oppLp <= 1000) v += 70;
  else if (hasRole(profile, 'burn') && ctx.oppLp <= 2000) v += 25;
  if (hasRole(profile, 'protection') && (ctx.myLp < 2500 || ctx.oppAtkSum > ctx.myLp)) v += 30;
  if (hasRole(profile, 'equip_boost')) v += Math.min(20, ctx.ownMonsters * 8);
  if (hasRole(profile, 'hand_disruption')) v += 10;
  if (hasRole(profile, 'summon_extra')) v += 5;
  return v;
}

export function listKnownEffectCards(): string[] {
  return Object.keys(KNOWN);
}
