import { CardEffectRegistryService } from '../registry/card-effect-registry.service';
import { EffectExecutor, EffectChainLink } from './effect-executor';
import { CardEffectContext } from '../interfaces/card-effect.interface';

const context = (name: string): CardEffectContext => ({
  duelId: '1', duel: {} as any, isPlayer1: true, card: { name }, zoneIndex: 0,
});

describe('registered event execution', () => {
  let registry: CardEffectRegistryService;
  let executor: EffectExecutor;
  beforeEach(() => {
    registry = new CardEffectRegistryService({} as any, {} as any);
    executor = new EffectExecutor(registry);
  });

  it('does not match a longer card name or run FLIP as an activation', async () => {
    const fn = jest.fn().mockResolvedValue({ success: true });
    registry.registerEvent('flip', ['Morphing Jar'], fn);
    expect((await executor.execute('flip', context('Morphing Jar #2'))).success).toBe(false);
    expect((await executor.execute('activate', context('Morphing Jar'))).success).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    await executor.execute('flip', context('Morphing Jar'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('checks every identifier even when name and database id are unrelated', () => {
    registry.registerSimple(['Example'], () => ({ success: true }), ['YGOPRO_123']);
    expect(registry.findEffect({ name: 'Skin name', id: 99, cardId: 'YGOPRO_123' })).not.toBeNull();
  });

  it('rejects alias collisions without installing other aliases from the failed registration', () => {
    registry.registerSimple(['Original'], () => ({ success: true }));
    expect(() => registry.registerSimple(['New alias', 'Original'], () => ({ success: true }))).toThrow('COLISÃO');
    expect(registry.hasKey('New alias')).toBe(false);
  });

  it('does not mutate state when activation conditions fail', async () => {
    const process = jest.fn();
    registry.register(class {} as any, {
      cardNames: ['Blocked'], matches: () => true, canActivate: () => false, process,
    });
    expect((await executor.execute('activate', context('Blocked'))).success).toBe(false);
    expect(process).not.toHaveBeenCalled();
  });

  it('propagates failure without a second execution', async () => {
    const process = jest.fn().mockRejectedValue(new Error('failure'));
    registry.registerSimple(['Broken'], process);
    await expect(executor.execute('activate', context('Broken'))).rejects.toThrow('failure');
    expect(process).toHaveBeenCalledTimes(1);
  });

  it('resolves chains in reverse order, skips negated links and resumes after a choice', async () => {
    const order: string[] = [];
    for (const name of ['A', 'B', 'C', 'D']) {
      registry.registerSimple([name], () => {
        order.push(name);
        return { success: true, createdPendingChoice: name === 'C' };
      });
    }
    const links: EffectChainLink[] = ['A', 'B', 'C', 'D'].map(name => ({
      event: 'activate', context: context(name), negated: name === 'B',
    }));
    const first = await executor.resolveChain(links);
    expect(order).toEqual(['D', 'C']);
    expect(first.suspended).toBe(true);
    expect(first.remaining.map(l => l.context.card.name)).toEqual(['A', 'B']);
    const last = await executor.resolveChain(first.remaining);
    expect(order).toEqual(['D', 'C', 'A']);
    expect(last.suspended).toBe(false);
    expect(links).toHaveLength(4);
  });
});
