import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import ActiveDuelBanner from './ActiveDuelBanner';
import { UserProfileCard } from './UserProfileCard';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface SiteTab {
  key: string;
  label: string;
  route: string;
  icon: string;
  order: number;
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { refreshUser, isAuthenticated } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTabs, setActiveTabs] = useState<SiteTab[]>([]);
  const location = useLocation();

  // Atualizar dados do usuário quando a página carregar
  useEffect(() => {
    if (isAuthenticated) {
      refreshUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // refreshUser é estável, não precisa estar nas dependências

  // Buscar abas ativas do site
  useEffect(() => {
    const fetchActiveTabs = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/site-tabs/active`);
        setActiveTabs(response.data);
      } catch (error) {
        console.error('Erro ao buscar abas ativas:', error);
        setActiveTabs([]);
      }
    };
    fetchActiveTabs();
  }, []);

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
      
      {/* Botão Menu Mobile - Visível apenas em telas pequenas */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed top-4 right-4 z-50 bg-gradient-to-br from-purple-500/20 to-blue-500/20 backdrop-blur-sm p-3 rounded-lg border border-purple-500/50 shadow-lg"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Overlay Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/70 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Menu Mobile - Visível apenas em telas pequenas */}
      <aside className={`lg:hidden fixed right-0 top-0 h-screen w-80 z-50 overflow-y-auto bg-gradient-to-b from-purple-900/40 to-blue-900/40 backdrop-blur-md transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5 relative">
          {/* Botão Fechar */}
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="absolute top-4 right-4 p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors z-10"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <UserProfileCard onLinkClick={() => setMobileMenuOpen(false)} />
        </div>
      </aside>

      {/* Banner de Duelo Ativo */}
      <ActiveDuelBanner />

      {/* Container principal com flex para sidebar e conteúdo */}
      <div className="relative z-10 flex">
        {/* Conteúdo Principal */}
        <div className="flex-1 relative z-10">
        <nav id="main-nav" className="relative bg-gradient-to-b from-black/40 via-black/30 to-transparent backdrop-blur-sm border-b border-purple-500/20 shadow-lg">
          <div className="w-full px-3 md:px-6">
            <div className="flex items-center h-16 md:h-20 gap-2 md:gap-3 overflow-x-auto scrollbar-hide">
              {/* Logo */}
              <div className="flex items-center flex-shrink-0 mr-2">
                <Link 
                  to="/" 
                  className="hover:scale-110 transition-all duration-300 group relative"
                >
                  <div className="relative">
                    <img 
                      src="/images/yugioh.webp" 
                      alt="Yu-Gi-Oh!" 
                      className="h-12 md:h-16 object-contain drop-shadow-lg group-hover:drop-shadow-2xl transition-all"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 to-blue-500/0 group-hover:from-purple-500/20 group-hover:to-blue-500/20 rounded-lg transition-all duration-300"></div>
                  </div>
                </Link>
              </div>
              
              {/* Separador visual */}
              <div className="h-8 w-px bg-gradient-to-b from-transparent via-purple-500/30 to-transparent flex-shrink-0"></div>
              
              {/* Abas de navegação */}
              <div className="flex items-center gap-1.5 md:gap-2 flex-nowrap flex-1 min-w-0">
                {activeTabs.length > 0 ? (
                  activeTabs.map((tab) => {
                    const isActive = location.pathname === tab.route || 
                                    (tab.route !== '/' && location.pathname.startsWith(tab.route));
                    
                    // Mapear cores baseado na rota
                    const getColors = (route: string) => {
                      if (route === '/') return { from: 'from-gray-600', to: 'to-gray-500', hoverFrom: 'hover:from-gray-700', hoverTo: 'hover:to-gray-600' };
                      if (route === '/chat') return { from: 'from-blue-600', to: 'to-cyan-600', hoverFrom: 'hover:from-blue-700', hoverTo: 'hover:to-cyan-700' };
                      if (route === '/random-duel') return { from: 'from-red-600', to: 'to-orange-600', hoverFrom: 'hover:from-red-700', hoverTo: 'hover:to-orange-700' };
                      if (route === '/arena') return { from: 'from-red-700', to: 'to-pink-700', hoverFrom: 'hover:from-red-800', hoverTo: 'hover:to-pink-800' };
                      if (route === '/tournaments') return { from: 'from-yellow-600', to: 'to-amber-600', hoverFrom: 'hover:from-yellow-700', hoverTo: 'hover:to-amber-700' };
                      if (route === '/groups') return { from: 'from-cyan-600', to: 'to-teal-600', hoverFrom: 'hover:from-cyan-700', hoverTo: 'hover:to-teal-700' };
                      if (route === '/ranking') return { from: 'from-orange-600', to: 'to-red-600', hoverFrom: 'hover:from-orange-700', hoverTo: 'hover:to-red-700' };
                      if (route === '/missions') return { from: 'from-green-600', to: 'to-emerald-600', hoverFrom: 'hover:from-green-700', hoverTo: 'hover:to-emerald-700' };
                      if (route === '/drops') return { from: 'from-indigo-600', to: 'to-purple-600', hoverFrom: 'hover:from-indigo-700', hoverTo: 'hover:to-purple-700' };
                      if (route === '/shop') return { from: 'from-purple-600', to: 'to-pink-600', hoverFrom: 'hover:from-purple-700', hoverTo: 'hover:to-pink-700' };
                      if (route === '/marketplace/accounts') return { from: 'from-pink-600', to: 'to-rose-600', hoverFrom: 'hover:from-pink-700', hoverTo: 'hover:to-rose-700' };
                      if (route === '/marketplace/cards') return { from: 'from-rose-600', to: 'to-red-600', hoverFrom: 'hover:from-rose-700', hoverTo: 'hover:to-red-700' };
                      return { from: 'from-gray-600', to: 'to-gray-500', hoverFrom: 'hover:from-gray-700', hoverTo: 'hover:to-gray-600' };
                    };

                    const colors = getColors(tab.route);

                    return (
                      <Link
                        key={tab.key}
                        to={tab.route}
                        className={`group relative flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-sm md:text-base font-semibold whitespace-nowrap overflow-hidden flex-shrink-0 transition-all duration-300 ${
                          isActive 
                            ? `bg-gradient-to-r ${colors.from} ${colors.to} text-white shadow-lg border-2 scale-105` 
                            : 'text-gray-300 hover:text-white border-2 border-transparent hover:border-white/20 hover:scale-105'
                        }`}
                      >
                        {/* Background gradient para hover (quando não está ativo) */}
                        {!isActive && (
                          <div className={`absolute inset-0 bg-gradient-to-r ${colors.from}/0 ${colors.to}/0 ${colors.hoverFrom}/70 ${colors.hoverTo}/70 rounded-lg md:rounded-xl transition-all duration-300 opacity-0 group-hover:opacity-100`}></div>
                        )}
                        
                        {/* Indicador de aba ativa */}
                        {isActive && (
                          <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${colors.from} ${colors.to} rounded-full shadow-lg`}></div>
                        )}
                        
                        {/* Conteúdo */}
                        <span className={`text-lg md:text-xl relative z-10 drop-shadow-lg ${isActive ? 'animate-pulse' : ''}`}>{tab.icon}</span>
                        <span className="relative z-10 hidden sm:inline-block">{tab.label}</span>
                      </Link>
                    );
                  })
                ) : (
                  // Fallback: mostrar todas as abas se não houver dados
                  <>
                    <Link 
                      to="/" 
                      className={`group relative flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-sm md:text-base font-semibold whitespace-nowrap overflow-hidden flex-shrink-0 transition-all duration-300 ${
                        location.pathname === '/' 
                          ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg border-2 border-gray-400/50 scale-105' 
                          : 'text-gray-300 hover:text-white border-2 border-transparent hover:border-white/20 hover:scale-105'
                      }`}
                    >
                      {location.pathname !== '/' && (
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-600/0 to-gray-500/0 hover:from-gray-700/70 hover:to-gray-600/70 rounded-lg md:rounded-xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
                      )}
                      {location.pathname === '/' && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-gray-600 to-gray-500 rounded-full shadow-lg"></div>
                      )}
                      <span className="text-lg md:text-xl relative z-10 drop-shadow-lg">🏠</span>
                      <span className="relative z-10 hidden sm:inline-block">Home</span>
                    </Link>
                    <Link 
                      to="/chat" 
                      className={`group relative flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-lg md:rounded-xl text-sm md:text-base font-semibold whitespace-nowrap overflow-hidden flex-shrink-0 transition-all duration-300 ${
                        location.pathname === '/chat' 
                          ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg border-2 border-blue-400/50 scale-105' 
                          : 'text-gray-300 hover:text-white border-2 border-transparent hover:border-white/20 hover:scale-105'
                      }`}
                    >
                      {location.pathname !== '/chat' && (
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 to-cyan-600/0 hover:from-blue-700/70 hover:to-cyan-700/70 rounded-lg md:rounded-xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
                      )}
                      {location.pathname === '/chat' && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full shadow-lg"></div>
                      )}
                      <span className="text-lg md:text-xl relative z-10 drop-shadow-lg">💬</span>
                      <span className="relative z-10 hidden sm:inline-block">Chat</span>
                    </Link>
                  </>
                )}

              </div>
            </div>
          </div>
        </nav>
        
        {/* Imagem Reliquia abaixo da linha */}
        <div className="absolute left-0 top-16 md:top-20 mt-2 z-20 hidden sm:block">
          <img 
            src="/images/reliquia.png" 
            alt="Relíquia" 
            className="h-12 md:h-16 object-contain drop-shadow-lg"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        <main className="pb-8 pl-1 sm:pl-2">{children}</main>
        
        {/* Footer */}
        <footer className="border-t border-gray-700/50 py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
            <p>© 2025 Yu-Gi-Oh! Duel Arena - Todos os direitos reservados</p>
          </div>
        </footer>
        </div>

        {/* Card Lateral Direito - Perfil do Usuário - Desktop */}
        <aside className="sticky top-0 w-80 z-50 h-screen hidden lg:block self-start" style={{ backgroundColor: 'transparent' }}>
          <div className="p-5 h-full overflow-y-auto custom-scrollbar" style={{ backgroundColor: 'transparent' }}>
            <UserProfileCard />
          </div>
        </aside>
      </div>
    </div>
  );
}
