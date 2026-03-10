import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';

interface UserOption {
  id: number;
  nickname: string;
  username: string;
  credits?: number;
}

interface HistoryItem {
  id: number;
  userId: number;
  userNickname: string;
  userUsername: string;
  adminId: number;
  adminNickname: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export default function AdminPaymentsPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    loadHistory();
  }, [historyPage, filterUserId]);

  const loadUsers = async () => {
    try {
      const res = await api.get('/admin/users', { params: { limit: 500 } });
      const list = res.data?.users ?? res.data ?? [];
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Erro ao carregar usuários:', e);
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await api.get('/admin/payments/history', {
        params: {
          page: historyPage,
          limit: 15,
          userId: filterUserId.trim() || undefined,
        },
      });
      setHistory(res.data?.items ?? []);
      setHistoryTotalPages(res.data?.totalPages ?? 1);
      setHistoryTotal(res.data?.total ?? 0);
    } catch (e) {
      console.error('Erro ao carregar histórico:', e);
      setMessage({ type: 'error', text: 'Erro ao carregar histórico.' });
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredUsers = userSearch.trim()
    ? users.filter(
        (u) =>
          u.nickname?.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
          String(u.id) === userSearch.trim()
      )
    : users.slice(0, 50);

  const handleAddCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = selectedUserId === '' ? null : Number(selectedUserId);
    const amt = parseInt(amount, 10);
    if (uid == null || isNaN(uid)) {
      setMessage({ type: 'error', text: 'Selecione um usuário.' });
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setMessage({ type: 'error', text: 'Informe uma quantidade de créditos válida.' });
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      const res = await api.post('/admin/payments/add-credits', {
        userId: uid,
        amount: amt,
        note: note.trim() || undefined,
      });
      setMessage({ type: 'success', text: res.data?.message ?? `${amt} créditos adicionados.` });
      setAmount('');
      setNote('');
      setSelectedUserId('');
      loadHistory();
      loadUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message ?? 'Erro ao adicionar créditos.' });
    } finally {
      setAdding(false);
    }
  };

  const formatDate = (s: string) => {
    try {
      const d = new Date(s);
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return s;
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="text-slate-400 hover:text-white text-sm font-medium"
          >
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-white">Pagamentos – Créditos</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-black/20 border border-white/10 p-4 sm:p-5 mb-6"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Adicionar créditos à conta</h2>
          <p className="text-slate-400 text-sm mb-4">
            Quando alguém comprar créditos, adicione aqui. O histórico fica registrado abaixo.
          </p>
          <form onSubmit={handleAddCredits} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Usuário</label>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Buscar por nick, username ou ID..."
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm mb-2"
              />
              <select
                value={selectedUserId === '' ? '' : String(selectedUserId)}
                onChange={(e) => setSelectedUserId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
                required
              >
                <option value="">Selecione o usuário</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nickname} (@{u.username}) {u.credits != null ? `– ${u.credits} créditos` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Quantidade de créditos</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 100"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Observação (opcional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: PIX ref 123, Pagamento confirmado"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm"
              />
            </div>
            {message && (
              <p className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            )}
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm disabled:opacity-50"
            >
              {adding ? 'Adicionando...' : 'Adicionar créditos'}
            </button>
          </form>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl bg-black/20 border border-white/10 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white">Histórico de adição de créditos</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                placeholder="Filtrar por ID do usuário"
                className="w-40 px-2 py-1.5 rounded bg-white/5 border border-white/10 text-white text-sm placeholder-slate-500"
              />
              <button
                type="button"
                onClick={() => { setHistoryPage(1); loadHistory(); }}
                className="px-2 py-1.5 rounded bg-white/10 hover:bg-white/20 text-white text-sm"
              >
                Atualizar
              </button>
            </div>
          </div>
          {loadingHistory ? (
            <p className="text-slate-400 text-sm py-4">Carregando...</p>
          ) : history.length === 0 ? (
            <p className="text-slate-400 text-sm py-4">Nenhum registro no histórico.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-white/10">
                      <th className="pb-2 pr-2">Data</th>
                      <th className="pb-2 pr-2">Usuário</th>
                      <th className="pb-2 pr-2">Quem adicionou</th>
                      <th className="pb-2 pr-2 text-right">Créditos</th>
                      <th className="pb-2">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id} className="border-b border-white/5">
                        <td className="py-2 pr-2 text-slate-300 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                        <td className="py-2 pr-2 text-white">
                          {item.userNickname} <span className="text-slate-500">(@{item.userUsername})</span>
                        </td>
                        <td className="py-2 pr-2 text-slate-300">{item.adminNickname}</td>
                        <td className="py-2 pr-2 text-right text-emerald-400 font-medium">+{item.amount}</td>
                        <td className="py-2 text-slate-400 max-w-[200px] truncate" title={item.note ?? ''}>
                          {item.note || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
                  <p className="text-slate-500 text-xs">
                    Total: {historyTotal} registro(s)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage <= 1}
                      className="px-2 py-1 rounded bg-white/10 disabled:opacity-50 text-white text-xs"
                    >
                      Anterior
                    </button>
                    <span className="px-2 py-1 text-slate-400 text-xs">
                      {historyPage} / {historyTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      disabled={historyPage >= historyTotalPages}
                      className="px-2 py-1 rounded bg-white/10 disabled:opacity-50 text-white text-xs"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
