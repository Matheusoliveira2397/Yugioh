import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import { api } from '../api/axios';

type TabType = 'normal' | 'admin';

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

export default function AdminCreateAccountPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabType>('normal');

  // Conta normal
  const [normalUsername, setNormalUsername] = useState('');
  const [normalNickname, setNormalNickname] = useState('');
  const [normalEmail, setNormalEmail] = useState('');
  const [normalPassword, setNormalPassword] = useState('');
  const [normalConfirmPassword, setNormalConfirmPassword] = useState('');
  const [normalLoading, setNormalLoading] = useState(false);
  const [normalError, setNormalError] = useState('');
  const [normalSuccess, setNormalSuccess] = useState('');

  // Conta admin
  const [adminUsername, setAdminUsername] = useState('');
  const [adminNickname, setAdminNickname] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminTabs, setAdminTabs] = useState<string[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');

  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const handleCreateNormal = async (e: React.FormEvent) => {
    e.preventDefault();
    setNormalError('');
    setNormalSuccess('');
    if (!normalUsername.trim() || !normalNickname.trim() || !normalEmail.trim() || !normalPassword) {
      setNormalError('Preencha todos os campos.');
      return;
    }
    if (normalPassword.length < 6) {
      setNormalError('Senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (normalPassword !== normalConfirmPassword) {
      setNormalError('As senhas não coincidem.');
      return;
    }
    setNormalLoading(true);
    try {
      await api.post('/admin/create-user', {
        username: normalUsername.trim(),
        nickname: normalNickname.trim(),
        email: normalEmail.trim().toLowerCase(),
        password: normalPassword,
      });
      setNormalSuccess(`Conta normal "${normalNickname}" criada. O jogador pode acessar pelo /login.`);
      setNormalUsername('');
      setNormalNickname('');
      setNormalEmail('');
      setNormalPassword('');
      setNormalConfirmPassword('');
    } catch (err: any) {
      setNormalError(err.response?.data?.message || 'Erro ao criar conta.');
    } finally {
      setNormalLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAdminSuccess('');
    if (!adminUsername.trim() || !adminNickname.trim() || !adminPassword) {
      setAdminError('Preencha login, nick e senha.');
      return;
    }
    if (adminPassword.length < 6) {
      setAdminError('Senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setAdminLoading(true);
    try {
      await api.post('/admin/create-admin', {
        username: adminUsername.trim(),
        nickname: adminNickname.trim(),
        password: adminPassword,
        allowedTabs: adminTabs,
      });
      setAdminSuccess(`Conta Admin "${adminNickname}" criada. O admin pode acessar pelo /login.`);
      setAdminUsername('');
      setAdminNickname('');
      setAdminPassword('');
      setAdminTabs([]);
    } catch (err: any) {
      setAdminError(err.response?.data?.message || 'Erro ao criar conta admin.');
    } finally {
      setAdminLoading(false);
    }
  };

  const toggleAdminTab = (id: string) => {
    setAdminTabs((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen p-6 sm:p-8 relative z-10">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin')}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
              title="Voltar"
            >
              ←
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Criar conta
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Conta normal (jogador) ou conta admin
              </p>
            </div>
          </div>
        </motion.div>

        {/* Abas: Conta normal | Conta admin */}
        <div className="flex rounded-xl bg-black/30 border border-white/10 p-1 mb-6">
          <button
            type="button"
            onClick={() => setTab('normal')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              tab === 'normal'
                ? 'bg-white/15 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            👤 Conta normal
          </button>
          {user.role === 'MASTER' && (
            <button
              type="button"
              onClick={() => setTab('admin')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                tab === 'admin'
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👑 Conta admin
            </button>
          )}
        </div>

        {tab === 'normal' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-slate-800/50 border border-white/10 p-5 sm:p-6"
          >
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <span>👤</span> Conta normal (jogador)
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Crie uma conta de jogador com email. O usuário já poderá logar sem verificar email.
            </p>
            <form onSubmit={handleCreateNormal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Login (usuário)</label>
                  <input
                    type="text"
                    value={normalUsername}
                    onChange={(e) => setNormalUsername(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                    placeholder="ex: jogador1"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Nick</label>
                  <input
                    type="text"
                    value={normalNickname}
                    onChange={(e) => setNormalNickname(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                    placeholder="ex: Jogador"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 text-xs font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={normalEmail}
                  onChange={(e) => setNormalEmail(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Senha (mín. 6)</label>
                  <input
                    type="password"
                    value={normalPassword}
                    onChange={(e) => setNormalPassword(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                    placeholder="••••••"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs font-medium mb-1">Confirmar senha</label>
                  <input
                    type="password"
                    value={normalConfirmPassword}
                    onChange={(e) => setNormalConfirmPassword(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                    placeholder="••••••"
                  />
                </div>
              </div>
              {normalError && <p className="text-red-300 text-sm">{normalError}</p>}
              {normalSuccess && <p className="text-green-300 text-sm">{normalSuccess}</p>}
              <button
                type="submit"
                disabled={normalLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              >
                {normalLoading ? 'Criando…' : 'Criar conta normal'}
              </button>
            </form>
          </motion.div>
        )}

        {tab === 'admin' && user.role === 'MASTER' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-amber-950/30 border border-amber-500/30 p-5 sm:p-6"
          >
            <h2 className="text-lg font-bold text-amber-200 mb-1 flex items-center gap-2">
              <span>👑</span> Conta admin
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              Crie um admin sem email: apenas login, senha e nick. Escolha quais abas do painel ele pode ver.
            </p>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-amber-200/90 text-xs font-medium mb-1">Login (usuário)</label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                    placeholder="ex: admin1"
                  />
                </div>
                <div>
                  <label className="block text-amber-200/90 text-xs font-medium mb-1">Nick</label>
                  <input
                    type="text"
                    value={adminNickname}
                    onChange={(e) => setAdminNickname(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                    placeholder="ex: Moderador"
                  />
                </div>
                <div>
                  <label className="block text-amber-200/90 text-xs font-medium mb-1">Senha (mín. 6)</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-black/30 border border-white/20 text-white text-sm placeholder-white/40"
                    placeholder="••••••"
                  />
                </div>
              </div>
              <div>
                <label className="block text-amber-200/90 text-xs font-medium mb-2">Abas que o admin pode ver</label>
                <div className="flex flex-wrap gap-2">
                  {ADMIN_TAB_OPTIONS.map((opt) => (
                    <label key={opt.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={adminTabs.includes(opt.id)}
                        onChange={() => toggleAdminTab(opt.id)}
                        className="rounded border-amber-500/50 bg-black/30 text-amber-500"
                      />
                      <span className="text-white/90 text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {adminError && <p className="text-red-300 text-sm">{adminError}</p>}
              {adminSuccess && <p className="text-green-300 text-sm">{adminSuccess}</p>}
              <button
                type="submit"
                disabled={adminLoading}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-black disabled:opacity-50"
              >
                {adminLoading ? 'Criando…' : 'Criar conta Admin'}
              </button>
            </form>
          </motion.div>
        )}

        <div className="mt-6">
          <button
            onClick={() => navigate('/admin')}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
          >
            ← Voltar ao painel
          </button>
        </div>
      </div>
    </div>
  );
}
