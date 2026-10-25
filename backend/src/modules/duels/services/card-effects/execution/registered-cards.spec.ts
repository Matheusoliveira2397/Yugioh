import { InteractiveChainController } from './interactive-chain';
import { DuelsService } from '../../../duels.service';
import 'reflect-metadata';
import { CardEffectsModule } from '../card-effects.module';
import { CardEffectRegistryService } from '../registry/card-effect-registry.service';
import { DuelUtilsService } from '../../duel-utils.service';
import { EffectExecutor } from './effect-executor';
import { CardEffectsService } from '../../card-effects.service';
import { drawFromDeck } from '../primitives/effect-operations';

/** Exercise the production registrations, not a duplicate list of test-only implementations. */
describe('production card registrations', () => {
  let registry: CardEffectRegistryService;
  let facade: CardEffectsService;
  let host: any;
  let duel: any;
  const field = () => ({
    deck: Array.from({ length: 10 }, (_, i) => ({ instanceId: `deck-${i}` })),
    hand: [{ instanceId: 'old-hand' }], monsters: Array(5).fill(null),
    spellTrap: Array(5).fill(null), graveyard: [], extraDeck: [],
  });

  beforeEach(async () => {
    duel = { id: 1, player1Id: 10, player2Id: 20, player1LifePoints: 8000,
      player2LifePoints: 8000, player1Field: field(), player2Field: field() };
    host = {
      activeDuels: new Map([['1', duel]]),
      updateDuelInDatabase: jest.fn().mockResolvedValue(undefined),
      syncDuelState: jest.fn().mockResolvedValue(undefined),
      findDuelByIdFromDatabase: jest.fn().mockImplementation(async () => duel),
      drawCard: jest.fn().mockImplementation(async (_id, userId) => {
        drawFromDeck(userId === duel.player1Id ? duel.player1Field : duel.player2Field, 1);
      }),
    };
    const utils = new DuelUtilsService();
    registry = new CardEffectRegistryService(host, utils);
    const types = Reflect.getMetadata('design:paramtypes', CardEffectsModule);
    const args = types.map((type: any) => {
      if (type.name === 'CardEffectRegistryService') return registry;
      if (type.name === 'DuelsService') return host;
      if (type.name === 'EffectBackupService') return { createBackup: async () => undefined };
      if (type.name === 'EffectIntegrityService') return { validateAllEffects: async () => ({ isHealthy: true, validEffects: 0 }) };
      if (type.name === 'EffectSealService') return { verifyAndUpdateSeal: async () => ({ ok: true }) };
      if (type.name === 'EffectMonitorService') return {};
      return new type(host, utils);
    });
    await new (CardEffectsModule as any)(...args).onModuleInit();
    facade = new CardEffectsService(new EffectExecutor(registry));
  });

  it('integrates a real Waboku response and Graceful Charity resolution with a persisted choice', async () => {
    Object.assign(duel, { status: 'IN_PROGRESS', currentTurn: 1, currentPhase: 'MAIN1', turnCounter: 2 });
    const graceful = { idCarta: 'GracefulCharity', name: 'Graceful Charity', type: 'Spell', position: 'face-up' };
    duel.player1Field.spellTrap[0] = graceful;
    duel.player2Field.spellTrap[0] = { idCarta: 'Waboku', name: 'Waboku', type: 'Trap', position: 'set', trapSetTurnCounter: 1 };
    host.cardEffectsService = facade;
    host.isJinzoOnField = () => false;
    host.isMirageDragonBlockingTraps = () => false;
    host.recalculateMagePowerAtk = jest.fn();
    host.updateDuelInDatabase.mockImplementation(async (_id: any, updates: any) => Object.assign(duel, updates));
    host.resolveInteractiveLink = (state: any, link: any) => DuelsService.prototype.resolveInteractiveLink.call(host, state, link);
    const controller = new InteractiveChainController(host);
    await controller.open(duel, 10, graceful, 0);
    await controller.act(duel, 20, { id: duel.chainState.id, revision: 0, zoneIndex: 0 });
    await controller.act(duel, 10, { id: duel.chainState.id, revision: 1 });
    await controller.act(duel, 20, { id: duel.chainState.id, revision: 2 });
    expect(duel.player2Field.wabokuActiveThisTurn).toBe(true);
    expect(duel.player1Field.hand).toHaveLength(4);
    expect(duel.player1Field.graveyard).toContain(graceful);
    expect(duel.pendingChoice.type).toBe('GRACEFUL_CHARITY');
    expect(duel.chainState.status).toBe('choice');
    const restored = JSON.parse(JSON.stringify(duel));
    Object.assign(duel, restored); duel.pendingChoice = null;
    await new InteractiveChainController(host).resume(duel);
    expect(duel.chainState).toBeNull();
    expect(host.drawCard).toHaveBeenCalledTimes(3);
  });

  it.each([
    'HeavyStorm', 'Raigeki', 'DarkHole', 'HarpiesFeatherDuster', 'TheForcefulSentry',
    'Confiscation', 'GracefulCharity', 'MonsterReborn', 'ReinforcementOfTheArmy', 'ROTA',
    'ChangeOfHeart', 'LastWill', 'BrainControl', 'SoulTaker', 'UnitedWeStand', 'MagePower',
    'SwordsOfRevealingLight', 'BannerOfCourage', 'AutonomousActionUnit', 'Waboku',
  ])('has an exact registered replacement for removed activation %s', id => {
    expect(registry.findEffect({ idCarta: id })).not.toBeNull();
  });

  it.each([true, false])('Dekoichi draws for its controller (player1=%s)', async isPlayer1 => {
    await facade.processFlipEffect('1', duel, isPlayer1, { idCarta: 'Dekoichi' }, 0);
    expect(host.drawCard).toHaveBeenCalledWith('1', isPlayer1 ? 10 : 20);
    expect((isPlayer1 ? duel.player1Field : duel.player2Field).hand).toHaveLength(2);
  });

  it('does not apply Dekoichi to similarly named cards', async () => {
    await facade.processFlipEffect('1', duel, true, { name: 'Not Dekoichi' }, 0);
    expect(host.drawCard).not.toHaveBeenCalled();
  });

  it('Morphing Jar discards both hands and draws five for each side', async () => {
    const old1 = duel.player1Field.hand[0];
    const old2 = duel.player2Field.hand[0];
    await facade.processFlipEffect('1', duel, true, { name: 'Morphing Jar' }, 0);
    expect(duel.player1Field.graveyard).toContain(old1);
    expect(duel.player2Field.graveyard).toContain(old2);
    expect(duel.player1Field.hand).toHaveLength(5);
    expect(duel.player2Field.hand).toHaveLength(5);
    expect(duel.player1Field.deck).toHaveLength(5);
    expect(duel.player2Field.deck).toHaveLength(5);
  });

  it('Fiber Jar returns fusion monsters to extra deck and draws five for both sides', async () => {
    const fusion = { instanceId: 'fusion', name: 'Fusion', type: 'Monster', monsterType: 'Fusion' };
    duel.player1Field.monsters[0] = fusion;
    await facade.processFlipEffect('1', duel, true, { name: 'Fiber Jar' }, 0);
    expect(duel.player1Field.extraDeck).toContain(fusion);
    expect(duel.player1Field.monsters.every((m: any) => m == null)).toBe(true);
    expect(duel.player1Field.hand).toHaveLength(5);
    expect(duel.player2Field.hand).toHaveLength(5);
  });

  it('Snowman Eater only prepares destruction when a face-up target exists', async () => {
    await facade.processFlipEffect('1', duel, true, { name: 'Snowman Eater' }, 0);
    expect(host.updateDuelInDatabase).not.toHaveBeenCalled();
    duel.player2Field.monsters[1] = { name: 'Target', position: 'attack' };
    await facade.processFlipEffect('1', duel, true, { name: 'Snowman Eater' }, 0);
    expect(host.updateDuelInDatabase).toHaveBeenCalledTimes(1);
    expect(duel.player2Field.monsters[1]).not.toBeNull(); // choice has not been confirmed
  });

  it('Pot of Greed draws two and sends only its own activation card to the graveyard', async () => {
    const spell = { name: 'Pot of Greed', instanceId: 'pot' };
    const other = { name: 'Other', instanceId: 'other' };
    duel.player1Field.spellTrap[0] = spell;
    duel.player1Field.spellTrap[1] = other;
    await facade.processCardEffect('1', duel, true, spell, 0);
    expect(duel.player1Field.hand).toHaveLength(3);
    expect(duel.player1Field.graveyard).toContain(spell);
    expect(duel.player1Field.spellTrap[1]).toBe(other);
  });
});
