import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

type ChainUpdate = {
  duelId: string;
  chain: null | { id: string; revision: number; priority: number; status: string;
    links: Array<{ card: { name?: string; cardName?: string } }> };
  responses: number[];
};

export default function InteractiveChainPanel({ socket, duelId, userId }: {
  socket: Socket | null | undefined; duelId: string; userId?: number | string;
}) {
  const [state, setState] = useState<ChainUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(Boolean(socket?.connected));
  useEffect(() => {
    setState(null);
    if (!socket) return;
    const update = (data: ChainUpdate) => {
      if (String(data.duelId) !== String(duelId)) return;
      setState(data); setBusy(false); setConnected(socket.connected);
    };
    const disconnect = () => setConnected(false);
    const error = () => setBusy(false);
    socket.on('chainUpdate', update);
    socket.on('disconnect', disconnect);
    socket.on('duelError', error);
    // Request a snapshot even if joinDuelRoom completed before this component mounted.
    socket.emit('chainSnapshot', { duelId });
    return () => {
      socket.off('chainUpdate', update); socket.off('disconnect', disconnect); socket.off('duelError', error);
    };
  }, [socket, duelId]);
  const chain = state?.chain;
  if (!chain) return null;
  const canRespond = connected && !busy && chain.status === 'responding' && chain.priority === Number(userId);
  const act = (zoneIndex?: number) => {
    if (!canRespond) return;
    setBusy(true);
    socket?.emit('duelAction', { duelId, actionType: zoneIndex === undefined ? 'CHAIN_PASS' : 'CHAIN_RESPOND',
      actionData: { id: chain.id, revision: chain.revision, zoneIndex } });
  };
  return <section aria-label="Chain em andamento" aria-live="polite"
    className="absolute top-12 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,28rem)] rounded-xl border border-amber-400 bg-slate-950/95 p-4 text-white shadow-xl">
    <h2 className="font-bold">Chain em andamento</h2>
    <ol className="my-2 text-sm">{chain.links.map((link, index) =>
      <li key={index}>{index + 1}. {link.card.name || link.card.cardName || 'Efeito'}</li>)}</ol>
    <p className="text-sm">{!connected ? 'Reconectando…' : chain.status === 'choice' ? 'Aguardando escolha do jogador.'
      : chain.status === 'failed' ? 'A resolução falhou. A partida foi pausada para evitar efeitos duplicados.' : chain.status === 'resolving' ? 'Resolvendo efeitos…' : canRespond ? 'Você pode responder ou passar.' : 'Aguardando resposta do oponente.'}</p>
    {canRespond && <div className="mt-3 flex flex-wrap gap-2">
      {state?.responses.map(zone => <button key={zone} onClick={() => act(zone)}
        className="rounded bg-blue-700 px-3 py-2">Ativar armadilha na zona {zone + 1}</button>)}
      <button onClick={() => act()} className="rounded bg-slate-700 px-3 py-2">Passar</button>
    </div>}
  </section>;
}
