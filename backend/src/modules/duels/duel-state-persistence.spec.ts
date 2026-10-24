import { DuelsService } from './duels.service';

describe('durable duel synchronization', () => {
  const duel = () => ({ player1Field: { hand: [] }, player2Field: { hand: [] }, pendingChoice: null });
  it('awaits an immediate write before reporting success', async () => {
    let release!: () => void;
    const write = new Promise<void>(resolve => { release = resolve; });
    const host = { activeDuels: new Map(), updateDuelInDatabase: jest.fn(() => write) };
    let completed = false;
    const syncing = DuelsService.prototype.syncDuelState.call(host, '1', duel() as any).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(host.updateDuelInDatabase).toHaveBeenCalledWith('1', expect.any(Object), { immediate: true });
    release();
    await syncing;
    expect(completed).toBe(true);
  });
  it('propagates failure and evicts the uncommitted cache entry', async () => {
    const error = new Error('database unavailable');
    const host = { activeDuels: new Map(), updateDuelInDatabase: jest.fn().mockRejectedValue(error) };
    await expect(DuelsService.prototype.syncDuelState.call(host, '1', duel() as any)).rejects.toThrow(error);
    expect(host.activeDuels.has('1')).toBe(false);
  });
  it('persists creation and clearing of choices immediately', () => {
    const check = DuelsService.prototype['shouldPersistDuelImmediately'];
    expect(check.call({}, { pendingChoice: { type: 'CONFISCATION', userId: 1, turnWhenStarted: 1, phaseWhenStarted: 'MAIN1', data: {} } })).toBe(true);
    expect(check.call({}, { pendingChoice: null })).toBe(true);
    expect(check.call({}, { player1Field: {} })).toBe(false);
  });
});

describe('database write boundary', () => {
  function setup() {
    const host: any = Object.create(DuelsService.prototype);
    const state = { id: '1', player1Field: { monsters: [], spellTrap: Array(5).fill(null) }, player2Field: { monsters: [], spellTrap: Array(5).fill(null) }, player1LifePoints: 8000, origin: 'OTHER' };
    host.activeDuels = new Map([['1', state]]);
    host.pendingDuelPersists = new Map();
    host.duelsRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    host.deepCleanField = (field: any) => field;
    return { host, state };
  }
  it('includes queued fields when an immediate LP update flushes the queue', async () => {
    const { host, state } = setup();
    host.pendingDuelPersists.set('1', { updates: { player1Field: state.player1Field }, timer: setTimeout(() => {}, 10000) });
    await host.updateDuelInDatabase('1', { player1LifePoints: 7000 });
    expect(host.duelsRepository.update).toHaveBeenCalledWith({ id: '1' }, expect.objectContaining({ player1Field: state.player1Field, player1LifePoints: 7000 }));
    expect(host.pendingDuelPersists.has('1')).toBe(false);
  });
  it('does not publish LP updates before database acknowledgement', async () => {
    const { host, state } = setup();
    host.duelsRepository.update.mockRejectedValue(new Error('write failed'));
    await expect(host.updateDuelInDatabase('1', { player1LifePoints: 7000 })).rejects.toThrow('write failed');
    expect(state.player1LifePoints).toBe(8000);
    expect(host.activeDuels.has('1')).toBe(false);
  });
  it('treats a missing database row as failure', async () => {
    const { host } = setup();
    host.duelsRepository.update.mockResolvedValue({ affected: 0 });
    await expect(host.updateDuelInDatabase('1', { player1LifePoints: 7000 })).rejects.toThrow('não encontrado');
    expect(host.activeDuels.has('1')).toBe(false);
  });
});
