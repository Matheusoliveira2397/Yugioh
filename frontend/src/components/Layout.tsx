import { ReactNode, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/axios';
import { motion, AnimatePresence } from 'framer-motion';

interface LayoutProps {
  children: ReactNode;
}

interface ActiveDuel {
  id: string;
  player1: {
    id: number;
    nickname: string;
    username: string;
    clanTag?: string;
  };
  player2: {
    id: number;
    nickname: string;
    username: string;
    clanTag?: string;
  };
  player1LifePoints: number;
  player2LifePoints: number;
  currentTurn: number;
  status: string;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [activeDuels, setActiveDuels] = useState<ActiveDuel[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [checkingDuels, setCheckingDuels] = useState(false);

  // Verificar duelos ativos - DESABILITADO TEMPORARIAMENTE para evitar travamentos
  // TODO: Reabilitar quando o problema de performance for resolvido
  useEffect(() => {
    if (!user) return;
    
    // Desabilitado temporariamente - não verificar duelos ativos automaticamente
    // O usuário pode verificar manualmente na página de duelos ativos
    setActiveDuels([]);
    setShowNotification(false);
    
    // Código comentado para referência futura:
    /*
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const checkActiveDuels = async () => {
      try {
        setCheckingDuels(true);
        
        // Timeout de segurança no frontend (20 segundos - aumentado para evitar problemas com WebSocket)
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Timeout')), 20000);
        });

        const response = await Promise.race([
          api.get('/duels/my-active-duels', { timeout: 20000 }),
          timeoutPromise
        ]) as any;

        if (timeoutId) clearTimeout(timeoutId);

        if (!isMounted) return;

        const duels = response?.data || [];
        
        if (Array.isArray(duels) && duels.length > 0) {
          setActiveDuels(duels);
          setShowNotification(true);
        } else {
          setActiveDuels([]);
          setShowNotification(false);
        }
      } catch (error: any) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!isMounted) return;
        
        // Silenciosamente falhar
        console.warn('⚠️ Não foi possível verificar duelos ativos:', error?.message || error);
        setActiveDuels([]);
        setShowNotification(false);
      } finally {
        if (isMounted) {
          setCheckingDuels(false);
        }
      }
    };

    // Verificar apenas uma vez após 5 segundos (delay maior)
    setTimeout(() => {
      if (isMounted) {
        checkActiveDuels();
      }
    }, 5000);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
    */
  }, [user]);

  const getOpponent = (duel: ActiveDuel) => {
    if (!user) return null;
    return duel.player1.id === user.id ? duel.player2 : duel.player1;
  };

  const isMyTurn = (duel: ActiveDuel) => {
    if (!user) return false;
    const isPlayer1 = duel.player1.id === user.id;
    return (isPlayer1 && duel.currentTurn === 1) || (!isPlayer1 && duel.currentTurn === 2);
  };

  const getMyLifePoints = (duel: ActiveDuel) => {
    if (!user) return 0;
    return duel.player1.id === user.id ? duel.player1LifePoints : duel.player2LifePoints;
  };

  const getOpponentLifePoints = (duel: ActiveDuel) => {
    if (!user) return 0;
    return duel.player1.id === user.id ? duel.player2LifePoints : duel.player1LifePoints;
  };

  return (
    <div className="min-h-screen bg-gray-900 relative">
      {/* Background Image */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat z-0"
        style={{
          backgroundImage: 'url(/images/backgroundLogin.jpg)',
        }}
      />
      {/* Overlay escuro para melhorar legibilidade */}
      <div className="fixed inset-0 bg-black bg-opacity-60 z-0"></div>
      
      {/* Card Lateral Direito - Perfil do Usuário */}
      <aside className="fixed right-0 top-0 h-screen w-80 z-50 overflow-y-auto" style={{ backgroundColor: 'transparent' }}>
        <div className="p-6" style={{ backgroundColor: 'transparent' }}>
          {/* Header com Avatar */}
          <div className="mb-6">
            <div className="flex flex-col items-center gap-3 mb-4 relative">
              <div className="flex flex-col items-center gap-2">
                <Link to={`/profile/${user?.id || ''}`} className="group relative">
                  <div className="w-28 h-28 rounded-xl overflow-hidden border-3 border-purple-500 shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
                    <img
                      src={`http://localhost:3000${user?.profileImage}?t=${Date.now()}`}
                      alt={user?.nickname}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/images/default.png';
                      }}
                    />
                  </div>
                  {/* Badge Online */}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-3 border-slate-900 shadow-lg">
                    <div className="w-full h-full bg-green-400 rounded-full animate-ping opacity-75"></div>
                  </div>
                </Link>

                <h3 className="text-xl font-bold text-white text-center">
                  {user?.clanTag ? `|${user.clanTag}| ${user.nickname}` : user?.nickname}
                </h3>
              </div>

              {/* Sino de notificação */}
              <button className="absolute top-0 right-0 p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            </div>
          </div>

          {/* Recursos */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="flex flex-col items-center">
              <span className="text-3xl mb-1">💵</span>
              <p className="text-green-400 font-bold text-xl">{(user?.cash || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400">Cash</p>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-3xl mb-1">�</span>
              <p className="text-cyan-400 font-bold text-xl">{(user?.credits || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400">Crédito</p>
            </div>
          </div>

          {/* Estatísticas Detalhadas */}
          <div className="space-y-2.5 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>⭐</span> Nível
              </span>
              <span className="text-base font-bold text-white">{user?.level || 1}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>📊</span> Score Season
              </span>
              <span className="text-base font-bold text-cyan-400">{user?.seasonScore?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>🏆</span> Score Geral
              </span>
              <span className="text-base font-bold text-yellow-400">{user?.totalScore?.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>📈</span> Ranking Season
              </span>
              <span className="text-base font-bold text-purple-400">{user?.seasonRank || '-'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>🎖️</span> Ranking Geral
              </span>
              <span className="text-base font-bold text-orange-400">{user?.globalRank || '-'}°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>🏅</span> Divisão
              </span>
              <span className="text-base font-bold text-cyan-400">{user?.division || 'Bronze'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>📈</span> V/D (Geral)
              </span>
              <span className="text-base font-bold text-white">
                <span className="text-green-400">{user?.winsGeral || 0}</span> / <span className="text-red-400">{user?.lossesGeral || 0}</span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>⚡</span> V/D (Season)
              </span>
              <span className="text-base font-bold text-white">
                <span className="text-green-400">{user?.winsSeason || 0}</span> / <span className="text-red-400">{user?.lossesSeason || 0}</span>
              </span>
            </div>
            {user?.group && (
              <Link to={`/groups/${user.group.id}`} className="flex justify-between items-center hover:bg-slate-700/30 -mx-2 px-2 py-1 rounded transition-colors">
                <span className="text-sm text-slate-300 flex items-center gap-2">
                  <span>👥</span> Clã
                </span>
                <span className="text-base font-bold text-cyan-400">[{user.group.tag}] {user.group.name}</span>
              </Link>
            )}
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-2 mb-4">
            <Link to={`/profile/${user?.id || ''}`} className="flex-1">
              <button className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Perfil
              </button>
            </Link>
            <button 
              onClick={logout}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sair
            </button>
          </div>

          {/* Botão Admin (apenas para ADMIN/MASTER) */}
          {(user?.role === 'ADMIN' || user?.role === 'MASTER') && (
            <Link to="/admin" className="block mb-4">
              <button className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-bold py-3 rounded-lg transition-all shadow-lg hover:shadow-yellow-500/50 flex items-center justify-center gap-2">
                <span className="text-xl">👑</span>
                <span>Painel Admin</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </Link>
          )}

          {/* Card Organize seu Deck */}
          <Link 
            to="/deck-builder"
            className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-purple-500/50 transition-all duration-300 hover:scale-[1.02] mb-4"
          >
            <img
              src="/images/decks/deck.png"
              alt="Organize seu deck"
              className="w-full h-24 object-contain"
            />
            {/* Overlay com texto */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-3">
              <h3 className="text-white font-bold text-sm">Organize seu deck</h3>
              <p className="text-slate-300 text-xs">Crie e edite seus baralhos</p>
            </div>
            {/* Efeito hover */}
            <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/20 transition-all duration-300"></div>
          </Link>

          {/* Card Inventário */}
          <Link 
            to="/inventory"
            className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-teal-500/50 transition-all duration-300 hover:scale-[1.02]"
          >
            <img
              src="/images/inventario.png"
              alt="Inventário"
              className="w-full h-24 object-contain"
            />
            {/* Overlay com texto */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-3">
              <h3 className="text-white font-bold text-sm">Inventário</h3>
              <p className="text-slate-300 text-xs">Gerencie suas cartas</p>
            </div>
            {/* Efeito hover */}
            <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/20 transition-all duration-300"></div>
          </Link>

          {/* Card Amigos */}
          <Link 
            to="/friends"
            className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-pink-500/50 transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="w-full h-24 flex items-center justify-center">
              <span className="text-6xl">👥</span>
            </div>
            {/* Overlay com texto */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col justify-end p-3">
              <h3 className="text-white font-bold text-sm">Amigos</h3>
              <p className="text-slate-300 text-xs">Chat e convites</p>
            </div>
            {/* Efeito hover */}
            <div className="absolute inset-0 bg-pink-600/0 group-hover:bg-pink-600/20 transition-all duration-300"></div>
          </Link>
        </div>
      </aside>

      {/* Notificação de Duelos Ativos */}
      <AnimatePresence>
        {showNotification && activeDuels.length > 0 && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-red-600 to-red-700 text-white shadow-2xl"
          >
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-3xl animate-pulse">⚔️</div>
                  <div>
                    <h3 className="font-bold text-lg">
                      {activeDuels.length === 1 
                        ? 'Você tem 1 duelo ativo!' 
                        : `Você tem ${activeDuels.length} duelos ativos!`}
                    </h3>
                    {activeDuels.length === 1 && (
                      <p className="text-sm text-red-100">
                        vs {getOpponent(activeDuels[0])?.clanTag ? `|${getOpponent(activeDuels[0])?.clanTag}| ` : ''}
                        {getOpponent(activeDuels[0])?.nickname || getOpponent(activeDuels[0])?.username}
                        {isMyTurn(activeDuels[0]) && ' - Seu Turno!'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {activeDuels.length === 1 ? (
                    <>
                      <div className="text-sm bg-red-800/50 px-3 py-1 rounded">
                        <span className="text-green-300">Você: {getMyLifePoints(activeDuels[0])} LP</span>
                        {' | '}
                        <span className="text-red-300">Oponente: {getOpponentLifePoints(activeDuels[0])} LP</span>
                      </div>
                      <button
                        onClick={() => {
                          navigate(`/duel/${activeDuels[0].id}`);
                          setShowNotification(false);
                        }}
                        className="bg-white text-red-600 hover:bg-gray-100 font-bold px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <span>▶</span>
                        Entrar no Duelo
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        navigate('/active-duels');
                        setShowNotification(false);
                      }}
                      className="bg-white text-red-600 hover:bg-gray-100 font-bold px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <span>Ver Todos</span>
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotification(false)}
                    className="text-white hover:text-gray-200 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conteúdo Principal */}
      <div className="mr-80 relative z-10">
        <nav className={`border-b-2 border-purple-600/50 relative ${showNotification && activeDuels.length > 0 ? 'mt-16' : ''}`}>
          <div className="w-full pl-0 pr-4">
            {/* Linha Principal - Todos os links na mesma linha */}
            <div className="flex justify-between items-center h-16 gap-2 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-4 ml-0 flex-shrink-0">
                <Link 
                  to="/" 
                  className="hover:scale-105 transition-transform"
                >
                  <img 
                    src="/images/yugioh.webp" 
                    alt="Yu-Gi-Oh!" 
                    className="h-20 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </Link>
              </div>
              
              <div className="flex items-center gap-1 flex-wrap justify-end flex-1">
                <Link to="/" className="flex items-center gap-1 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-all text-sm whitespace-nowrap">
                  🏠 <span className="font-semibold">Home</span>
                </Link>
                
                <Link to="/chat" className="flex items-center gap-1 px-3 py-2 rounded-lg text-gray-300 hover:bg-blue-700 hover:text-white transition-all text-sm whitespace-nowrap">
                  💬 <span className="font-semibold">Chat</span>
                </Link>
              <Link 
                to="/random-duel" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-red-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                🎲 <span className="font-semibold">Random Duel</span>
              </Link>
              
              <Link 
                to="/arena" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-red-800/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                ⚔️ <span className="font-semibold">Arena</span>
              </Link>
              
              <Link 
                to="/tournaments" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-yellow-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                🏆 <span className="font-semibold">Torneios</span>
              </Link>
              
              <Link 
                to="/groups" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-cyan-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                👥 <span className="font-semibold">Clãs</span>
              </Link>
              
              <Link 
                to="/ranking" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-orange-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                📊 <span className="font-semibold">Ranking</span>
              </Link>
              
              <Link 
                to="/missions" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-green-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                🎯 <span className="font-semibold">Missões</span>
              </Link>
              
              <Link 
                to="/drops" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-indigo-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                � <span className="font-semibold">Drops</span>
              </Link>
              
              <Link 
                to="/shop" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-purple-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                🛒 <span className="font-semibold">Loja</span>
              </Link>
              
              <Link 
                to="/marketplace/accounts" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-pink-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                � <span className="font-semibold">Contas</span>
              </Link>
              
              <Link 
                to="/marketplace/cards" 
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:bg-rose-700/80 hover:text-white transition-all text-sm whitespace-nowrap"
              >
                💳 <span className="font-semibold">Cartas</span>
              </Link>
              </div>
            </div>
          </div>
        </nav>
        
        {/* Imagem Reliquia abaixo da linha */}
        <div className="absolute left-0 top-[66px] mt-2 z-20">
          <img 
            src="/images/reliquia.png" 
            alt="Relíquia" 
            className="h-16 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        <main className="pb-8">{children}</main>
        
        {/* Footer */}
        <footer className="border-t border-gray-700/50 py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
            <p>© 2025 Yu-Gi-Oh! Duel Arena - Todos os direitos reservados</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
