# Interactive chains: implemented scope

The socket path now opens persisted response windows for Pot of Greed, Upstart Goblin,
Hinotama, Raigeki, Dark Hole, Heavy Storm, Harpie’s Feather Duster, Card Destruction and
Graceful Charity when a supported response is available. Waboku and Jar of Greed set
in a previous turn are the supported responses. The server checks Jinzo, Mirage Dragon,
ownership, priority and a chain ID/revision before revealing a response.

Two consecutive passes resolve links in reverse order. Each response resets the pass
count. The client shows the chain and eligible zone buttons; the deadline is 30 seconds
per priority window. Bots pass through the same authenticated action dispatcher.
A reconnect restores the persisted chain and its deadline. Graceful Charity persists
its discard choice and continues after either the player or the bot finishes it.
Phase changes and turn advancement are blocked during a chain.

`chain_state` is a nullable JSONB column added idempotently during backend startup.
Backend must be deployed with permission to add that column. Older clients can let
response windows expire, but need the updated frontend to choose a response.

## Remaining migration work

This is a bounded rollout, not complete conversion of every card/trigger to chains.
Targeted quick-play spells, counter traps, summon/damage-triggered windows and existing
automatic trap handlers still need activation adapters and gameplay tests. They retain
their existing paths. The new protocol intentionally does not offer cards whose costs,
spell speed or targets it cannot validate.

Effect code still writes through existing service operations rather than one database
transaction per resolved link. An in-flight marker prevents automatic replay of a
partially executed effect; an execution failure pauses the chain. A process crash
mid-effect requires inspection/recovery, whereas reconnect during response or choice
windows is supported. Multi-process duel locking is not implemented (the gateway
serializes actions within one backend process).

Tests cover production Waboku/Graceful Charity effects, LIFO order, pause/resume,
reconnect snapshots, JWT actor identity, stale revisions, illegal responses, timing,
phase-action blocking and failed-effect replay prevention. No live two-browser game
against a production database was performed.
