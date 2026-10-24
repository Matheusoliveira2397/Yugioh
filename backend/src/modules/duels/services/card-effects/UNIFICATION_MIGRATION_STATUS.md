# Effect execution — 2026-10-24

## Implemented

- `CardEffectsService` is the public facade for activation, FLIP and named effect actions; `EffectExecutor` resolves them.
- The 1,526-line `DuelsService.processCardEffect` fallback was removed. Its named activation branches already have exact registrations; production-registration tests cover all 20 identifiers, including ROTA. Unknown effects do not execute a legacy substitute. Generic equipment continues to remain on the field.
- Dekoichi, Snowman Eater, Fiber Jar and Morphing Jar have separate registered FLIP implementations. FLIP registrations cannot be invoked as spell activations. Partial-name matching for Dekoichi was removed.
- 80 async effect actions were moved from DuelsService into `actions/`, with one typed catalog and a shared executor. Existing methods remain API adapters for sockets, bots and other callers. Their extracted bodies were compared with the main-branch bodies using normalized TypeScript AST output; all 80 preserve the original logic.
- 57 player-originated actions centrally reject users outside the duel before invoking card code. Existing per-card conditions, costs and targets are preserved.
- The gateway's direct Last Will choice call now uses the same public route.
- The low-level chain resolver implements reverse order, negation and suspension on a player choice, returning unresolved links for explicit continuation.
- Registry lookup checks all supported identity fields. A conflicting registration installs none of its aliases.

## Validation

Backend build and 166 Jest tests pass. Added regression cases exercise production registrations, controller selection, FLIP hand/deck changes, extra-deck handling, outsider rejection, invalid targets, trap suppression, trigger timing and chain order/suspension. This is not exhaustive card-by-card gameplay or a live multiplayer end-to-end test.

## Still required for the original full redesign

- Connect the chain resolver to a persisted response-window protocol in the gateway/frontend, including opponent priority, timing, reconnect and continued resolution after choices. Existing automatic trap checks retain their previous gameplay order; they have not become interactive multiplayer chains.
- Card implementations still use DuelsService for persistence and shared game operations. A transactional state repository and complete composition through shared primitives remain to be implemented.
- Some continuous/passive rules and field-leaving hooks remain in duel/battle utilities. The 80-action catalog covers the extracted async actions, not every possible Yu-Gi-Oh card or rule.
- Extend gameplay characterization to every supported card, interactions, immunity and costs before describing the full redesign as complete.

The legacy activation fallback is gone; this does not imply that the entire original redesign is finished.
