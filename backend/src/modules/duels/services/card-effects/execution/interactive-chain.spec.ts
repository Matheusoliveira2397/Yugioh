import { InteractiveChainController, chainResponses } from './interactive-chain';
import { DuelsService } from '../../../duels.service';
import { DuelsGateway } from '../../../duels.gateway';

function fixture() {
  const duel: any = { id: 'd', player1Id: 1, player2Id: 2, status: 'IN_PROGRESS', turnCounter: 3,
    currentTurn: 1, currentPhase: 'MAIN1', pendingChoice: null, chainState: null,
    player1Field: { hand: [], spellTrap: [], monsters: [], graveyard: [] },
    player2Field: { hand: [], spellTrap: [{ name: 'Jar of Greed', position: 'set', trapSetTurnCounter: 2 }], monsters: [], graveyard: [] } };
  let persisted = JSON.parse(JSON.stringify(duel));
  const order: string[] = [];
  const host: any = {
    isJinzoOnField: () => false, isMirageDragonBlockingTraps: () => false,
    updateDuelInDatabase: jest.fn(async (_id, updates) => { Object.assign(duel, updates); persisted = JSON.parse(JSON.stringify(duel)); }),
    findDuelByIdFromDatabase: jest.fn(async () => duel),
    resolveInteractiveLink: jest.fn(async (_duel, link) => { order.push(link.card.name); }),
  };
  host.interactiveChains = new InteractiveChainController(host);
  return { duel, host, order, persisted: () => persisted, controller: host.interactiveChains as InteractiveChainController };
}
const pass = (f: ReturnType<typeof fixture>, userId: number) => f.controller.act(f.duel, userId,
  { id: f.duel.chainState.id, revision: f.duel.chainState.revision });
const open = (f: ReturnType<typeof fixture>) => f.controller.open(f.duel, 1, { name: 'Pot of Greed' }, 0);

describe('interactive chains', () => {
  it('persists activation without resolving, alternates priority, resolves LIFO after two passes', async () => {
    const f = fixture(); await open(f);
    expect(f.persisted().chainState.priority).toBe(2);
    expect(f.order).toEqual([]);
    await f.controller.act(f.duel, 2, { id: f.duel.chainState.id, revision: 0, zoneIndex: 0 });
    expect(f.duel.player2Field.spellTrap[0].position).toBe('face-up');
    await pass(f, 1); expect(f.order).toEqual([]);
    await pass(f, 2); expect(f.order).toEqual(['Jar of Greed', 'Pot of Greed']);
    expect(f.persisted().chainState).toBeNull();
  });
  it.each([1, 99])('rejects out of priority player %s without writing', async actor => {
    const f = fixture(); await open(f); f.host.updateDuelInDatabase.mockClear();
    await expect(pass(f, actor)).rejects.toThrow('prioridade');
    expect(f.host.updateDuelInDatabase).not.toHaveBeenCalled();
  });
  it('rejects duplicate requests and resets consecutive passes after a response', async () => {
    const f = fixture(); await open(f); const id = f.duel.chainState.id;
    await pass(f, 2);
    f.duel.player1Field.spellTrap = [{ name: 'Waboku', position: 'set', trapSetTurnCounter: 1 }];
    await f.controller.act(f.duel, 1, { id, revision: 1, zoneIndex: 0 });
    expect(f.duel.chainState.passes).toBe(0);
    await expect(f.controller.act(f.duel, 2, { id, revision: 0 })).rejects.toThrow();
    await pass(f, 2); expect(f.order).toEqual([]);
  });
  it.each([undefined, 3, 4])('does not offer traps with invalid set turn %s', turn => {
    const f = fixture(); f.duel.player2Field.spellTrap[0].trapSetTurnCounter = turn;
    expect(chainResponses(f.duel, 2, f.host)).toEqual([]);
  });
  it('checks blockers, participants and exact card identity', () => {
    const f = fixture(); expect(chainResponses(f.duel, 99, f.host)).toEqual([]);
    f.host.isJinzoOnField = () => true; expect(chainResponses(f.duel, 2, f.host)).toEqual([]);
    f.host.isJinzoOnField = () => false;
    f.duel.player2Field.spellTrap[0].name = 'Jar of Greed Fake';
    expect(chainResponses(f.duel, 2, f.host)).toEqual([]);
  });
  it('rejects an illegal zone without revealing any card', async () => {
    const f = fixture(); await open(f);
    await expect(f.controller.act(f.duel, 2, { id: f.duel.chainState.id, revision: 0, zoneIndex: 4 })).rejects.toThrow('não pode');
    expect(f.duel.player2Field.spellTrap[0].position).toBe('set');
  });
  it('resumes serialized remaining links after a choice without replaying resolved effects', async () => {
    const f = fixture(); await open(f);
    await f.controller.act(f.duel, 2, { id: f.duel.chainState.id, revision: 0, zoneIndex: 0 });
    f.host.resolveInteractiveLink.mockImplementationOnce(async () => { f.duel.pendingChoice = { type: 'TEST' }; });
    await pass(f, 1); await pass(f, 2);
    expect(f.persisted().chainState.status).toBe('choice');
    expect(f.persisted().chainState.links).toHaveLength(1);
    Object.assign(f.duel, f.persisted()); f.duel.pendingChoice = null;
    await new InteractiveChainController(f.host).resume(f.duel);
    expect(f.host.resolveInteractiveLink).toHaveBeenCalledTimes(2);
    expect(f.order).toEqual(['Pot of Greed']);
    expect(f.duel.chainState).toBeNull();
  });
  it('retains a failed execution marker and never retries an effect automatically', async () => {
    const f = fixture(); await open(f);
    f.host.resolveInteractiveLink.mockRejectedValue(new Error('db failure'));
    await pass(f, 2); await expect(pass(f, 1)).rejects.toThrow('db failure');
    expect(f.persisted().chainState.status).toBe('failed');
    expect(f.persisted().chainState.inFlight.card.name).toBe('Pot of Greed');
    await f.controller.resume(f.duel);
    expect(f.host.resolveInteractiveLink).toHaveBeenCalledTimes(1);
  });
  it('routes supported live activations through placement with immediate effect processing disabled', async () => {
    const f = fixture(); f.duel.player1Field.hand = [{ idCarta: 'PotOfGreed', name: 'Pot of Greed' }];
    f.host.placeCardOnField = jest.fn(async () => ({ success: true }));
    const started = await DuelsService.prototype.tryStartInteractiveChain.call(f.host, 'd', 1, 'PotOfGreed', 0);
    expect(started).toBe(true);
    expect(f.host.placeCardOnField).toHaveBeenCalledWith('d', 1, 'PotOfGreed', 0, 'face-up', undefined, true);
    expect(f.host.resolveInteractiveLink).not.toHaveBeenCalled();
  });
});

describe('chain socket integration', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  function gateway(f: ReturnType<typeof fixture>) {
    const client: any = { data: { userId: 2 }, emit: jest.fn(), rooms: new Set(['duel_d']) };
    const gateway: any = Object.create(DuelsGateway.prototype);
    Object.assign(gateway, { duelsService: f.host, duelActionLocks: new Map(), chainTimers: new Map(),
      server: { in: () => ({ fetchSockets: async () => [client] }), to: () => ({ emit: jest.fn() }) } });
    return { gateway, client };
  }
  it('uses JWT identity, rejects a repeated revision, and sends a personalized reconnect snapshot', async () => {
    const f = fixture(); await open(f); const { gateway: g, client } = gateway(f);
    const request = { duelId: 'd', userId: 99, actionType: 'CHAIN_PASS', actionData: { id: f.duel.chainState.id, revision: 0 } };
    await g.handleDuelAction(request, client);
    expect(f.duel.chainState.priority).toBe(1);
    await g.handleDuelAction(request, client);
    expect(f.duel.chainState.passes).toBe(1);
    expect(client.emit).toHaveBeenCalledWith('duelError', expect.anything());
    await g.handleChainSnapshot({ duelId: 'd' }, client);
    expect(client.emit).toHaveBeenCalledWith('chainUpdate', expect.objectContaining({ responses: [], chain: expect.objectContaining({ priority: 1 }) }));
  });
  it('blocks phase/game actions while responding and passes after both deadlines', async () => {
    const f = fixture(); await open(f); const { gateway: g, client } = gateway(f);
    await g.handleDuelAction({ duelId: 'd', actionType: 'SUMMON_MONSTER' }, client);
    expect(client.emit).toHaveBeenCalledWith('duelError', { message: 'Aguarde a resolução da chain' });
    await jest.advanceTimersByTimeAsync(60001);
    expect(f.duel.chainState).toBeNull();
    expect(f.order).toEqual(['Pot of Greed']);
  });
});
