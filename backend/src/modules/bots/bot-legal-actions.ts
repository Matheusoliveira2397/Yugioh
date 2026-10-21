import { TurnPhase } from '../duels/entities/duel.entity';
import { BotActionCandidate } from './bot-action.types';
import { classifyCardEffect, conditionsMet } from './bot-effect-taxonomy';
import { canUseMonsterEffect } from './bot-monster-effects';

function keyOf(card: any): string {
  return String(card?.idCarta || card?.id || card?.cardId || card?.name || card?.cardName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
function nameOf(card: any): string {
  return String(card?.name || card?.cardName || 'carta');
}
function isSpell(card: any): boolean {
  return String(card?.type || card?.cardType || '').toLowerCase().includes('spell');
}
function isTrap(card: any): boolean {
  return String(card?.type || card?.cardType || '').toLowerCase().includes('trap');
}
function isMonster(card: any): boolean {
  return String(card?.type || card?.cardType || '').toLowerCase().includes('monster');
}
function atk(card: any): number {
  return Number(card?.atk ?? card?.attack ?? 0) || 0;
}
function freeZone(zones: any[]): number | undefined {
  const arr = Array.isArray(zones) ? zones : [];
  for (let i = 0; i < 5; i++) if (!arr[i]) return i;
  return undefined;
}
function allowsTwoAttacks(m: any): boolean {
  if (!m) return false;
  if (m.canAttackAgainThisTurn === true) return true; // BLS etc.
  const id = String(m.idCarta || m.id || m.cardId || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const name = String(m.name || m.cardName || '').toLowerCase();
  // Mataza / Cyber Twin: efeito contínuo — 2 ataques (motor usa o mesmo critério)
  if (id.includes('matazathezapper') || name.includes('mataza the zapper') || name.includes('mataza')) {
    return true;
  }
  if (
    id.includes('cybertwindragon') ||
    name.includes('cyber twin dragon') ||
    name.includes('cyber-twin dragon')
  ) {
    return true;
  }
  return false;
}

function canAttack(m: any): boolean {
  if (!m) return false;
  const pos = String(m.position || '').toLowerCase();
  if (pos !== 'attack' && !pos.includes('attack')) return false;
  if (m.cannotAttackThisTurn === true) return false;
  const attacks = Number(m.attacksThisTurn || 0);
  const max = allowsTwoAttacks(m) ? 2 : 1;
  if (m.attackedThisTurn === true && max < 2) return false;
  return attacks < max;
}

function pushAttackActions(
  out: BotActionCandidate[],
  monsters: any[],
  oppMonsters: any[],
) {
  const oppPresent = oppMonsters
    .map((t, i) => ({ t, i }))
    .filter((x) => !!x.t);
  monsters.forEach((m, attackerZoneIndex) => {
    if (!canAttack(m)) return;
    if (oppPresent.length === 0) {
      out.push(
        cand({
          actionType: 'ATTACK',
          actionData: { attackerZoneIndex, targetZoneIndex: null },
          label: `${nameOf(m)} ataca DIRETO (${atk(m)})`,
          category: 'attack',
        }),
      );
      return;
    }
    for (const { t, i: targetZoneIndex } of oppPresent) {
      out.push(
        cand({
          actionType: 'ATTACK',
          actionData: { attackerZoneIndex, targetZoneIndex },
          label: `${nameOf(m)} ataca ${nameOf(t)} (zona ${targetZoneIndex})`,
          category: 'attack',
        }),
      );
    }
  });
}

let seq = 0;
function cand(
  partial: Omit<BotActionCandidate, 'id'> & { id?: string },
): BotActionCandidate {
  seq += 1;
  return { id: partial.id || `a${seq}`, ...partial };
}

/**
 * Catálogo de ações legais (aprox.) para o LLM e o fallback heurístico.
 * Inclui magias, traps, invocações, efeitos de monstro e ataques.
 */
export function buildLegalActions(duel: any, botUserId: number): BotActionCandidate[] {
  seq = 0;
  const out: BotActionCandidate[] = [];
  const phase = duel.currentPhase as TurnPhase;
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  const opp = isP1 ? duel.player2Field : duel.player1Field;
  const hand: any[] = Array.isArray(own?.hand) ? own.hand : [];
  const monsters: any[] = Array.isArray(own?.monsters) ? own.monsters : [];
  const spellTrap: any[] = Array.isArray(own?.spellTrap) ? own.spellTrap : [];
  const oppMonsters: any[] = Array.isArray(opp?.monsters) ? opp.monsters : [];
  const oppSpellTrap: any[] = Array.isArray(opp?.spellTrap) ? opp.spellTrap : [];
  const freeM = freeZone(monsters);
  const freeS = freeZone(spellTrap);
  const gy = [...(own?.graveyard || []), ...(opp?.graveyard || [])];

  const gyMonstersCount = gy.filter(isMonster).length;
  const effectCtx = {
    oppMonsters: oppMonsters.filter(Boolean).length,
    oppSpells: oppSpellTrap.filter(Boolean).length,
    gyMonsters: gyMonstersCount,
    ownMonsters: monsters.filter(Boolean).length,
  };

  if (phase === TurnPhase.MAIN1 || phase === TurnPhase.MAIN2) {
    // Magias da mão — filtradas por condições do efeito (taxonomia), não por lista fixa
    if (freeS !== undefined) {
      for (const card of hand.filter(isSpell)) {
        const k = keyOf(card);
        // Last Will trava o bot em pending inválido — nunca oferecer
        if (k.includes('lastwill') || /last\s*will/i.test(nameOf(card))) continue;
        const profile = classifyCardEffect(card);
        if (!conditionsMet(profile, effectCtx)) continue;
        out.push(
          cand({
            actionType: 'ACTIVATE_SPELL_TRAP',
            actionData: {
              cardId: card.idCarta || card.id || card.cardId,
              cardName: nameOf(card),
              zoneIndex: freeS,
              position: 'face-up',
              spellActivatedFromField: false,
              instanceId: card.instanceId,
            },
            label: `Ativar magia ${nameOf(card)} da mão`,
            category: 'spell',
          }),
        );
      }
      for (const card of hand.filter(isTrap)) {
        out.push(
          cand({
            actionType: 'SET_SPELL_TRAP',
            actionData: {
              cardId: card.idCarta || card.id || card.cardId,
              cardName: nameOf(card),
              zoneIndex: freeS,
              position: 'set',
              instanceId: card.instanceId,
            },
            label: `Setar armadilha ${nameOf(card)}`,
            category: 'trap',
          }),
        );
      }
    }

    // Ativar spell/trap já setada no campo
    spellTrap.forEach((card, zoneIndex) => {
      if (!card || card.position !== 'set') return;
      if (isTrap(card) && phase === TurnPhase.MAIN1) {
        // traps geralmente no turno do oponente; ainda oferecemos se for spell
      }
      if (isSpell(card) || isTrap(card)) {
        out.push(
          cand({
            actionType: 'ACTIVATE_SPELL_TRAP',
            actionData: {
              cardId: card.idCarta || card.id || card.cardId,
              cardName: nameOf(card),
              zoneIndex,
              position: 'face-up',
              spellActivatedFromField: true,
              originalSpellTrapPosition: 'set',
              instanceId: card.instanceId,
            },
            label: `Ativar ${nameOf(card)} do campo (zona ${zoneIndex})`,
            category: isTrap(card) ? 'trap' : 'spell',
          }),
        );
      }
    });

    // Invocações MAIN1 (inclui tributo mesmo com campo cheio)
    if (phase === TurnPhase.MAIN1) {
      const fieldMonsters = monsters
        .map((m, i) => ({ m, i }))
        .filter((x) => !!x.m)
        .sort((a, b) => atk(a.m) - atk(b.m));
      const oppHasM = oppMonsters.some(Boolean);

      if (freeM !== undefined) {
        const cyber = hand.find((c) => keyOf(c).includes('cyberdragon') && !keyOf(c).includes('twin'));
        if (cyber && oppHasM) {
          out.push(
            cand({
              actionType: 'SPECIAL_SUMMON_CYBER_DRAGON',
              actionData: {
                cardId: cyber.idCarta || cyber.id || cyber.cardId,
                zoneIndex: freeM,
                position: 'attack',
                atk: atk(cyber),
              },
              label: `Invocação especial Cyber Dragon`,
              category: 'summon',
            }),
          );
        }
      }

      for (const card of hand.filter((c) => isMonster(c) && Number(c?.level || 0) > 0)) {
        const level = Number(card.level) || 0;
        const tributesNeeded = level >= 7 ? 2 : level >= 5 ? 1 : 0;
        if (tributesNeeded > fieldMonsters.length) continue;
        if (level <= 4 && freeM === undefined) continue;

        const tributeZoneIndices =
          tributesNeeded > 0 ? fieldMonsters.slice(0, tributesNeeded).map((x) => x.i) : undefined;
        const zoneIndex = tributesNeeded > 0 ? tributeZoneIndices![0] : freeM;
        if (zoneIndex === undefined) continue;

        if (level <= 4) {
          out.push(
            cand({
              actionType: 'SUMMON_MONSTER',
              actionData: {
                cardId: card.idCarta || card.id || card.cardId,
                zoneIndex: freeM,
                position: 'attack',
                atk: atk(card),
              },
              label: `Invocar ${nameOf(card)} em ATK (${atk(card)})`,
              category: 'summon',
            }),
          );
          out.push(
            cand({
              actionType: 'SET_MONSTER',
              actionData: {
                cardId: card.idCarta || card.id || card.cardId,
                zoneIndex: freeM,
                position: 'set',
                atk: atk(card),
              },
              label: `Setar monstro ${nameOf(card)}`,
              category: 'summon',
            }),
          );
        } else {
          out.push(
            cand({
              actionType: 'SUMMON_MONSTER',
              actionData: {
                cardId: card.idCarta || card.id || card.cardId,
                zoneIndex,
                position: 'attack',
                tributeZoneIndices,
                atk: atk(card),
              },
              label: `Invocar tributo ${nameOf(card)} (${atk(card)}) sacrificando ${tributesNeeded}`,
              category: 'summon',
            }),
          );
        }
      }

      if (freeM !== undefined) {
        for (const card of hand) {
          const k = keyOf(card);
          if (k.includes('chaossorcerer')) {
            out.push(
              cand({
                actionType: 'START_CHAOS_SORCERER_SUMMON',
                actionData: {
                  cardId: card.idCarta || card.id || card.cardId,
                  cardName: nameOf(card),
                  zoneIndex: freeM,
                  position: 'attack',
                },
                label: 'Iniciar invocação especial Chaos Sorcerer',
                category: 'summon',
              }),
            );
          }
          if (k.includes('darkarmeddragon')) {
            out.push(
              cand({
                actionType: 'START_DARK_ARMED_DRAGON_SUMMON',
                actionData: {
                  cardId: card.idCarta || card.id || card.cardId,
                  cardName: nameOf(card),
                },
                label: 'Iniciar invocação especial Dark Armed Dragon',
                category: 'summon',
              }),
            );
          }
          if (k.includes('redeyesdarknessmetaldragon') || k.includes('red-eyesdarknessmetaldragon')) {
            out.push(
              cand({
                actionType: 'START_RED_EYES_DARKNESS_METAL_DRAGON_SUMMON',
                actionData: {
                  cardId: card.idCarta || card.id || card.cardId,
                  cardName: nameOf(card),
                  zoneIndex: freeM,
                  position: 'attack',
                },
                label: 'Iniciar invocação especial REDMD',
                category: 'summon',
              }),
            );
          }
        }
      }
    }

    // Efeitos de monstro no campo (só face-up e se ainda não usou neste turno)
    const pushMonsterEffect = (
      m: any,
      monsterZoneIndex: number,
      actionType: string,
      label: string,
      extraData: Record<string, any> = {},
    ) => {
      out.push(
        cand({
          actionType,
          actionData: {
            monsterZoneIndex,
            cardId: m.idCarta || m.id || m.cardId,
            cardName: nameOf(m),
            ...extraData,
          },
          label,
          category: 'monster_effect',
        }),
      );
    };

    monsters.forEach((m, monsterZoneIndex) => {
      if (!m || (m.position !== 'attack' && m.position !== 'defense')) return;
      if (!canUseMonsterEffect(m)) return;
      const k = keyOf(m);
      const myLp = Number(isP1 ? duel.player1LifePoints : duel.player2LifePoints) || 0;
      const ownGy: any[] = Array.isArray(own?.graveyard) ? own.graveyard : [];
      const ownHand: any[] = hand;
      const oppHasFaceUp = oppMonsters.some(
        (om) => om && (om.position === 'attack' || om.position === 'defense'),
      );

      if (k.includes('chaossorcerer') && oppHasFaceUp) {
        pushMonsterEffect(m, monsterZoneIndex, 'START_CHAOS_SORCERER_EFFECT', `Efeito Chaos Sorcerer (zona ${monsterZoneIndex})`);
      }
      if (k.includes('cyberstein') && myLp >= 5000) {
        const extra = Array.isArray(own?.extraDeck) ? own.extraDeck : [];
        if (extra.length && freeM !== undefined) {
          pushMonsterEffect(m, monsterZoneIndex, 'START_CYBER_STEIN_EFFECT', `Efeito Cyber Stein (zona ${monsterZoneIndex})`);
        }
      }
      if (k.includes('darkarmeddragon')) {
        const hasDarkGy = ownGy.some((c) => {
          const attr = String(c?.attribute || c?.attr || '').toLowerCase();
          return isMonster(c) && (attr.includes('dark') || attr.includes('trevas'));
        });
        if (hasDarkGy && (oppHasFaceUp || oppSpellTrap.some(Boolean))) {
          pushMonsterEffect(m, monsterZoneIndex, 'START_DARK_ARMED_DRAGON_EFFECT', `Efeito Dark Armed Dragon (zona ${monsterZoneIndex})`);
        }
      }
      if ((k.includes('blacklustersoldier') || k.includes('envoyofthebeginning')) && oppHasFaceUp) {
        pushMonsterEffect(m, monsterZoneIndex, 'START_BLS_EFFECT', `Efeito Black Luster Soldier (zona ${monsterZoneIndex})`);
      }
      if (k.includes('exiledforce') && oppMonsters.some(Boolean)) {
        pushMonsterEffect(m, monsterZoneIndex, 'START_EXILED_FORCE_EFFECT', `Efeito Exiled Force (zona ${monsterZoneIndex})`);
      }
      if (k.includes('redeyesdarknessmetaldragon') || k.includes('red-eyesdarknessmetaldragon')) {
        const hasDragon =
          ownHand.some((c) => /dragon/i.test(String(c?.monsterType || c?.race || c?.name || ''))) ||
          ownGy.some((c) => /dragon/i.test(String(c?.monsterType || c?.race || c?.name || '')));
        if (hasDragon && freeM !== undefined) {
          pushMonsterEffect(
            m,
            monsterZoneIndex,
            'START_RED_EYES_DARKNESS_METAL_DRAGON_EFFECT',
            `Efeito REDMD (zona ${monsterZoneIndex})`,
          );
        }
      }
      if (k.includes('chaosemperordragon')) {
        pushMonsterEffect(
          m,
          monsterZoneIndex,
          'ACTIVATE_CHAOS_EMPEROR_DRAGON_EFFECT',
          `Efeito Chaos Emperor Dragon (zona ${monsterZoneIndex})`,
        );
      }
      if (k.includes('obelisk')) {
        const allies = monsters
          .map((mm, i) => ({ mm, i }))
          .filter((x) => x.mm && x.i !== monsterZoneIndex);
        if (allies.length >= 2 && oppMonsters.some(Boolean)) {
          pushMonsterEffect(m, monsterZoneIndex, 'OBELISK_EFFECT', `Efeito Obelisk sacrificando zonas ${allies[0].i},${allies[1].i}`, {
            sacrificeZoneIndices: [allies[0].i, allies[1].i],
          });
        }
      }
      // Skilled Dark Magician: 3 counters → tributa e busca Dark Magician
      if (
        (k.includes('skilleddarkmagician') || k.includes('skilleddark')) &&
        Number(m.spellCounters || 0) >= 3
      ) {
        const hasDm =
          ownHand.some((c) => /dark.?magician/i.test(nameOf(c)) && !/girl|skilled/i.test(nameOf(c))) ||
          ownGy.some((c) => /dark.?magician/i.test(nameOf(c)) && !/girl|skilled/i.test(nameOf(c))) ||
          (Array.isArray(own?.deck) ? own.deck : []).some(
            (c: any) => /dark.?magician/i.test(nameOf(c)) && !/girl|skilled/i.test(nameOf(c)),
          );
        if (hasDm) {
          pushMonsterEffect(
            m,
            monsterZoneIndex,
            'START_SKILLED_DARK_MAGICIAN_EFFECT',
            `Efeito Skilled Dark Magician (zona ${monsterZoneIndex})`,
          );
        }
      }

      // Breaker the Magical Warrior: remove counter → destroy 1 S/T (payload já com alvo)
      if (
        (k.includes('breakerthemagicalwarrior') ||
          k.includes('breakerthemagical') ||
          (k.includes('breaker') && k.includes('warrior'))) &&
        Number(m.spellCounters || 0) > 0
      ) {
        const targets = oppSpellTrap
          .map((c, i) => ({ c, i }))
          .filter((x) => !!x.c);
        // Preferir setada (possível trap); gerar 1 ação por alvo (máx 3)
        const ranked = [...targets].sort((a, b) => {
          const aSet = String(a.c.position || '') === 'set' ? 1 : 0;
          const bSet = String(b.c.position || '') === 'set' ? 1 : 0;
          return bSet - aSet;
        });
        for (const t of ranked.slice(0, 3)) {
          pushMonsterEffect(
            m,
            monsterZoneIndex,
            'BREAKER_REMOVE_COUNTER',
            `Efeito Breaker → destruir S/T oponente zona ${t.i}`,
            { targetPlayer: 'opponent', targetZoneIndex: t.i },
          );
        }
      }
    });

    // Flip manual (Snowman Eater / Morphing Jar / Fiber Jar etc.) e mudança de posição
    monsters.forEach((m, zoneIndex) => {
      if (!m) return;
      const pos = String(m.position || '').toLowerCase();
      const k = keyOf(m);
      if (pos === 'set' || pos.includes('face-down') || pos.includes('facedown')) {
        const flipUseful =
          k.includes('snowmaneater') ||
          k.includes('morphingjar') ||
          k.includes('fiberjar') ||
          k.includes('dekoichi') ||
          (k.includes('snowman') && k.includes('eater'));
        if (flipUseful) {
          out.push(
            cand({
              actionType: 'FLIP_MONSTER',
              actionData: {
                zoneIndex,
                cardId: m.idCarta || m.id || m.cardId,
                cardName: nameOf(m),
              },
              label: `Virar ${nameOf(m)} (flip)`,
              category: 'monster_effect',
            }),
          );
        }
      }
      // Mudar posição: ATK→DEF se não bate; DEF→ATK se bate
      if (pos === 'attack' || pos === 'defense') {
        if (m.positionChangedThisTurn === true) return;
        if (m.cannotChangePosition === true) return;
        const myAtk = atk(m);
        const strongestOpp = Math.max(0, ...oppMonsters.filter(Boolean).map(atk));
        if (pos === 'attack' && strongestOpp > myAtk && Number(m.def ?? m.defense ?? 0) >= myAtk) {
          out.push(
            cand({
              actionType: 'CHANGE_POSITION',
              actionData: { zoneIndex, newPosition: 'defense' },
              label: `Mudar ${nameOf(m)} para DEF`,
              category: 'monster_effect',
            }),
          );
        }
        if (pos === 'defense' && (myAtk > strongestOpp || oppMonsters.filter(Boolean).length === 0)) {
          out.push(
            cand({
              actionType: 'CHANGE_POSITION',
              actionData: { zoneIndex, newPosition: 'attack' },
              label: `Mudar ${nameOf(m)} para ATK`,
              category: 'monster_effect',
            }),
          );
        }
      }
    });

    // Ataques também na MAIN1: o gateway muda sozinho para BATTLE
    if (phase === TurnPhase.MAIN1) {
      pushAttackActions(out, monsters, oppMonsters);
      out.push(
        cand({
          actionType: 'NEXT_PHASE',
          actionData: {},
          label: 'Avançar para Battle Phase',
          category: 'phase',
        }),
      );
    } else {
      out.push(
        cand({
          actionType: 'END_TURN',
          actionData: {},
          label: 'Encerrar turno',
          category: 'phase',
        }),
      );
    }
  }

  if (phase === TurnPhase.BATTLE) {
    pushAttackActions(out, monsters, oppMonsters);
    out.push(
      cand({
        actionType: 'NEXT_PHASE',
        actionData: {},
        label: 'Sair da Battle Phase',
        category: 'phase',
      }),
    );
  }

  // Sempre preservar ataques; cortar só o restante se a lista crescer demais
  if (out.length > 50) {
    const attacks = out.filter((a) => a.category === 'attack');
    const rest = out.filter((a) => a.category !== 'attack');
    const specials = rest.filter(
      (a) => a.category === 'monster_effect' || a.category === 'spell' || a.category === 'phase' || a.category === 'trap',
    );
    const summons = rest
      .filter((a) => a.category === 'summon')
      .slice(0, 8);
    return [...attacks, ...specials, ...summons].slice(0, 55);
  }

  return out;
}

export function compactDuelState(duel: any, botUserId: number) {
  const isP1 = Number(duel.player1Id) === Number(botUserId);
  const own = isP1 ? duel.player1Field : duel.player2Field;
  const opp = isP1 ? duel.player2Field : duel.player1Field;
  const mapCard = (c: any) =>
    c
      ? {
          name: nameOf(c),
          id: c.idCarta || c.id || c.cardId,
          type: c.type || c.cardType,
          atk: c.atk ?? c.attack,
          def: c.def ?? c.defense,
          level: c.level,
          position: c.position,
        }
      : null;
  return {
    phase: duel.currentPhase,
    turnCounter: duel.turnCounter,
    myLp: isP1 ? duel.player1LifePoints : duel.player2LifePoints,
    oppLp: isP1 ? duel.player2LifePoints : duel.player1LifePoints,
    hand: (own?.hand || []).map(mapCard),
    myMonsters: (own?.monsters || []).map(mapCard),
    mySpellTrap: (own?.spellTrap || []).map(mapCard),
    oppMonsters: (opp?.monsters || []).map(mapCard),
    oppSpellTrap: (opp?.spellTrap || []).map(mapCard),
    myGraveyard: (own?.graveyard || []).slice(0, 12).map(mapCard),
    oppGraveyard: (opp?.graveyard || []).slice(0, 12).map(mapCard),
    pendingChoice: duel.pendingChoice
      ? { type: duel.pendingChoice.type, userId: duel.pendingChoice.userId }
      : null,
  };
}

export function situationKey(duel: any, botUserId: number): string {
  const s = compactDuelState(duel, botUserId);
  const handIds = (s.hand || []).map((c: any) => c?.id || c?.name).filter(Boolean).slice(0, 6).join(',');
  const board = (s.myMonsters || []).map((c: any) => c?.name || '').join('|');
  const opp = (s.oppMonsters || []).map((c: any) => c?.name || '').join('|');
  return `${s.phase}|tc${s.turnCounter}|h:${handIds}|b:${board}|o:${opp}`;
}
