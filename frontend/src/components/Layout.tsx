import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import { useAuthStore } from '../stores/authStore';
import ActiveDuelBanner from './ActiveDuelBanner';
import ArenaCountdownBanner from './ArenaCountdownBanner';
import { UserProfileCard } from './UserProfileCard';
import LanguageSelector from './LanguageSelector';
import { getSocialIcon } from './SocialMediaIcons';
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

interface SocialMediaLink {
  id: string;
  platform: string;
  url: string;
  icon: string | null;
}

export default function Layout({ children }: LayoutProps) {
  const { refreshUser, isAuthenticated } = useAuthStore();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTabs, setActiveTabs] = useState<SiteTab[]>([]);
  const [socialMediaLinks, setSocialMediaLinks] = useState<SocialMediaLink[]>([]);
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

  // Buscar redes sociais ativas
  useEffect(() => {
    const fetchSocialMedia = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/social-media/active`);
        // Filtrar apenas Instagram, WhatsApp, Discord e YouTube
        const filtered = response.data.filter((social: SocialMediaLink) => {
          const platform = social.platform.toLowerCase();
          return platform === 'instagram' || platform === 'whatsapp' || 
                 platform === 'discord' || platform === 'youtube';
        });
        // Ordenar: Instagram, WhatsApp, Discord, YouTube
        const order = ['instagram', 'whatsapp', 'discord', 'youtube'];
        const sorted = filtered.sort((a, b) => {
          const aIndex = order.indexOf(a.platform.toLowerCase());
          const bIndex = order.indexOf(b.platform.toLowerCase());
          return aIndex - bIndex;
        });
        setSocialMediaLinks(sorted);
      } catch (error) {
        console.error('Erro ao buscar redes sociais:', error);
        setSocialMediaLinks([]);
      }
    };
    fetchSocialMedia();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 relative flex flex-col">
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
      <div className="relative z-10 flex flex-col lg:flex-row flex-1">
        {/* Conteúdo Principal */}
        <div className="flex-1 relative z-10 min-w-0 flex flex-col">
        <nav id="main-nav" className="relative border-b border-purple-500/20 shadow-lg" style={{ backgroundColor: 'transparent' }}>
          <div className="w-full px-2 sm:px-3 md:px-6">
            <div className="flex items-center h-14 sm:h-20 md:h-24 lg:h-28 gap-2 md:gap-3">
              {/* Menu Hamburger - Mobile - área de toque ~44px */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden flex-shrink-0 min-h-[44px] min-w-[44px] p-2 rounded-lg text-white hover:bg-white/10 transition-colors flex items-center justify-center"
                aria-label={t('layout.openMenu')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              
              {/* Separador visual - Desktop */}
              <div className="hidden md:block h-8 w-px bg-gradient-to-b from-transparent via-purple-500/30 to-transparent flex-shrink-0"></div>
              
              {/* Abas de navegação - Desktop (centralizadas) */}
              <div className="hidden lg:flex items-center justify-center gap-1 md:gap-1.5 flex-nowrap flex-1 min-w-0 overflow-x-auto scrollbar-hide">
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
                    const tabIcon = tab.route === '/shop' ? '/images/Icones/Shop.png' : tab.icon;

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
                        {tabIcon && tabIcon.startsWith('/images/') ? (
                          <img 
                            src={tabIcon} 
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
                            {tabIcon}
                          </span>
                        )}
                        <span className="relative z-10 text-center leading-tight">{tab.label}</span>
                      </Link>
                    );
                  })
                ) : null}
              </div>

              {/* Abas de navegação - Mobile (scroll horizontal, centralizadas quando couber) */}
              <div className="lg:hidden flex items-center justify-center gap-1 flex-nowrap flex-1 min-w-0 overflow-x-auto scrollbar-hide -mx-2 px-2 py-1">
                {activeTabs.slice(0, 4).map((tab) => {
                  const isActive = location.pathname === tab.route || 
                                  (tab.route !== '/' && location.pathname.startsWith(tab.route));
                  
                  const getColors = (route: string) => {
                    if (route === '/') return { from: 'from-gray-600', to: 'to-gray-500' };
                    if (route === '/chat') return { from: 'from-blue-600', to: 'to-cyan-600' };
                    if (route === '/random-duel') return { from: 'from-red-600', to: 'to-orange-600' };
                    if (route === '/arena') return { from: 'from-red-700', to: 'to-pink-700' };
                    return { from: 'from-gray-600', to: 'to-gray-500' };
                  };

                  const colors = getColors(tab.route);
                  const tabIcon = tab.route === '/shop' ? '/images/Icones/Shop.png' : tab.icon;

                  return (
                    <Link
                      key={tab.key}
                      to={tab.route}
                      className={`group relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] px-2 py-2 rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all ${
                        isActive 
                          ? `bg-gradient-to-r ${colors.from} ${colors.to} text-white shadow-lg` 
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      {tabIcon && tabIcon.startsWith('/images/') ? (
                        <img 
                          src={tabIcon} 
                          alt={tab.label}
                          className="h-10 w-10 sm:h-12 sm:w-12 object-contain drop-shadow-lg"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-sm sm:text-base drop-shadow-lg">
                          {tabIcon}
                        </span>
                      )}
                      <span className="text-center leading-tight">{tab.label}</span>
                    </Link>
                  );
                })}
              </div>
              <div className="ml-auto flex-shrink-0 pl-2">
                <LanguageSelector variant="compact" className="[&_button]:border-purple-500/30 [&_button]:text-gray-200 [&_button:hover]:bg-white/10" />
              </div>
            </div>
          </div>

          {/* Menu Mobile Expandido */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-purple-500/20 bg-black/80 backdrop-blur-sm">
              <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeTabs.map((tab) => {
                    const isActive = location.pathname === tab.route || 
                                    (tab.route !== '/' && location.pathname.startsWith(tab.route));
                    
                    const getColors = (route: string) => {
                      if (route === '/') return { from: 'from-gray-600', to: 'to-gray-500' };
                      if (route === '/chat') return { from: 'from-blue-600', to: 'to-cyan-600' };
                      if (route === '/random-duel') return { from: 'from-red-600', to: 'to-orange-600' };
                      if (route === '/arena') return { from: 'from-red-700', to: 'to-pink-700' };
                      if (route === '/tournaments') return { from: 'from-yellow-600', to: 'to-amber-600' };
                      if (route === '/groups') return { from: 'from-cyan-600', to: 'to-teal-600' };
                      if (route === '/ranking') return { from: 'from-orange-600', to: 'to-red-600' };
                      if (route === '/missions') return { from: 'from-green-600', to: 'to-emerald-600' };
                      if (route === '/drops') return { from: 'from-indigo-600', to: 'to-purple-600' };
                      if (route === '/shop') return { from: 'from-purple-600', to: 'to-pink-600' };
                      return { from: 'from-gray-600', to: 'to-gray-500' };
                    };

                    const colors = getColors(tab.route);
                    const tabIcon = tab.route === '/shop' ? '/images/Icones/Shop.png' : tab.icon;

                    return (
                      <Link
                        key={tab.key}
                        to={tab.route}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex flex-col items-center justify-center gap-1 min-h-[48px] p-3 rounded-lg text-xs font-semibold transition-all ${
                          isActive 
                            ? `bg-gradient-to-r ${colors.from} ${colors.to} text-white shadow-lg` 
                            : 'text-gray-300 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {tabIcon && tabIcon.startsWith('/images/') ? (
                          <img 
                            src={tabIcon} 
                            alt={tab.label}
                            className="h-12 w-12 object-contain drop-shadow-lg"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-xl drop-shadow-lg">
                            {tabIcon}
                          </span>
                        )}
                        <span className="text-center">{tab.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </nav>

        <main className="flex-1 pb-8 px-2 sm:px-4 md:px-6">{children}</main>
        </div>

        {/* Card Lateral Direito - Perfil do Usuário - Desktop */}
        <aside id="user-sidebar" className="w-64 xl:w-80 z-50 hidden lg:block self-start" style={{ backgroundColor: 'transparent' }}>
          <div className="p-3 xl:p-5" style={{ backgroundColor: 'transparent' }}>
            <UserProfileCard />
          </div>
        </aside>

        {/* Card Lateral - Perfil do Usuário - Mobile (Bottom Sheet) */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-black/90 backdrop-blur-sm border-t border-purple-500/20">
            <div className="p-4 max-h-[40vh] overflow-y-auto">
              <UserProfileCard />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-700/50 py-3 sm:py-4 px-3 sm:px-4 bg-transparent backdrop-blur-sm relative z-10 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
          <p className="text-gray-400 text-xs sm:text-sm text-center sm:text-left">
            © 2025 Yugioh RPG: Champions Of Duels - Todos os direitos reservados
          </p>
          {socialMediaLinks.length > 0 && (
            <div className="flex items-center gap-4">
              {socialMediaLinks.map((social) => {
                const icon = getSocialIcon(social.platform, "w-6 h-6");
                
                return (
                  <a
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:scale-125 transition-all duration-200 opacity-80 hover:opacity-100"
                    title={social.platform}
                  >
                    {icon}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
