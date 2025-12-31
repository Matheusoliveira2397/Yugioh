import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import ActiveDuelBanner from './ActiveDuelBanner';
import ArenaCountdownBanner from './ArenaCountdownBanner';
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

      {/* Banner de Duelo Ativo */}
      <ActiveDuelBanner />
      
      {/* Banner de Contagem Regressiva da Arena */}
      <ArenaCountdownBanner />

      {/* Container principal com flex para sidebar e conteúdo */}
      <div className="relative z-10 flex">
        {/* Conteúdo Principal */}
        <div className="flex-1 relative z-10">
        <nav id="main-nav" className="relative border-b border-purple-500/20 shadow-lg" style={{ backgroundColor: 'transparent' }}>
          <div className="w-full px-3 md:px-6">
            <div className="flex items-center h-28 md:h-32 gap-2 md:gap-3">
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
              <div className="flex items-center gap-1 md:gap-1.5 flex-nowrap flex-1 min-w-0 overflow-x-auto scrollbar-hide">
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
                        className={`group relative flex flex-col items-center justify-center gap-0.5 md:gap-1 px-2 md:px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-semibold whitespace-nowrap overflow-hidden flex-shrink-0 transition-all duration-300 ${
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
                        {tab.icon && tab.icon.startsWith('/images/') ? (
                          <img 
                            src={tab.icon} 
                            alt={tab.label}
                            className={`h-20 w-20 md:h-24 md:w-24 relative z-10 drop-shadow-lg object-contain ${isActive ? 'animate-pulse' : ''}`}
                            onError={(e) => {
                              // Fallback: esconder imagem se não carregar
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span 
                            className={`text-lg md:text-xl relative z-10 drop-shadow-lg ${isActive ? 'animate-pulse' : ''}`}
                          >
                            {tab.icon}
                          </span>
                        )}
                        <span className="relative z-10 text-center leading-tight">{tab.label}</span>
                      </Link>
                    );
                  })
                ) : null}
              </div>
            </div>
          </div>
        </nav>

        <main className="pb-8 px-4">{children}</main>
          
          {/* Footer */}
          <footer className="border-t border-gray-700/50 py-4 mt-auto">
            <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
              <p>© 2025 Yu-Gi-Oh! Duel Arena - Todos os direitos reservados</p>
            </div>
          </footer>
        </div>

        {/* Card Lateral Direito - Perfil do Usuário - Desktop */}
        <aside id="user-sidebar" className="w-80 z-50 hidden lg:block self-start" style={{ backgroundColor: 'transparent' }}>
          <div className="p-5" style={{ backgroundColor: 'transparent' }}>
            <UserProfileCard />
          </div>
        </aside>
      </div>
    </div>
  );
}
