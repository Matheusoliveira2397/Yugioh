/** Monstros face-up (atk/def) válidos como alvo de Equip (exc. Obelisk) — alinhado ao backend. */
export function countMonstersEligibleForEquipSpell(monsters: (any | null | undefined)[] | undefined): number {
  if (!Array.isArray(monsters)) return 0;
  let n = 0;
  for (const m of monsters) {
    if (m == null) continue;
    const pos = m.position || 'attack';
    if (pos !== 'attack' && pos !== 'defense') continue;
    const nm = (m.name || m.cardName || '').toLowerCase();
    const id = String(m.idCarta || m.id || m.cardId || '').toLowerCase();
    if (/obelisk\s*the\s*tormentor/.test(nm) || id.includes('obeliskthetormentor')) continue;
    n++;
  }
  return n;
}

export function isSpellEquipCard(card: any): boolean {
  if (!card) return false;
  const t = (card.type || card.cardType || '').toString();
  if (t !== 'Spell') return false;
  const st = (card.spellType || '').toString().toLowerCase();
  if (st === 'equip') return true;
  const cn = (card.name || card.cardName || '').toLowerCase();
  const cid = String(card.idCarta || card.id || card.cardId || '').toLowerCase();
  return (
    cid.includes('unitedwestand') ||
    cn.includes('united we stand') ||
    cid.includes('magepower') ||
    cn.includes('mage power')
  );
}
