import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

interface RedeemResult {
  ok: boolean;
  code: string;
  label: string | null;
  message: string;
  reward: {
    type: 'credits' | 'cash' | 'card';
    amount: number;
    card: { id: string; name: string; cardImage: string } | null;
  };
}

export default function RedeemCodePage() {
  const { user, setUser } = useAuthStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [lastReward, setLastReward] = useState<RedeemResult['reward'] | null>(null);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Digite um código.' });
      return;
    }
    setMessage(null);
    setLastReward(null);
    setLoading(true);
    try {
      const res = await api.post<RedeemResult>('/promo-codes/redeem', { code: trimmed });
      const data = res.data;
      setMessage({
        type: 'success',
        text: data.message || 'Código resgatado com sucesso!',
      });
      setLastReward(data.reward || null);
      setCode('');

      if (user && data.reward) {
        const next = { ...user };
        if (data.reward.type === 'credits') {
          next.credits = (user.credits || 0) + (data.reward.amount || 0);
        } else if (data.reward.type === 'cash') {
          next.cash = (user.cash || 0) + (data.reward.amount || 0);
        }
        setUser(next);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        (Array.isArray(err.response?.data?.message)
          ? err.response.data.message.join(', ')
          : null) ||
        err.message ||
        'Não foi possível resgatar o código';
      setMessage({ type: 'error', text: typeof msg === 'string' ? msg : 'Erro ao resgatar' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] px-4 py-10 bg-gradient-to-b from-gray-950 via-violet-950/30 to-gray-950">
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-violet-700/40 bg-slate-900/80 p-8 shadow-xl shadow-violet-950/40"
        >
          <h1 className="text-3xl font-bold text-white mb-2">Resgatar código</h1>
          <p className="text-slate-400 text-sm mb-6">
            Digite o código de premiação para receber créditos, cash ou cartas na sua conta.
          </p>

          <form onSubmit={handleRedeem} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Código</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ex.: NATAL2026"
                maxLength={64}
                autoComplete="off"
                className="w-full rounded-xl bg-slate-800 border border-slate-600 px-4 py-3 text-white text-lg font-mono tracking-widest uppercase placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full py-3 rounded-xl font-bold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors"
            >
              {loading ? 'Resgatando…' : 'Resgatar premiação'}
            </button>
          </form>

          {message && (
            <div
              className={`mt-6 p-4 rounded-xl border text-sm ${
                message.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-600 text-emerald-200'
                  : 'bg-red-950/50 border-red-600 text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {lastReward?.type === 'card' && lastReward.card && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-600">
              {lastReward.card.cardImage && (
                <img
                  src={lastReward.card.cardImage}
                  alt={lastReward.card.name}
                  className="w-14 h-20 object-cover rounded"
                />
              )}
              <div>
                <p className="text-white font-medium">{lastReward.card.name}</p>
                {lastReward.amount > 1 && (
                  <p className="text-slate-400 text-sm">x{lastReward.amount}</p>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
