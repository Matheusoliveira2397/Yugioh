import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import { api } from '../api/axios';

const TYPE_LABELS: Record<string, string> = {
  doubt: '❓ Dúvida',
  opinion: '💬 Opinião',
  suggestion: '💡 Sugestão',
  bug: '🐛 Bug',
  other: '📌 Outro',
};

interface FeedbackItem {
  id: string;
  userId: number;
  type: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  replyMessage?: string | null;
  repliedAt?: string | null;
  repliedByUserId?: number | null;
  userNickname?: string | null;
  userUsername?: string | null;
}

export default function AdminFeedbackPanel() {
  const { user } = useAuthStore();
  const [list, setList] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<FeedbackItem[]>('/feedback/admin/all');
      setList(data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Erro ao carregar.');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await api.post(`/feedback/admin/${id}/read`);
      setList((prev) =>
        prev.map((f) => (f.id === id ? { ...f, readAt: new Date().toISOString() } : f))
      );
    } catch {
      // ignore
    }
  };

  const sendReply = async (id: string) => {
    if (!replyText.trim()) return;
    setReplyLoading(true);
    try {
      const { data } = await api.post<FeedbackItem>(`/feedback/admin/${id}/reply`, {
        message: replyText.trim(),
      });
      setList((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...data } : f))
      );
      setReplyText('');
      setReplyingId(null);
    } catch {
      // ignore
    } finally {
      setReplyLoading(false);
    }
  };

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const filtered = filter === 'unread' ? list.filter((f) => !f.readAt) : list;
  const unreadCount = list.filter((f) => !f.readAt).length;

  return (
    <div className="min-h-screen p-4 md:p-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <span className="text-5xl">📬</span>
            <div>
              <h1 className="text-3xl font-bold text-white">Feedback dos usuários</h1>
              <p className="text-slate-400">
                Dúvidas, opiniões e sugestões enviadas pelos jogadores. Apenas Master e Admin veem esta página.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/50 rounded-lg">
            <span className="text-xl">👑</span>
            <span className="text-amber-400 font-bold">{user.role === 'MASTER' ? 'MASTER' : 'ADMIN'}</span>
          </div>
        </motion.div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'all'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Todas ({list.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700/80 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Não lidas ({unreadCount})
          </button>
        </div>

        {error && <p className="text-red-400 mb-4">{error}</p>}
        {loading ? (
          <p className="text-slate-400">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-500">Nenhuma mensagem {filter === 'unread' ? 'não lida' : ''}.</p>
        ) : (
          <ul className="space-y-4">
            {filtered.map((item) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border p-4 ${
                  item.readAt
                    ? 'bg-slate-800/60 border-slate-600/40'
                    : 'bg-slate-800/90 border-purple-500/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-400 text-sm">
                      {TYPE_LABELS[item.type] ?? item.type}
                    </span>
                    <span className="text-white font-medium">
                      {item.userNickname || item.userUsername || `ID ${item.userId}`}
                    </span>
                    {item.userUsername && item.userNickname !== item.userUsername && (
                      <span className="text-slate-500 text-sm">@{item.userUsername}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs">
                      {new Date(item.createdAt).toLocaleString('pt-BR')}
                    </span>
                    {!item.readAt && (
                      <button
                        type="button"
                        onClick={() => markAsRead(item.id)}
                        className="text-xs px-2 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded"
                      >
                        Marcar como lido
                      </button>
                    )}
                    {item.readAt && (
                      <span className="text-emerald-500 text-xs">Lido</span>
                    )}
                  </div>
                </div>
                <p className="text-white text-sm whitespace-pre-wrap break-words">{item.message}</p>

                {item.replyMessage ? (
                  <div className="mt-4 pl-4 border-l-2 border-amber-500/50">
                    <p className="text-amber-400/90 text-xs font-medium mb-1">Resposta da equipe</p>
                    <p className="text-slate-300 text-sm whitespace-pre-wrap break-words">{item.replyMessage}</p>
                    {item.repliedAt && (
                      <p className="text-slate-500 text-xs mt-1">
                        {new Date(item.repliedAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4">
                    {replyingId === item.id ? (
                      <>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Escreva a resposta ao usuário..."
                          rows={3}
                          className="w-full bg-slate-700/80 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:ring-2 focus:ring-amber-500 resize-y"
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => sendReply(item.id)}
                            disabled={replyLoading || !replyText.trim()}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 text-white text-sm rounded"
                          >
                            {replyLoading ? 'Enviando...' : 'Enviar resposta'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReplyingId(null); setReplyText(''); }}
                            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded"
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReplyingId(item.id)}
                        className="text-sm text-amber-400 hover:text-amber-300"
                      >
                        Responder usuário
                      </button>
                    )}
                  </div>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
