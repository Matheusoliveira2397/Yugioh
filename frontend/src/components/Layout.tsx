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
                  <span className="text-xs text-slate-400">🏆 Divisão</span>
                  <span className="text-sm font-semibold text-cyan-400">Diamante</span>
                </div>
                {/* Barra de Progresso */}
                <div className="bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full w-3/4 bg-gradient-to-r from-green-500 to-cyan-500"></div>
                </div>
                <p className="text-xs text-slate-400 mt-1">CARREGADO</p>
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
          <div className="flex justify-between items-center mb-6 bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🪙</span>
              <div>
                <p className="text-yellow-400 font-bold text-xl">{user?.gems.toLocaleString() || 0}</p>
                <p className="text-xs text-slate-400">Moedas</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">💎</span>
              <div>
                <p className="text-cyan-400 font-bold text-xl">23</p>
                <p className="text-xs text-slate-400">Gemas</p>
              </div>
            </div>
          </div>

          {/* Estatísticas Detalhadas */}
          <div className="space-y-2.5 bg-slate-800/50 rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>⭐</span> Nível
              </span>
              <span className="text-base font-bold text-white">{Math.floor((user?.rating || 0) / 200)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>📊</span> Score na Season
              </span>
              <span className="text-base font-bold text-white">0.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>🏆</span> Score Geral
              </span>
              <span className="text-base font-bold text-yellow-400">{user?.rating.toLocaleString() || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>🏅</span> Divisão
              </span>
              <span className="text-base font-bold text-cyan-400">Diamante</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>📈</span> Ranking Geral
              </span>
              <span className="text-base font-bold text-orange-400">14°</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>⚔️</span> V/D (Season)
              </span>
              <span className="text-base font-bold text-white">{user?.wins || 0} / {user?.losses || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-300 flex items-center gap-2">
                <span>👥</span> Clã
              </span>
              <span className="text-base font-bold text-cyan-400">HLS ⚔️ 100%</span>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="space-y-3">
            <Link to="/profile" className="block">
              <button className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Perfil
              </button>
            </Link>
            <button 
              onClick={logout}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <div className="mr-80">
        <nav className="bg-gradient-to-r from-gray-800 via-gray-900 to-gray-800 border-b-2 border-purple-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-1">
              <Link 
                to="/" 
                className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mr-6 hover:scale-105 transition-transform"
              >
                ⚔️ Yu-Gi-Oh!
              </Link>
              
              <Link 
                to="/" 
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-all"
              >
                🏠 <span className="font-semibold">Home</span>
              </Link>
              
              <Link 
                to="/chat" 
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-blue-700 hover:text-white transition-all"
              >
                💬 <span className="font-semibold">Chat</span>
              </Link>
              
              <Link 
                to="/random-duel" 
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-red-700 hover:text-white transition-all"
              >
                🎲 <span className="font-semibold">Random Duelo</span>
              </Link>
              
              <Link 
                to="/deck-builder" 
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-amber-700 hover:text-white transition-all"
              >
                🎴 <span className="font-semibold">Deck</span>
              </Link>
              
              <Link 
                to="/inventory" 
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-green-700 hover:text-white transition-all"
              >
                🎒 <span className="font-semibold">Inventário</span>
              </Link>
              
              <Link 
                to="/shop" 
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-purple-700 hover:text-white transition-all"
              >
                🛒 <span className="font-semibold">Loja</span>
              </Link>
              
              <Link 
                to="/tournaments" 
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-300 hover:bg-yellow-700 hover:text-white transition-all"
              >
                🏆 <span className="font-semibold">Torneios</span>
              </Link>
            </div>

            <div className="flex items-center gap-3">
              {/* Espaço vazio - informações estão na lateral */}
            </div>
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
