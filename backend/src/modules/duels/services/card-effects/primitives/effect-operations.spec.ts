import {
 changeLifePoints, payLifePoints, drawFromDeck, sendSpellTrapToGraveyard,
 moveMonsterToGraveyard, opponentOf,
} from './effect-operations';

describe('Shared card effect primitives', () => {
 it('validates LP costs without paying partial costs', () => {
  expect(payLifePoints(2000, 800)).toBe(1200);
  expect(payLifePoints(500, 800)).toBeNull();
  expect(() => payLifePoints(1000, -1)).toThrow();
  expect(changeLifePoints(100, -900)).toBe(0);
  expect(changeLifePoints(200, 1000)).toBe(1200);
 });
 it('moves only the selected spell/trap without touching other zones', () => {
  const card = { instanceId: 'A' };
  const field = { spellTrap: [card, null], graveyard: [] as any[] };
  expect(sendSpellTrapToGraveyard(field, 0)).toBe(card);
  expect(field.spellTrap[0]).toBeNull();
  expect(field.graveyard).toEqual([card]);
  expect(sendSpellTrapToGraveyard(field, 0)).toBeNull();
  expect(field.graveyard).toHaveLength(1);
 });
 it('draws available cards without inventing copies', () => {
  const field = { deck: [{ id: 1 }, { id: 2 }], hand: [] as any[] };
  expect(drawFromDeck(field, 3)).toHaveLength(2);
  expect(field.hand).toHaveLength(2);
  expect(field.deck).toHaveLength(0);
 });
 it('moves selected monster to graveyard and keeps other monsters', () => {
  const first = { id: 'first' }, second = { id: 'second' };
  const field = { monsters: [first, second], graveyard: [] as any[] };
  expect(moveMonsterToGraveyard(field, 0)).toBe(first);
  expect(field.monsters[1]).toBe(second);
  expect(field.graveyard).toHaveLength(1);
 });
 it('identifies opponent side consistently', () => {
  expect(opponentOf('player1')).toBe('player2');
  expect(opponentOf('player2')).toBe('player1');
 });
});
