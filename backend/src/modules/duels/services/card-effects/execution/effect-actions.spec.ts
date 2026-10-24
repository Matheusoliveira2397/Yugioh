import { EffectExecutor } from './effect-executor';
import { CardEffectRegistryService } from '../registry/card-effect-registry.service';
import { CardEffectsService } from '../../card-effects.service';
import { PLAYER_EFFECT_ACTIONS } from '../actions/catalog';
import { exactCardMatch } from '../utils/card-key.util';

const emptyField = () => ({ monsters: Array(5).fill(null), spellTrap: Array(5).fill(null), hand: [], deck: [], graveyard: [] });

describe('effect actions through the common executor', () => {
  let host: any;
  let duel: any;
  let facade: CardEffectsService;
  beforeEach(() => {
    duel = { player1Id: 1, player2Id: 2, currentTurn: 1, currentPhase: 'MAIN1', turnCounter: 1,
      player1Field: emptyField(), player2Field: emptyField() };
    host = {
      findDuelByIdFromDatabase: jest.fn().mockResolvedValue(duel),
      updateDuelInDatabase: jest.fn(), setPendingChoice: jest.fn(),
      isObeliskTheTormentor: () => false, isJinzoOnField: () => false,
      isMirageDragonBlockingTraps: () => false,
      isExactCard: (card: any, name: string) => exactCardMatch(card, [name], [name]),
    };
    facade = new CardEffectsService(new EffectExecutor(new CardEffectRegistryService(host, {} as any)));
  });

  it.each([...PLAYER_EFFECT_ACTIONS])('rejects an outsider before %s can change a duel', async name => {
    const before = JSON.stringify(duel);
    const result = await facade.executeAction(name, host, ['1', 999] as any);
    expect(result).toEqual({ success: false, message: 'Jogador não participa deste duelo' });
    expect(JSON.stringify(duel)).toBe(before);
    expect(host.updateDuelInDatabase).not.toHaveBeenCalled();
  });

  it('rejects an illegal face-down target without destroying it', async () => {
    const target = { name: 'Hidden', position: 'set' };
    duel.player2Field.monsters[1] = target;
    const result = await facade.executeAction('processSnowmanEaterChoice', host, ['1', 1, 'opponent', 1, 0]);
    expect(result.success).toBe(false);
    expect(duel.player2Field.monsters[1]).toBe(target);
    expect(host.updateDuelInDatabase).not.toHaveBeenCalled();
  });

  it('does not activate Trap Hole while Jinzo blocks traps', async () => {
    host.isJinzoOnField = () => true;
    const result = await facade.executeAction('checkAndActivateTrapHole', host,
      ['1', duel, true, 0, { name: 'Monster', atk: 2000 }]);
    expect(result).toBe(false);
    expect(host.updateDuelInDatabase).not.toHaveBeenCalled();
  });

  it('does not open a normal-summon trigger for a face-down Magician’s Rod', async () => {
    duel.player1Field.monsters[0] = { name: "Magician's Rod", position: 'set' };
    const result = await facade.executeAction('tryStartMagiciansRodSearch', host, ['1', duel, true, 0]);
    expect(result).toBe(false);
    expect(host.setPendingChoice).not.toHaveBeenCalled();
  });
});
