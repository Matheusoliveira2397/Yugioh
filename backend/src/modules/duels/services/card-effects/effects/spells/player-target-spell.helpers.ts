/**
 * Helpers puros para spells que exigem escolha do duelista (sem depender do DuelsService).
 */

export const isFaceUpMonster = (m: any): boolean =>
  m && m !== null && (m.position === 'attack' || m.position === 'defense');

export const isDefensePositionMonster = (m: any): boolean =>
  m && m !== null && (m.position === 'defense' || m.position === 'set');

export const isNormalMonsterCard = (c: any): boolean => {
  if (!c) return false;
  const t = c.type || c.cardType;
  if (String(t) !== 'Monster' && String(t) !== 'MONSTER') return false;
  const mt = c.monsterType || c.monster_type;
  return String(mt).toLowerCase() === 'normal';
};

export const fieldHasDragonMonster = (field: any): boolean => {
  if (!field?.monsters) return false;
  for (const m of field.monsters) {
    if (!m) continue;
    const race = String(m.race || '').toLowerCase();
    if (race.includes('dragon')) return true;
  }
  return false;
};

export function findFirstEmptyMonsterZone(monsters: any[] | undefined): number {
  if (!monsters || !Array.isArray(monsters)) return -1;
  for (let i = 0; i < 5; i++) {
    if (monsters[i] === null || monsters[i] === undefined) return i;
  }
  return -1;
}

/** Índices de zonas do oponente com face-up e ATK mínimo (empate em ATK mínimo). */
export function findFissureTiedZoneIndices(opponentField: any): number[] {
  if (!opponentField?.monsters) return [];
  let bestAtk = Number.POSITIVE_INFINITY;
  for (let i = 0; i < opponentField.monsters.length; i++) {
    const m = opponentField.monsters[i];
    if (!isFaceUpMonster(m)) continue;
    const atk = Number(m.atk ?? m.ATK ?? 0);
    if (atk < bestAtk) bestAtk = atk;
  }
  if (!Number.isFinite(bestAtk)) return [];
  const out: number[] = [];
  for (let i = 0; i < opponentField.monsters.length; i++) {
    const m = opponentField.monsters[i];
    if (!isFaceUpMonster(m)) continue;
    const atk = Number(m.atk ?? m.ATK ?? 0);
    if (atk === bestAtk) out.push(i);
  }
  return out;
}

export function collectSpellTrapTargetsBothSides(
  playerField: any,
  opponentField: any,
): Array<{ zoneIndex: number; isOpponent: boolean; card: any }> {
  const out: Array<{ zoneIndex: number; isOpponent: boolean; card: any }> = [];
  const scan = (field: any, isOpponent: boolean) => {
    if (!field?.spellTrap || !Array.isArray(field.spellTrap)) return;
    for (let i = 0; i < field.spellTrap.length; i++) {
      const c = field.spellTrap[i];
      if (c !== null && c !== undefined) {
        out.push({ zoneIndex: i, isOpponent, card: c });
      }
    }
  };
  scan(playerField, false);
  scan(opponentField, true);
  return out;
}

export function collectDefenseMonstersBothSides(
  playerField: any,
  opponentField: any,
): Array<{ zoneIndex: number; isOpponent: boolean; monster: any }> {
  const out: Array<{ zoneIndex: number; isOpponent: boolean; monster: any }> = [];
  const scan = (field: any, isOpponent: boolean) => {
    if (!field?.monsters) return;
    for (let i = 0; i < field.monsters.length; i++) {
      const m = field.monsters[i];
      if (isDefensePositionMonster(m)) {
        out.push({ zoneIndex: i, isOpponent, monster: m });
      }
    }
  };
  scan(opponentField, true);
  scan(playerField, false);
  return out;
}

export function listEmptyMonsterZones(monsters: any[] | undefined): number[] {
  if (!monsters || !Array.isArray(monsters)) return [];
  const z: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (monsters[i] === null || monsters[i] === undefined) z.push(i);
  }
  return z;
}

export function matchesPlayerTargetSpellCard(card: any, key: string): boolean {
  const name = (card?.name || card?.cardName || '').toLowerCase();
  const id = String(card?.idCarta || card?.id || card?.cardId || '').toLowerCase();
  switch (key) {
    case 'LIGHTNING_VORTEX':
      return name.includes('lightning vortex') || id.includes('lightningvortex') || id.includes('ygopro_69162969');
    case 'TRADE_IN':
      return name.includes('trade-in') || name.includes('trade in') || id.includes('tradein') || id.includes('ygopro_38120068');
    case 'DARK_ERUPTION':
      return name.includes('dark eruption') || id.includes('darkeruption') || id.includes('ygopro_674561');
    case 'STAMPING_DESTRUCTION':
      return name.includes('stamping destruction') || id.includes('stampingdestruction') || id.includes('ygopro_81385346');
    case 'TRIBUTE_TO_THE_DOOMED':
      return name.includes('tribute to the doomed') || id.includes('tributetothedoomed') || id.includes('ygopro_79759861');
    case 'ANCIENT_RULES':
      return name.includes('ancient rules') || id.includes('ancientrules') || id.includes('ygopro_10667321');
    case 'SILVERS_CRY':
      return (
        name.includes("silver's cry") ||
        name.includes('silvers cry') ||
        id.includes('silverscry') ||
        id.includes('ygopro_87025064')
      );
    case 'SHIELD_CRUSH':
      return name.includes('shield crush') || id.includes('shieldcrush') || id.includes('ygopro_30683373');
    case 'FISSURE':
      return name.includes('fissure') || id.includes('ygopro_66788016');
    case 'RING_OF_DESTRUCTION':
      return (
        name.includes('ring of destruction') ||
        id.includes('ringofdestruction') ||
        id.includes('ygopro_83555666') ||
        id.includes('83555666')
      );
    case 'THOUSAND_KNIVES':
      return (
        name.includes('thousand knives') ||
        name.includes('mil facas') ||
        id.includes('thousandknives') ||
        id.includes('ygopro_63356666') ||
        id.includes('63356666') ||
        id.includes('ygopro_63356631') ||
        id.includes('63356631')
      );
    case 'DE_SPELL':
      return name.includes('de-spell') || name.includes('de spell') || id.includes('despell') || id.includes('ygopro_19159413') || id.includes('19159413');
    case 'MAGICAL_DIMENSION':
      return name.includes('magical dimension') || id.includes('magicaldimension') || id.includes('ygopro_28553439') || id.includes('28553439');
    case 'MAJESTY_WITH_EYES_OF_BLUE':
      return name.includes('majesty with eyes of blue') || id.includes('majestywitheyesofblue') || id.includes('ygopro_2783661') || id.includes('2783661');
    case 'MYSTIC_BOX':
      return name.includes('mystic box') || id.includes('mysticbox') || id.includes('ygopro_25774450') || id.includes('25774450');
    default:
      return false;
  }
}

/** Controla face-up Dark Magician (não Girl / Chaos). */
export function fieldControlsDarkMagician(field: any): boolean {
  if (!field?.monsters) return false;
  for (const m of field.monsters) {
    if (!m) continue;
    const p = String(m.position || '').toLowerCase();
    if (p !== 'attack' && p !== 'defense' && p !== 'face-up') continue;
    const name = (m.name || m.cardName || '').toLowerCase().trim();
    const id = String(m.idCarta || m.id || m.cardId || '').toLowerCase();
    const nameCompact = name.replace(/[^a-z0-9]/g, '');
    if (nameCompact.includes('darkmagiciangirl') || nameCompact.includes('pequenamaganegra')) continue;
    if (nameCompact.includes('ofchaos') || nameCompact.includes('docaos')) continue;
    if (
      name === 'dark magician' ||
      name === 'mago negro' ||
      nameCompact === 'darkmagician' ||
      nameCompact === 'magonegro' ||
      id.includes('46986414') ||
      id === 'darkmagician'
    ) {
      return true;
    }
  }
  return false;
}

export function detectPlayerTargetSpellKind(card: any, duel: any, isPlayer1: boolean): string | null {
  if (!card || !duel) return null;
  const keys = [
    'LIGHTNING_VORTEX',
    'TRADE_IN',
    'DARK_ERUPTION',
    'STAMPING_DESTRUCTION',
    'TRIBUTE_TO_THE_DOOMED',
    'ANCIENT_RULES',
    'SILVERS_CRY',
    'SHIELD_CRUSH',
    'FISSURE',
    'RING_OF_DESTRUCTION',
    'THOUSAND_KNIVES',
    'DE_SPELL',
    'MAGICAL_DIMENSION',
    'MAJESTY_WITH_EYES_OF_BLUE',
    'MYSTIC_BOX',
  ] as const;
  for (const k of keys) {
    if (!matchesPlayerTargetSpellCard(card, k)) continue;
    if (k === 'FISSURE') {
      const opponentField = isPlayer1 ? (duel as any).player2Field : (duel as any).player1Field;
      const tied = findFissureTiedZoneIndices(opponentField);
      return tied.length > 1 ? 'FISSURE_CHOOSE' : null;
    }
    return k;
  }
  return null;
}
