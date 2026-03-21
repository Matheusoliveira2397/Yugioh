import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../api/axios';

type BroadcastPayload = { id: string; title: string; bodyHtml: string };

export default function LoginBroadcastModal() {
  const [data, setData] = useState<BroadcastPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);

  const fetchBroadcast = useCallback(async () => {
    try {
      const { data: res } = await api.get<BroadcastPayload | null>('/users/me/login-broadcast', { timeout: 15000 });
      setData(
        res != null && typeof res === 'object' && 'id' in res && 'bodyHtml' in (res as object)
          ? (res as BroadcastPayload)
          : null,
      );
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBroadcast();
  }, [fetchBroadcast]);

  const dismiss = async () => {
    if (!data?.id || closing) return;
    setClosing(true);
    try {
      await api.post('/users/me/login-broadcast/dismiss', { id: data.id });
    } catch {
      /* ainda fecha localmente */
    } finally {
      setData(null);
      setClosing(false);
    }
  };

  if (loading || !data) return null;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-broadcast-title"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-purple-500/35 bg-gradient-to-br from-slate-900/98 to-slate-950/98 shadow-2xl shadow-purple-900/40 flex flex-col"
        >
          <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-r from-purple-600/25 to-transparent shrink-0">
            <h2 id="login-broadcast-title" className="text-lg font-bold text-white pr-2">
              {data.title?.trim() ? data.title : 'Mensagem do servidor'}
            </h2>
            <p className="text-xs text-white/50 mt-1">Leia abaixo — você pode incluir imagens e links na mensagem configurada pelos administradores.</p>
          </div>
          <div
            className="px-5 py-4 overflow-y-auto text-white/90 text-sm leading-relaxed space-y-3
              [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg
              [&_a]:text-purple-300 [&_a]:underline [&_a]:underline-offset-2
              [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: data.bodyHtml }}
          />
          <div className="px-5 py-4 border-t border-white/10 shrink-0">
            <button
              type="button"
              disabled={closing}
              onClick={dismiss}
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-60 transition-all"
            >
              {closing ? 'Salvando…' : 'Entendi, fechar'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
