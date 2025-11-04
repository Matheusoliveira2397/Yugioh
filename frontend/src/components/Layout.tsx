import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore();

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Card Lateral Direito - Perfil do Usuário */}
      <aside className="fixed right-0 top-0 h-screen w-80 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-800 border-l-2 border-purple-600/50 shadow-2xl z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header com Avatar */}
          <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-xl p-4 mb-6 border border-slate-700/50">
            <div className="flex items-start gap-4 mb-4">
              <Link to="/profile" className="group relative">
                <div className="w-20 h-20 rounded-xl overflow-hidden border-3 border-purple-500 shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
                  <img
                    src={`http://localhost:3000${user?.profileImage}?t=${Date.now()}`}
                    alt={user?.nickname}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = '/avatars/default.png';
                    }}
                  />
                </div>
                {/* Badge Online */}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-3 border-slate-900 shadow-lg">
                  <div className="w-full h-full bg-green-400 rounded-full animate-ping opacity-75"></div>
                </div>
              </Link>

              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-1">{user?.nickname}</h3>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-400">⭐ Nível</span>
                  <span className="text-sm font-semibold text-cyan-400">{user?.level || 0}</span>
                </div>
                {/* Barra de Progresso de XP */}
                <div className="bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-cyan-500 transition-all duration-300"
                    style={{ 
                      width: `${(() => {
                        const level = user?.level || 0;
                        const currentXP = user?.experience || 0;
                        const xpForNextLevel = Math.floor(100 * Math.pow(1.5, level));
                        const previousLevelXP = level > 0 ? Math.floor(100 * Math.pow(1.5, level - 1)) : 0;
                        const xpInCurrentLevel = currentXP - previousLevelXP;
                        const xpNeededForLevel = xpForNextLevel - previousLevelXP;
                        return Math.min(100, Math.max(0, (xpInCurrentLevel / xpNeededForLevel) * 100));
                      })()}%` 
                    }}
                  ></div>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {(() => {
                    const level = user?.level || 0;
                    const currentXP = user?.experience || 0;
                    const xpForNextLevel = Math.floor(100 * Math.pow(1.5, level));
                    return `${currentXP} / ${xpForNextLevel} XP`;
                  })()}
                </p>
              </div>

              {/* Sino de notificação */}
              <button className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
            </div>
          </div>

          {/* Recursos */}
          <div className="grid grid-cols-2 gap-3 mb-6 bg-slate-800/50 rounded-lg p-4">
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
          <div className="space-y-2.5 bg-slate-800/50 rounded-lg p-4 mb-6">
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
            <Link to="/profile" className="flex-1">
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
            className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-purple-500/50 transition-all duration-300 hover:scale-[1.02] mb-4 bg-slate-900"
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
            className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-teal-500/50 transition-all duration-300 hover:scale-[1.02] bg-slate-900"
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
            className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-pink-500/50 transition-all duration-300 hover:scale-[1.02] bg-gradient-to-br from-purple-900/50 to-pink-900/50"
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

      {/* Conteúdo Principal */}
      <div className="mr-80">
        {/* Banner Topo */}
        <div className="w-full h-64 overflow-hidden border-b-2 border-purple-600/50 shadow-lg">
          <img
            src="/images/banners/banner.webp"
            alt="Yu-Gi-Oh Banner"
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error('Banner não carregou');
              e.currentTarget.style.display = 'none';
            }}
          />
          {/* Overlay para melhor contraste */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/20 pointer-events-none"></div>
        </div>

        <nav className="bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800 border-b-2 border-purple-600 shadow-lg">
          <div className="max-w-7xl mx-auto px-4">
            {/* Linha Principal */}
            <div className="flex justify-between items-center h-16">
              <Link 
                to="/" 
                className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent hover:scale-105 transition-transform"
              >
                ⚔️ Yu-Gi-Oh!
              </Link>
              
              <div className="flex items-center gap-1">
                <Link to="/" className="flex items-center gap-1 px-3 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-all text-sm">
                  🏠 <span className="font-semibold">Home</span>
                </Link>
                
                <Link to="/chat" className="flex items-center gap-1 px-3 py-2 rounded-lg text-gray-300 hover:bg-blue-700 hover:text-white transition-all text-sm">
                  💬 <span className="font-semibold">Chat</span>
                </Link>
              </div>
            </div>

            {/* Linha Secundária - Menu Completo */}
            <div className="flex items-center justify-center gap-1 pb-3 overflow-x-auto scrollbar-hide">
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
        </nav>

        <main className="pb-8">{children}</main>
        
        {/* Footer */}
        <footer className="bg-gray-800 border-t border-gray-700 py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
            <p>© 2025 Yu-Gi-Oh! Duel Arena - Todos os direitos reservados</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
