import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import { api } from '../api/axios';

interface UserAdmin {
  id: number;
  username: string;
  nickname: string;
  role: string;
  adminAllowedTabs: string[] | null;
}

const ADMIN_TAB_OPTIONS = [
  { id: 'create-account', label: 'Criar conta' },
  { id: 'admin-control', label: 'Controle de Admins' },
  { id: 'site-tabs', label: 'Gerenciar Abas' },
  { id: 'cards', label: 'Cartas' },
  { id: 'initial-decks', label: 'Decks Iniciais' },
  { id: 'news', label: 'Notícias' },
  { id: 'playmats', label: 'Playmats' },
  { id: 'sleeves', label: 'Skins' },
  { id: 'talismans', label: 'Talismãs' },
  { id: 'promotions', label: 'Promoções' },
  { id: 'players', label: 'Jogadores' },
  { id: 'arena', label: 'Arena' },
  { id: 'active-duels', label: 'Duelos Ativos' },
  { id: 'random-duel-level-ranges', label: 'Random Duel' },
  { id: 'tournaments', label: 'Torneios' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'divisions', label: 'Divisões' },
  { id: 'achievements', label: 'Conquistas' },
  { id: 'messages', label: 'Mensagens' },
  { id: 'social-media', label: 'Redes Sociais' },
  { id: 'new-account-settings', label: 'Contas Novas' },
  { id: 'cash-division', label: 'Divisão de Cash' },
];

export default function AdminControlPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [admins, setAdmins] = useState<UserAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingTabs, setEditingTabs] = useState<Record<number, string[]>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  if (!user || user.role !== 'MASTER') {
    return <Navigate to="/admin" replace />;
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/users', { params: { limit: 200 } });
      const list = res.data?.users ?? [];
      const adminList = list.filter((u: UserAdmin) => u.role === 'ADMIN');
      setAdmins(adminList);
      setEditingTabs((prev) => {
        const next = { ...prev };
        adminList.forEach((a: UserAdmin) => {
          if (next[a.id] === undefined) {
            next[a.id] = a.adminAllowedTabs ?? [];
          }
        });
        return next;
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao carregar admins' });
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleTab = (userId: number, tabId: string) => {
    setEditingTabs((prev) => {
      const current = prev[userId] ?? [];
      const next = current.includes(tabId)
        ? current.filter((t) => t !== tabId)
        : [...current, tabId];
      return { ...prev, [userId]: next };
    });
  };

  const setAllTabs = (userId: number, checked: boolean) => {
    setEditingTabs((prev) => ({
      ...prev,
      [userId]: checked ? ADMIN_TAB_OPTIONS.map((o) => o.id) : [],
    }));
  };

  const saveTabs = async (userId: number) => {
    const tabs = editingTabs[userId] ?? [];
    setSavingId(userId);
    setMessage(null);
    try {
      await api.put(`/admin/users/${userId}/allowed-tabs`, { allowedTabs: tabs });
      setMessage({ type: 'success', text: 'Abas atualizadas com sucesso!' });
      setAdmins((prev) =>
        prev.map((a) => (a.id === userId ? { ...a, adminAllowedTabs: tabs.length > 0 ? tabs : null } : a))
      );
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Erro ao salvar' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-900 via-slate-900/20 to-gray-900">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <span className="text-4xl">🛡️</span>
            Controle de Admins
          </h1>
          <p className="text-gray-400 mt-1">
            Defina quais abas do painel cada admin pode acessar. Só contas Master veem esta página.
          </p>
        </motion.div>

        {message && (
          <div
            className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-900/40 text-green-200' : 'bg-red-900/40 text-red-200'}`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-4">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
          >
            ← Voltar ao painel
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando admins...</div>
        ) : admins.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-gray-400">
            Nenhuma conta Admin encontrada. Crie uma em &quot;Criar conta&quot; (aba Conta admin).
          </div>
        ) : (
          <div className="space-y-6">
            {admins.map((admin) => {
              const currentTabs = editingTabs[admin.id] ?? admin.adminAllowedTabs ?? [];
              const isDirty =
                JSON.stringify([...currentTabs].sort()) !==
                JSON.stringify([...(admin.adminAllowedTabs ?? [])].sort());

              return (
                <motion.div
                  key={admin.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-white/10 bg-white/5 p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="text-white font-bold">{admin.nickname}</p>
                      <p className="text-gray-400 text-sm">@{admin.username}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={currentTabs.length === ADMIN_TAB_OPTIONS.length}
                          onChange={(e) => setAllTabs(admin.id, e.target.checked)}
                          className="rounded border-white/30 bg-black/30 text-slate-400"
                        />
                        Todas
                      </label>
                      <button
                        type="button"
                        disabled={!isDirty || savingId === admin.id}
                        onClick={() => saveTabs(admin.id)}
                        className="px-4 py-2 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                      >
                        {savingId === admin.id ? 'Salvando…' : 'Salvar abas'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {ADMIN_TAB_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        className="inline-flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={currentTabs.includes(opt.id)}
                          onChange={() => toggleTab(admin.id, opt.id)}
                          className="rounded border-white/30 bg-black/30 text-slate-400"
                        />
                        <span className="text-white/90 text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
