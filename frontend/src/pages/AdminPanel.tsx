import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import ResetAllAccountsModal from '../components/admin/ResetAllAccountsModal';

const STORAGE_KEY = 'admin-panel-cards-order';

const defaultCards: { id: string; label: string; icon: string; description: string; route: string; bg: string; iconBg: string; accent: string }[] = [
  { id: 'create-account', label: 'Criar conta', icon: '➕', description: 'Criar conta normal ou admin', route: '/admin/create-account', bg: 'bg-emerald-900/40', iconBg: 'bg-emerald-500/30', accent: 'border-l-emerald-500' },
  { id: 'admin-control', label: 'Controle de Admins', icon: '🛡️', description: 'Definir quais abas cada admin pode ver', route: '/admin/admin-control', bg: 'bg-slate-800/90', iconBg: 'bg-slate-500/30', accent: 'border-l-slate-400' },
  { id: 'site-tabs', label: 'Gerenciar Abas', icon: '🔧', description: 'Ativar/desativar abas do site', route: '/admin/site-tabs', bg: 'bg-slate-800/90', iconBg: 'bg-amber-500/20', accent: 'border-l-amber-500' },
  { id: 'cards', label: 'Cartas', icon: '🎴', description: 'Gerenciar cartas do jogo', route: '/admin/cartas', bg: 'bg-purple-900/40', iconBg: 'bg-purple-500/30', accent: 'border-l-purple-500' },
  { id: 'initial-decks', label: 'Decks Iniciais', icon: '📚', description: 'Decks iniciais para novos jogadores', route: '/admin/initial-decks', bg: 'bg-violet-900/40', iconBg: 'bg-violet-500/30', accent: 'border-l-purple-500' },
  { id: 'news', label: 'Notícias', icon: '📢', description: 'Notícias e avisos do site', route: '/admin/news', bg: 'bg-fuchsia-900/30', iconBg: 'bg-fuchsia-500/30', accent: 'border-l-purple-500' },
  { id: 'playmats', label: 'Playmats', icon: '🎨', description: 'Tapetes de duelo', route: '/admin/playmats', bg: 'bg-cyan-900/40', iconBg: 'bg-cyan-500/30', accent: 'border-l-cyan-500' },
  { id: 'sleeves', label: 'Skins', icon: '🎭', description: 'Skins de cartas', route: '/admin/sleeves', bg: 'bg-teal-900/40', iconBg: 'bg-teal-500/30', accent: 'border-l-cyan-500' },
  { id: 'talismans', label: 'Talismãs', icon: '✨', description: 'Criar e gerenciar talismãs da loja', route: '/admin/talismans', bg: 'bg-amber-900/40', iconBg: 'bg-amber-500/30', accent: 'border-l-amber-500' },
  { id: 'promotions', label: 'Promoções', icon: '🏷️', description: 'Promoções e descontos nas cartas da loja', route: '/admin/promotions', bg: 'bg-rose-900/40', iconBg: 'bg-rose-500/30', accent: 'border-l-rose-500' },
  { id: 'players', label: 'Jogadores', icon: '👤', description: 'Usuários e perfis', route: '/admin/players', bg: 'bg-blue-900/40', iconBg: 'bg-blue-500/30', accent: 'border-l-blue-500' },
  { id: 'arena', label: 'Arena', icon: '🏟️', description: 'Arenas e agendamentos', route: '/admin/arena', bg: 'bg-indigo-900/40', iconBg: 'bg-indigo-500/30', accent: 'border-l-blue-500' },
  { id: 'active-duels', label: 'Duelos Ativos', icon: '⚔️', description: 'Listar e excluir duelos em andamento', route: '/admin/active-duels', bg: 'bg-sky-900/40', iconBg: 'bg-sky-500/30', accent: 'border-l-blue-500' },
  { id: 'random-duel-level-ranges', label: 'Random Duel', icon: '🎲', description: 'Faixas de nível do matchmaking', route: '/admin/random-duel-level-ranges', bg: 'bg-slate-700/80', iconBg: 'bg-slate-500/30', accent: 'border-l-blue-500' },
  { id: 'tournaments', label: 'Torneios', icon: '🏆', description: 'Criar e gerenciar torneios', route: '/admin/tournaments', bg: 'bg-amber-900/40', iconBg: 'bg-amber-500/30', accent: 'border-l-yellow-500' },
  { id: 'seasons', label: 'Seasons', icon: '📅', description: 'Temporadas do ranking', route: '/admin/seasons', bg: 'bg-yellow-900/40', iconBg: 'bg-yellow-500/30', accent: 'border-l-yellow-500' },
  { id: 'divisions', label: 'Divisões', icon: '📊', description: 'Divisões do ranking', route: '/admin/divisions', bg: 'bg-orange-900/30', iconBg: 'bg-orange-500/30', accent: 'border-l-yellow-500' },
  { id: 'achievements', label: 'Conquistas', icon: '⭐', description: 'Enviar conquistas aos usuários', route: '/admin/achievements', bg: 'bg-rose-900/30', iconBg: 'bg-rose-500/30', accent: 'border-l-yellow-500' },
  { id: 'messages', label: 'Mensagens', icon: '✉️', description: 'Mensagens em massa', route: '/admin/messages', bg: 'bg-pink-900/30', iconBg: 'bg-pink-500/30', accent: 'border-l-emerald-500' },
  { id: 'social-media', label: 'Redes Sociais', icon: '📱', description: 'Links das redes sociais', route: '/admin/social-media', bg: 'bg-emerald-900/40', iconBg: 'bg-emerald-500/30', accent: 'border-l-emerald-500' },
  { id: 'new-account-settings', label: 'Contas Novas', icon: '⚙️', description: 'Cash, créditos e decks iniciais', route: '/admin/new-account-settings', bg: 'bg-slate-700/80', iconBg: 'bg-slate-400/30', accent: 'border-l-emerald-500' },
  { id: 'cash-division', label: 'Divisão de Cash', icon: '💰', description: 'Divisão automática de cash dos grupos', route: '/admin/cash-division', bg: 'bg-green-900/40', iconBg: 'bg-green-500/30', accent: 'border-l-emerald-500' },
];

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultCards.map((c) => c.id);
    const parsed = JSON.parse(raw) as string[];
    const ids = new Set(defaultCards.map((c) => c.id));
    const ordered = parsed.filter((id) => ids.has(id));
    const missing = defaultCards.map((c) => c.id).filter((id) => !ordered.includes(id));
    return [...ordered, ...missing];
  } catch {
    return defaultCards.map((c) => c.id);
  }
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch (_) {}
}

export default function AdminPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [showResetModal, setShowResetModal] = useState(false);
  const [order, setOrder] = useState<string[]>(() => loadOrder());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    saveOrder(order);
  }, [order]);

  const orderedCards = useMemo(() => {
    const byId = new Map(defaultCards.map((c) => [c.id, c]));
    return order.map((id) => byId.get(id)).filter(Boolean) as typeof defaultCards;
  }, [order]);

  const visibleCards = useMemo(() => {
    if (!user) return [];
    if (user.role === 'MASTER') return orderedCards;
    const allowed = user.adminAllowedTabs;
    if (allowed == null || allowed === undefined) return orderedCards;
    return orderedCards.filter((c) => c.id !== 'admin-control' && allowed.includes(c.id));
  }, [user, orderedCards]);

  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    (e.target as HTMLElement).style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    (e.target as HTMLElement).style.opacity = '1';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (dropIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (Number.isNaN(dragIndex) || dragIndex === dropIndex) return;
    setOrder((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, removed);
      return next;
    });
  };

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen p-6 sm:p-8 relative z-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 flex flex-wrap items-end justify-between gap-4"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center text-3xl shadow-inner">
              ⚙️
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Painel Administrativo
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Gerenciamento completo do sistema
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/20">
            <span className="text-lg">👑</span>
            <span className="text-amber-300 font-semibold text-sm">
              {user.role === 'MASTER' ? 'MASTER' : 'ADMIN'}
            </span>
          </div>
        </motion.div>

        {/* Lista de abas do painel */}
        <div className="rounded-2xl bg-black/20 border border-white/5 p-4 sm:p-5">
          {user?.role === 'MASTER' && (
            <p className="text-slate-400 text-xs mb-4 flex items-center gap-2">
              <span className="text-slate-500">⋮⋮</span> Arraste pelo ícone para mudar a ordem
            </p>
          )}
          {visibleCards.length === 0 && user?.role === 'ADMIN' && (
            <p className="text-amber-200/80 text-sm py-4">Nenhuma aba liberada para sua conta. Peça ao Master para definir suas permissões.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleCards.map((card) => {
              const orderIndex = order.indexOf(card.id);
              return (
              <motion.div
                key={card.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(orderIndex * 0.02, 0.3) }}
                className={`
                  group relative ${card.bg} border border-white/10 rounded-xl
                  shadow-md hover:shadow-xl hover:shadow-black/20
                  border-l-4 ${card.accent}
                  transition-all duration-200 overflow-hidden
                  hover:border-white/20 hover:brightness-110
                  ${draggedIndex === orderIndex ? 'opacity-60 ring-2 ring-white/30' : ''}
                `}
                onDragOver={handleDragOver}
                onDrop={handleDrop(orderIndex)}
              >
                <div className="p-5 sm:p-6 flex items-center gap-4">
                  {user?.role === 'MASTER' ? (
                    <div
                      draggable
                      onDragStart={handleDragStart(orderIndex)}
                      onDragEnd={handleDragEnd}
                      className="flex-shrink-0 w-10 h-14 rounded-lg flex items-center justify-center text-slate-400 hover:text-white cursor-grab active:cursor-grabbing hover:bg-white/10 transition-colors touch-none"
                      title="Arraste para reordenar"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-xl leading-none select-none">⋮⋮</span>
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-10 h-14 rounded-lg flex items-center justify-center text-slate-500">
                      <span className="text-xl">⋮⋮</span>
                    </div>
                  )}
                  <div
                    className="min-w-0 flex-1 cursor-pointer flex items-center gap-4"
                    onClick={() => navigate(card.route)}
                  >
                    <div className={`flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-2xl ${card.iconBg} ring-1 ring-white/10`}>
                      {card.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white text-base mb-1 group-hover:text-white">
                        {card.label}
                      </h3>
                      <p className="text-slate-400 text-sm leading-snug">
                        {card.description}
                      </p>
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all text-xl pointer-events-none">→</span>
                </div>
              </motion.div>
            );
            })}
          </div>
        </div>

        {/* Área de Ações Perigosas */}
        {user?.role === 'MASTER' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-10 p-5 rounded-2xl bg-red-950/40 border border-red-500/30"
          >
            <h3 className="text-lg font-bold text-red-300 mb-2 flex items-center gap-2">
              <span className="text-xl">⚠️</span> Ações Perigosas
            </h3>
            <p className="text-red-200/90 text-sm mb-4">
              Estas ações são irreversíveis e afetam todo o sistema.
            </p>
            <button
              onClick={() => setShowResetModal(true)}
              className="px-5 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors border border-red-500/50"
            >
              🔄 Resetar Todas as Contas
            </button>
          </motion.div>
        )}

        {/* Botão Voltar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-10 flex justify-center"
        >
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
          >
            ← Voltar ao Início
          </button>
        </motion.div>
      </div>

      {/* Modal de Reset */}
      <ResetAllAccountsModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        onSuccess={() => {
          setShowResetModal(false);
          // Opcional: mostrar notificação de sucesso
        }}
      />
    </div>
  );
}
