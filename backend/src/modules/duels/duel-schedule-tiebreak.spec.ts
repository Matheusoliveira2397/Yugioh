import { countRemainingCards, decideForcedWinner } from './duel-schedule-tiebreak';

const field = (hand = 0, deck = 0) => ({ hand: Array(hand).fill({ id: 'c' }), deck: Array(deck).fill({ id: 'd' }), monsters: [], spellTrap: [], extraDeck: [] });

describe('Duelo exclusivo — encerramento por horário de torneio', () => {
  it('prioriza pontos de vida, mesmo se o outro jogador possui mais cartas', () => {
    expect(decideForcedWinner({
      player1LifePoints: 6500, player2LifePoints: 5000,
      player1Field: field(1), player2Field: field(20),
    }, () => 0.99)).toBe(1);
  });

  it('usa quantidade de cartas restantes quando LP está empatado', () => {
    expect(decideForcedWinner({
      player1LifePoints: 4000, player2LifePoints: 4000,
      player1Field: field(2, 3), player2Field: field(2, 5),
    })).toBe(2);
  });

  it('sorteia somente após empates em LP e quantidade de cartas', () => {
    const snapshot = {
      player1LifePoints: 8000, player2LifePoints: 8000,
      player1Field: field(2, 2), player2Field: field(2, 2),
    };
    expect(decideForcedWinner(snapshot, () => 0.1)).toBe(1);
    expect(decideForcedWinner(snapshot, () => 0.9)).toBe(2);
  });

  it('conta apenas cartas existentes, não zonas vazias', () => {
    expect(countRemainingCards({ hand: [null, { id: '1' }], deck: [], monsters: [undefined], spellTrap: [], extraDeck: [] })).toBe(1);
    expect(countRemainingCards(JSON.stringify(field(1, 2)))).toBe(3);
  });
});
