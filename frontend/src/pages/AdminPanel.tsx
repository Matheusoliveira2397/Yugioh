import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import ResetAllAccountsModal from '../components/admin/ResetAllAccountsModal';

const STORAGE_KEY = 'admin-panel-cards-order';

type AdminCard = { id: string; label: string; icon: string; description: string; route: string; bg: string; iconBg: string; accent: string };

const defaultCards: AdminCard[] = [
  { id: 'loot-boxes', label: 'Pacotes de Cartas', icon: '🎴', description: 'Chances por raridade, créditos e drops por abertura', route: '/admin/loot-boxes', bg: 'bg-purple-900/40', iconBg: 'bg-purple-500/30', accent: 'border-l-purple-500' },
  { id: 'bots', label: 'Bots', icon: '🤖', description: 'Criar bots, definir decks, níveis e programação', route: '/admin/bots', bg: 'bg-indigo-900/40', iconBg: 'bg-indigo-500/30', accent: 'border-l-indigo-500' },
  { id: 'create-account', label: 'Criar conta', icon: '➕', description: 'Criar conta normal ou admin', route: '/admin/create-account', bg: 'bg-emerald-900/40', iconBg: 'bg-emerald-500/30', accent: 'border-l-emerald-500' },
  { id: 'admin-control', label: 'Controle de Admins', icon: '🛡️', description: 'Definir quais abas cada admin pode ver', route: '/admin/admin-control', bg: 'bg-slate-800/90', iconBg: 'bg-slate-500/30', accent: 'border-l-slate-400' },
  { id: 'site-tabs', label: 'Gerenciar Abas', icon: '🔧', description: 'Ativar/desativar abas do site', route: '/admin/site-tabs', bg: 'bg-slate-800/90', iconBg: 'bg-amber-500/20', accent: 'border-l-amber-500' },
  { id: 'cards', label: 'Cartas', icon: '🎴', description: 'Gerenciar cartas do jogo', route: '/admin/cartas', bg: 'bg-purple-900/40', iconBg: 'bg-purple-500/30', accent: 'border-l-purple-500' },
  { id: 'card-effects', label: 'Efeitos OK', icon: '✅', description: 'Arrastar cartas ativas com efeito correto', route: '/admin/cartas/efeitos', bg: 'bg-emerald-900/40', iconBg: 'bg-emerald-500/30', accent: 'border-l-emerald-400' },
  { id: 'card-ownership', label: 'Posse de cartas', icon: '👥', description: 'Quantas pessoas têm cada carta', route: '/admin/card-ownership', bg: 'bg-purple-900/30', iconBg: 'bg-purple-500/20', accent: 'border-l-purple-400' },
  { id: 'initial-decks', label: 'Decks Iniciais', icon: '📚', description: 'Decks iniciais para novos jogadores', route: '/admin/initial-decks', bg: 'bg-violet-900/40', iconBg: 'bg-violet-500/30', accent: 'border-l-purple-500' },
  { id: 'news', label: 'Notícias', icon: '📢', description: 'Notícias e avisos do site', route: '/admin/news', bg: 'bg-fuchsia-900/30', iconBg: 'bg-fuchsia-500/30', accent: 'border-l-purple-500' },
  { id: 'patch-notes', label: 'Patch Notes', icon: '📋', description: 'Correções, cartas e atualizações do jogo', route: '/admin/patch-notes', bg: 'bg-indigo-900/30', iconBg: 'bg-indigo-500/30', accent: 'border-l-indigo-400' },
  { id: 'playmats', label: 'Playmats', icon: '🎨', description: 'Tapetes de duelo', route: '/admin/playmats', bg: 'bg-cyan-900/40', iconBg: 'bg-cyan-500/30', accent: 'border-l-cyan-500' },
  { id: 'sleeves', label: 'Sleeves', icon: '🎭', description: 'Sleeves (fundo de carta)', route: '/admin/sleeves', bg: 'bg-teal-900/40', iconBg: 'bg-teal-500/30', accent: 'border-l-cyan-500' },
  { id: 'talismans', label: 'Talismãs', icon: '✨', description: 'Criar e gerenciar talismãs da loja', route: '/admin/talismans', bg: 'bg-amber-900/40', iconBg: 'bg-amber-500/30', accent: 'border-l-amber-500' },
  { id: 'briefcases', label: 'Maletas', icon: '🧳', description: 'Criar e gerenciar maletas (limites de decks e cartas)', route: '/admin/briefcases', bg: 'bg-amber-900/40', iconBg: 'bg-amber-500/30', accent: 'border-l-amber-400' },
  { id: 'promotions', label: 'Promoções', icon: '🏷️', description: 'Promoções e descontos nas cartas da loja', route: '/admin/promotions', bg: 'bg-rose-900/40', iconBg: 'bg-rose-500/30', accent: 'border-l-rose-500' },
  { id: 'players', label: 'Jogadores', icon: '👤', description: 'Usuários e perfis', route: '/admin/players', bg: 'bg-blue-900/40', iconBg: 'bg-blue-500/30', accent: 'border-l-blue-500' },
  { id: 'arena', label: 'Arena', icon: '🏟️', description: 'Arenas e agendamentos', route: '/admin/arena', bg: 'bg-indigo-900/40', iconBg: 'bg-indigo-500/30', accent: 'border-l-blue-500' },
  { id: 'active-duels', label: 'Duelos Ativos', icon: '⚔️', description: 'Listar e excluir duelos em andamento', route: '/admin/active-duels', bg: 'bg-sky-900/40', iconBg: 'bg-sky-500/30', accent: 'border-l-blue-500' },
  { id: 'random-duel-level-ranges', label: 'Random Duel', icon: '🎲', description: 'Faixas de nível do matchmaking', route: '/admin/random-duel-level-ranges', bg: 'bg-slate-700/80', iconBg: 'bg-slate-500/30', accent: 'border-l-blue-500' },
  { id: 'anime-decks', label: 'Random Duel: Decks Anime', icon: '🎬', description: 'Decks pré-definidos para o modo Animes Deck', route: '/admin/anime-decks', bg: 'bg-slate-700/80', iconBg: 'bg-slate-500/30', accent: 'border-l-purple-500' },
  { id: 'duel-score-settings', label: 'Score por duelo', icon: '📈', description: 'Quanto de score o duelista ganha por tipo de duelo', route: '/admin/duel-score-settings', bg: 'bg-slate-700/80', iconBg: 'bg-slate-500/30', accent: 'border-l-amber-500' },
  { id: 'tournaments', label: 'Torneios', icon: '🏆', description: 'Criar e gerenciar torneios', route: '/admin/tournaments', bg: 'bg-amber-900/40', iconBg: 'bg-amber-500/30', accent: 'border-l-yellow-500' },
  { id: 'seasons', label: 'Seasons', icon: '📅', description: 'Temporadas do ranking', route: '/admin/seasons', bg: 'bg-yellow-900/40', iconBg: 'bg-yellow-500/30', accent: 'border-l-yellow-500' },
  { id: 'battle-pass', label: 'Passe de Batalha', icon: '🎖', description: 'Seasons do passe, níveis e recompensas grátis/premium', route: '/admin/battle-pass', bg: 'bg-amber-900/40', iconBg: 'bg-amber-500/30', accent: 'border-l-amber-400' },
  { id: 'missions', label: 'Missões', icon: '🎯', description: 'Abas de missões, objetivos e recompensas', route: '/admin/missions', bg: 'bg-orange-900/40', iconBg: 'bg-orange-500/30', accent: 'border-l-orange-400' },
  { id: 'divisions', label: 'Divisões', icon: '📊', description: 'Divisões do ranking', route: '/admin/divisions', bg: 'bg-orange-900/30', iconBg: 'bg-orange-500/30', accent: 'border-l-yellow-500' },
  { id: 'achievements', label: 'Conquistas', icon: '⭐', description: 'Enviar conquistas aos usuários', route: '/admin/achievements', bg: 'bg-rose-900/30', iconBg: 'bg-rose-500/30', accent: 'border-l-yellow-500' },
  { id: 'messages', label: 'Mensagens', icon: '✉️', description: 'Mensagens em massa', route: '/admin/messages', bg: 'bg-pink-900/30', iconBg: 'bg-pink-500/30', accent: 'border-l-emerald-500' },
  { id: 'feedback', label: 'Feedback dos usuários', icon: '📬', description: 'Dúvidas, opiniões e sugestões dos jogadores', route: '/admin/feedback', bg: 'bg-indigo-900/40', iconBg: 'bg-indigo-500/30', accent: 'border-l-indigo-500' },
  { id: 'social-media', label: 'Redes Sociais', icon: '📱', description: 'Links das redes sociais', route: '/admin/social-media', bg: 'bg-emerald-900/40', iconBg: 'bg-emerald-500/30', accent: 'border-l-emerald-500' },
  { id: 'new-account-settings', label: 'Contas Novas', icon: '⚙️', description: 'Cash, créditos e decks iniciais', route: '/admin/new-account-settings', bg: 'bg-slate-700/80', iconBg: 'bg-slate-400/30', accent: 'border-l-emerald-500' },
  { id: 'cash-division', label: 'Divisão de Cash', icon: '💰', description: 'Divisão automática de cash dos grupos', route: '/admin/cash-division', bg: 'bg-green-900/40', iconBg: 'bg-green-500/30', accent: 'border-l-emerald-500' },
  { id: 'credit-packages', label: 'Pacotes de crédito', icon: '💎', description: 'Pacotes exibidos em Comprar créditos', route: '/admin/credit-packages', bg: 'bg-teal-900/40', iconBg: 'bg-teal-500/30', accent: 'border-l-teal-400' },
  { id: 'promo-codes', label: 'Códigos de resgate', icon: '🎟', description: 'Gerar códigos ativos para contas resgatarem premiação', route: '/admin/promo-codes', bg: 'bg-violet-900/40', iconBg: 'bg-violet-500/30', accent: 'border-l-violet-400' },
  { id: 'payments', label: 'Pagamentos', icon: '💳', description: 'Adicionar créditos à conta e ver histórico', route: '/admin/payments', bg: 'bg-emerald-900/40', iconBg: 'bg-emerald-500/30', accent: 'border-l-emerald-500' },
];

const CATEGORIES: { key: string; label: string; ids: string[] }[] = [
  { key: 'contas', label: 'Contas e Acesso', ids: ['create-account', 'admin-control', 'site-tabs', 'new-account-settings'] },
  { key: 'cartas', label: 'Cartas e Decks', ids: ['cards', 'card-effects', 'card-ownership', 'initial-decks', 'loot-boxes'] },
  { key: 'loja', label: 'Loja e Cosméticos', ids: ['playmats', 'sleeves', 'talismans', 'briefcases', 'promotions'] },
  { key: 'comunicacao', label: 'Notícias e Comunicação', ids: ['news', 'patch-notes', 'messages', 'feedback', 'social-media'] },
  { key: 'jogadores', label: 'Jogadores', ids: ['players'] },
  { key: 'duelos', label: 'Duelos e Arena', ids: ['arena', 'active-duels', 'random-duel-level-ranges', 'bots', 'anime-decks', 'duel-score-settings'] },
  { key: 'torneios', label: 'Torneios', ids: ['tournaments'] },
  { key: 'ranking', label: 'Ranking e Temporadas', ids: ['seasons', 'battle-pass', 'missions', 'divisions', 'achievements'] },
  { key: 'economia', label: 'Economia', ids: ['cash-division', 'credit-packages', 'promo-codes', 'payments'] },
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

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export default function AdminPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [showResetModal, setShowResetModal] = useState(false);
  const [order, setOrder] = useState<string[]>(() => loadOrder());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    saveOrder(order);
  }, [order]);

  const orderedCards = useMemo(() => {
    const byId = new Map(defaultCards.map((c) => [c.id, c]));
    return order.map((id) => byId.get(id)).filter(Boolean) as AdminCard[];
  }, [order]);

  const visibleCards = useMemo(() => {
    if (!user) return [];
    if (user.role === 'MASTER') return orderedCards;
    const allowed = user.adminAllowedTabs;
    if (allowed == null || !Array.isArray(allowed) || allowed.length === 0) return [];
    return orderedCards.filter((c) => c.id !== 'admin-control' && c.id !== 'bots' && c.id !== 'loot-boxes' && allowed.includes(c.id));
  }, [user, orderedCards]);

  const filteredCards = useMemo(() => {
    if (!search.trim()) return visibleCards;
    const q = normalize(search.trim());
    return visibleCards.filter(
      (c) => normalize(c.label).includes(q) || normalize(c.description).includes(q)
    );
  }, [visibleCards, search]);

  const cardsByCategory = useMemo(() => {
    const byId = new Map(filteredCards.map((c) => [c.id, c]));
    return CATEGORIES.map((cat) => ({
      ...cat,
      cards: cat.ids.map((id) => byId.get(id)).filter(Boolean) as AdminCard[],
    })).filter((g) => g.cards.length > 0);
  }, [filteredCards]);

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
    <div className="min-h-screen p-4 sm:p-5 relative z-10">
      <div className="max-w-4xl mx-auto">
        {/* Header compacto */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-2xl">
              ⚙️
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Painel Admin
              </h1>
              <p className="text-slate-500 text-xs">
                {user.role === 'MASTER' ? 'MASTER' : 'ADMIN'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-300 font-semibold text-xs px-2 py-1 rounded bg-white/5 border border-white/10">
              {user.role === 'MASTER' ? '👑 MASTER' : 'ADMIN'}
            </span>
            <button
              onClick={() => navigate('/')}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
            >
              ← Início
            </button>
          </div>
        </motion.div>

        {/* Busca e lista de abas */}
        <div className="rounded-xl bg-black/20 border border-white/5 p-3 sm:p-4">
          {visibleCards.length > 0 && (
            <div className="mb-3">
              <label htmlFor="admin-search" className="sr-only">Buscar aba</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
                <input
                  id="admin-search"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar (ex: cartas, torneios)..."
                  className="w-full pl-8 pr-8 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded text-sm"
                    aria-label="Limpar busca"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="text-slate-500 text-[10px] mt-1">
                {filteredCards.length} {filteredCards.length === 1 ? 'aba' : 'abas'} {search ? '' : 'disponível(is)'}
              </p>
            </div>
          )}

          {user?.role === 'MASTER' && visibleCards.length > 0 && !search && (
            <p className="text-slate-500 text-[10px] mb-2">⋮⋮ Arraste para reordenar</p>
          )}

          {visibleCards.length === 0 && user?.role === 'ADMIN' && (
            <p className="text-amber-200/80 text-xs py-6 text-center">Nenhuma aba liberada. Peça ao Master para definir permissões.</p>
          )}

          {visibleCards.length > 0 && filteredCards.length === 0 && (
            <p className="text-slate-400 text-xs py-6 text-center">Nenhuma aba para &quot;{search}&quot;</p>
          )}

          {cardsByCategory.map((group) => (
            <section key={group.key} className="mb-4 last:mb-0">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <span className="w-0.5 h-3 rounded-full bg-white/30" />
                {group.label}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {group.cards.map((card) => {
                  const orderIndex = order.indexOf(card.id);
                  return (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(orderIndex * 0.01, 0.2) }}
                      className={`
                        group relative ${card.bg} border border-white/10 rounded-lg
                        shadow hover:shadow-md border-l-2 ${card.accent}
                        transition-all duration-150 overflow-hidden
                        hover:border-white/20 hover:brightness-105
                        ${draggedIndex === orderIndex ? 'opacity-60 ring-2 ring-white/30' : ''}
                      `}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop(orderIndex)}
                    >
                      <div className="p-2.5 flex items-center gap-2 min-h-0">
                        {user?.role === 'MASTER' ? (
                          <div
                            draggable
                            onDragStart={handleDragStart(orderIndex)}
                            onDragEnd={handleDragEnd}
                            className="flex-shrink-0 w-6 h-8 rounded flex items-center justify-center text-slate-400 hover:text-white cursor-grab active:cursor-grabbing hover:bg-white/10 text-xs touch-none"
                            title="Arraste para reordenar"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ⋮⋮
                          </div>
                        ) : (
                          <div className="flex-shrink-0 w-6 h-8 rounded flex items-center justify-center text-slate-500 text-xs">⋮⋮</div>
                        )}
                        <div
                          className="min-w-0 flex-1 cursor-pointer flex items-center gap-2"
                          onClick={() => navigate(card.route)}
                        >
                          <div className={`flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center text-base ${card.iconBg} ring-1 ring-white/10`}>
                            {card.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-white text-xs block truncate group-hover:text-white" title={card.description}>
                              {card.label}
                            </span>
                          </div>
                        </div>
                        <span className="flex-shrink-0 text-slate-500 group-hover:text-white text-sm">→</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Ações perigosas + Voltar compactos */}
        {user?.role === 'MASTER' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-3 rounded-xl bg-red-950/30 border border-red-500/20 flex flex-wrap items-center justify-between gap-2"
          >
            <div>
              <h3 className="text-sm font-bold text-red-300 flex items-center gap-1.5">⚠️ Ações Perigosas</h3>
              <p className="text-red-200/80 text-[10px]">Irreversíveis.</p>
            </div>
            <button
              onClick={() => setShowResetModal(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg border border-red-500/50"
            >
              Resetar contas
            </button>
          </motion.div>
        )}
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
