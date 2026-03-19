import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/axios';

const TYPES = [
  { value: 'doubt', label: 'Dúvida', icon: '❓' },
  { value: 'opinion', label: 'Opinião', icon: '💬' },
  { value: 'suggestion', label: 'Sugestão', icon: '💡' },
  { value: 'bug', label: 'Bug / Problema', icon: '🐛' },
  { value: 'other', label: 'Outro', icon: '📌' },
] as const;

type FeedbackType = (typeof TYPES)[number]['value'];

interface MyFeedback {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  replyMessage?: string | null;
  repliedAt?: string | null;
}

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>('doubt');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myList, setMyList] = useState<MyFeedback[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadMy = async () => {
    setLoadingList(true);
    try {
      const { data } = await api.get<MyFeedback[]>('/feedback/my');
      setMyList(data);
    } catch {
      setMyList([]);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadMy();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Digite sua mensagem.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await api.post('/feedback', { type, message: message.trim() });
      setSuccess(true);
      setMessage('');
      loadMy();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Erro ao enviar.');
    } finally {
      setLoading(false);
    }
  };

  const typeLabel = TYPES.find((t) => t.value === type)?.label || type;
  const typeIcon = TYPES.find((t) => t.value === type)?.icon || '📌';

  return (
    <div className="min-h-screen p-4 md:p-8 relative z-10">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">📬</span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Dúvidas e Opiniões</h1>
              <p className="text-slate-400 text-sm md:text-base">
                Envie sua dúvida, opinião ou sugestão. Apenas Master e Admin podem ver as mensagens.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.form
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          onSubmit={handleSubmit}
          className="bg-slate-800/80 border border-slate-600/50 rounded-xl p-6 shadow-xl mb-8"
        >
          <label className="block text-slate-300 font-medium mb-2">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FeedbackType)}
            className="w-full bg-slate-700/80 border border-slate-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-4"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>

          <label className="block text-slate-300 font-medium mb-2">Mensagem</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escreva aqui sua dúvida, opinião ou sugestão..."
            rows={5}
            maxLength={2000}
            className="w-full bg-slate-700/80 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
          />
          <p className="text-slate-500 text-xs mt-1">{message.length}/2000</p>

          {error && (
            <p className="mt-2 text-red-400 text-sm">{error}</p>
          )}
          {success && (
            <p className="mt-2 text-emerald-400 text-sm">✓ Mensagem enviada com sucesso!</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
        </motion.form>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <span>📋</span> Meus envios
          </h2>
          {loadingList ? (
            <p className="text-slate-400">Carregando...</p>
          ) : myList.length === 0 ? (
            <p className="text-slate-500 text-sm">Você ainda não enviou nenhuma mensagem.</p>
          ) : (
            <ul className="space-y-3">
              {myList.map((item) => {
                const t = TYPES.find((x) => x.value === item.type);
                return (
                  <li
                    key={item.id}
                    className="bg-slate-800/60 border border-slate-600/40 rounded-lg p-4"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-slate-400 text-sm">
                        {t?.icon} {t?.label ?? item.type}
                      </span>
                    <span className="text-slate-500 text-xs">
                      {new Date(item.createdAt).toLocaleString('pt-BR')}
                      {item.readAt && (
                          <span className="ml-2 text-emerald-500">• Lido</span>
                        )}
                      {item.replyMessage && (
                          <span className="ml-2 text-amber-400">• Respondido</span>
                        )}
                      </span>
                    </div>
                    <p className="text-white text-sm whitespace-pre-wrap break-words">{item.message}</p>
                    {item.replyMessage && (
                      <div className="mt-3 pl-3 border-l-2 border-amber-500/50">
                        <p className="text-amber-400/90 text-xs font-medium mb-1">Resposta da equipe</p>
                        <p className="text-slate-300 text-sm whitespace-pre-wrap break-words">{item.replyMessage}</p>
                        {item.repliedAt && (
                          <p className="text-slate-500 text-xs mt-1">
                            {new Date(item.repliedAt).toLocaleString('pt-BR')}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>
      </div>
    </div>
  );
}
