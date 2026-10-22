import { ReactNode, Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/I18nContext';
import { translateTabLabel } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import ActiveDuelBanner from './ActiveDuelBanner';
import ArenaCountdownBanner from './ArenaCountdownBanner';
import ArenaFullBleedBackground from './ArenaFullBleedBackground';
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
  children?: ReactNode;
}

interface SocialMediaLink {
  id: string;
  platform: string;
  url: string;
  icon: string | null;
}

/** Cache de sessão: evita refetch a cada troca de aba (Layout agora é persistente, mas reforça). */
let cachedSiteTabs: SiteTab[] | null = null;
let cachedSocialLinks: SocialMediaLink[] | null = null;
let lastUserRefreshAt = 0;

function PageOutletFallback() {
  return (
    <div className="flex items-center justify-center min-h-[30vh] text-white/70">
      <div className="flex flex-col items-center gap-2 animate-fade-rise">
        <div className="h-8 w-8 rounded-full border-2 border-champion-gold/25 border-t-champion-gold animate-spin" />
        <p className="text-xs text-arena-mist">Carregando página...</p>
      </div>
    </div>
  );
}

/** Ícones Yu-Gi-Oh (medalhão Millennium) por rota — sobrescreve emoji/legado do banco. */
const TAB_NAV_ICONS: Record<string, string> = {
  '/': '/images/Icones/Home.png',
  '/chat': '/images/Icones/Chat.png',
  '/random-duel': '/images/Icones/RandomDuel.png',
  '/arena': '/images/Icones/Arena.png',
  '/tournaments': '/images/Icones/Torneio.png',
  '/groups': '/images/Icones/Cla.png',
  '/ranking': '/images/Icones/Ranking.png',
  '/missions': '/images/Icones/Missoes.png',
  '/battle-pass': '/images/Icones/Passe.png',
  '/redeem': '/images/Icones/Codigos.png',
  '/drops': '/images/Icones/Drops.png',
  '/shop': '/images/Icones/Shop.png',
  '/collection': '/images/Icones/Colecao.png',
  '/marketplace/accounts': '/images/Icones/Contas.png',
  '/marketplace/cards': '/images/Icones/Cartas.png',
  '/patch-notes': '/images/Icones/PatchNotes.png',
  '/credit': '/images/Icones/Credito.png',
  '/help': '/images/Icones/Ajuda.png',
};

function tabNavIconForRoute(route: string, fallback: string): string {
  return TAB_NAV_ICONS[route] || fallback;
}

function tabNavImageClass(
  variant: 'desktop' | 'mobileRow' | 'mobileGrid',
  _route: string,
  isActiveDesktop?: boolean
): string {
  const pulse = isActiveDesktop ? ' animate-pulse' : '';
  if (variant === 'desktop') {
    return `h-11 w-11 xl:h-12 xl:w-12 relative z-10 drop-shadow-lg object-contain${pulse}`;
  }
  if (variant === 'mobileRow') {
    return `h-10 w-10 object-contain drop-shadow-lg`;
  }
  return `h-12 w-12 object-contain drop-shadow-lg`;
}

function useNavScroll(depsKey: string | number) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(max > 4 && el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    update();
    const t = window.setTimeout(update, 50);
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      window.clearTimeout(t);
      el.removeEventListener('scroll', update);
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update, depsKey]);

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(180, el.clientWidth * 0.45), behavior: 'smooth' });
  }, []);

  return { scrollerRef, canLeft, canRight, scrollByDir };
}

export default function Layout({ children }: LayoutProps) {
  const { refreshUser, isAuthenticated, user } = useAuthStore();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTabs, setActiveTabs] = useState<SiteTab[]>(() => cachedSiteTabs ?? []);
  const [socialMediaLinks, setSocialMediaLinks] = useState<SocialMediaLink[]>(
    () => cachedSocialLinks ?? [],
  );
  const location = useLocation();
  const refreshedOnceRef = useRef(false);
  const tabsScrollKey = activeTabs.map((t) => t.key).join(',');
  const desktopNav = useNavScroll(tabsScrollKey);
  const mobileNav = useNavScroll(tabsScrollKey);

  const tabLabel = (tab: SiteTab) => translateTabLabel(tab, t);

  // Atualizar usuário no máximo 1x/min (antes rodava a cada troca de aba)
  useEffect(() => {
    if (!isAuthenticated || user?.profileSetupCompleted === false) return;
    const now = Date.now();
    if (refreshedOnceRef.current && now - lastUserRefreshAt < 60_000) return;
    refreshedOnceRef.current = true;
    lastUserRefreshAt = now;
    void refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (isAuthenticated && user?.profileSetupCompleted === false) {
    return <Navigate to="/auth/choose-nickname" replace />;
  }

  // Buscar abas ativas do site (com cache de sessão)
  useEffect(() => {
    if (cachedSiteTabs) {
      setActiveTabs(cachedSiteTabs);
      return;
    }
    const fetchActiveTabs = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/site-tabs/active`, { timeout: 8000 });
        const tabs: SiteTab[] = (Array.isArray(response.data) ? response.data : []).filter(
          (tab) => tab.key !== 'random-anime'
        );
        const hasRanking = tabs.some((t) => t.route === '/ranking');
        if (!hasRanking) {
          tabs.push({
            key: 'ranking',
            label: 'Ranking',
            route: '/ranking',
            icon: TAB_NAV_ICONS['/ranking'],
            order: 0,
          });
        }
        const hasHelp = tabs.some((tab) => tab.route === '/help');
        if (!hasHelp) {
          tabs.push({
            key: 'help-support',
            label: 'Ajuda',
            route: '/help',
            icon: TAB_NAV_ICONS['/help'],
            order: 88,
          });
        }
        const hasCredit = tabs.some((tab) => tab.route === '/credit');
        if (!hasCredit) {
          tabs.push({
            key: 'credits',
            label: 'Créditos',
            route: '/credit',
            icon: TAB_NAV_ICONS['/credit'],
            order: 12,
          });
        }
        const hasBattlePass = tabs.some((tab) => tab.route === '/battle-pass');
        if (!hasBattlePass) {
          tabs.push({
            key: 'battle-pass',
            label: 'Passe',
            route: '/battle-pass',
            icon: TAB_NAV_ICONS['/battle-pass'],
            order: 7,
          });
        }
        const hasRedeem = tabs.some((tab) => tab.route === '/redeem');
        if (!hasRedeem) {
          tabs.push({
            key: 'redeem-code',
            label: 'Códigos',
            route: '/redeem',
            icon: TAB_NAV_ICONS['/redeem'],
            order: 8,
          });
        }
        const hasPatchNotes = tabs.some((tab) => tab.route === '/patch-notes');
        if (!hasPatchNotes) {
          tabs.push({
            key: 'patch-notes',
            label: 'Patch Notes',
            route: '/patch-notes',
            icon: TAB_NAV_ICONS['/patch-notes'],
            order: 85,
          });
        }
        tabs.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        cachedSiteTabs = tabs;
        setActiveTabs(tabs);
      } catch (error) {
        console.error('Erro ao buscar abas ativas:', error);
        const fallback = [
          { key: 'ranking', label: 'Ranking', route: '/ranking', icon: TAB_NAV_ICONS['/ranking'], order: 0 },
          { key: 'credits', label: 'Créditos', route: '/credit', icon: TAB_NAV_ICONS['/credit'], order: 12 },
          { key: 'help-support', label: 'Ajuda', route: '/help', icon: TAB_NAV_ICONS['/help'], order: 88 },
        ];
        cachedSiteTabs = fallback;
        setActiveTabs(fallback);
      }
    };
    void fetchActiveTabs();
  }, []);

  // Buscar redes sociais ativas (com cache)
  useEffect(() => {
    if (cachedSocialLinks) {
      setSocialMediaLinks(cachedSocialLinks);
      return;
    }
    const fetchSocialMedia = async () => {
      try {
        const response = await axios.get(`${API_URL}/public/social-media/active`, { timeout: 8000 });
        const filtered = (Array.isArray(response.data) ? response.data : []).filter((social: SocialMediaLink) => {
          const platform = social.platform.toLowerCase();
          return platform === 'instagram' || platform === 'whatsapp' ||
                 platform === 'discord' || platform === 'youtube';
        });
        const order = ['instagram', 'whatsapp', 'discord', 'youtube'];
        const sorted = filtered.sort((a: SocialMediaLink, b: SocialMediaLink) => {
          const aIndex = order.indexOf(a.platform.toLowerCase());
          const bIndex = order.indexOf(b.platform.toLowerCase());
          return aIndex - bIndex;
        });
        cachedSocialLinks = sorted;
        setSocialMediaLinks(sorted);
      } catch (error) {
        console.error('Erro ao buscar redes sociais:', error);
        cachedSocialLinks = [];
        setSocialMediaLinks([]);
      }
    };
    void fetchSocialMedia();
  }, []);

  return (
    <div className="game-shell">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="z-0" />
      <div className="fixed inset-0 z-0 game-overlay" aria-hidden />

      <ActiveDuelBanner />
      <ArenaCountdownBanner />

      <div className="relative z-10 flex flex-col flex-1 min-h-0 overflow-hidden">
        <nav id="main-nav" className="relative game-nav flex-shrink-0">
          <div className="w-full px-2 sm:px-3 md:px-4 xl:px-5">
            <div className="flex items-center h-12 lg:h-[3.25rem] gap-1 md:gap-1.5">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden flex-shrink-0 min-h-[44px] min-w-[44px] p-2 rounded-lg text-white hover:bg-champion-gold/10 transition-colors flex items-center justify-center"
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

              {/* Desktop: uma linha + setas se não couber */}
              <div className="hidden lg:flex items-center flex-1 min-w-0 gap-1">
                <button
                  type="button"
                  aria-label="Abas anteriores"
                  disabled={!desktopNav.canLeft}
                  onClick={() => desktopNav.scrollByDir(-1)}
                  className={`flex-shrink-0 h-9 w-8 rounded-lg border border-champion-gold/25 text-champion-gold transition-opacity ${
                    desktopNav.canLeft
                      ? 'opacity-100 hover:bg-champion-gold/10'
                      : 'opacity-0 pointer-events-none'
                  }`}
                >
                  ‹
                </button>
                <div
                  ref={desktopNav.scrollerRef}
                  className="flex items-center gap-1 xl:gap-1.5 flex-nowrap flex-1 min-w-0 overflow-x-auto scrollbar-hide scroll-smooth"
                >
                  {activeTabs.map((tab) => {
                    const isHelpRoute = tab.route === '/help';
                    const isActive =
                      location.pathname === tab.route ||
                      (tab.route !== '/' && location.pathname.startsWith(tab.route)) ||
                      (isHelpRoute && location.pathname === '/feedback');
                    const tabIcon = tabNavIconForRoute(tab.route, tab.icon);

                    return (
                      <Link
                        key={tab.key}
                        to={tab.route}
                        title={tabLabel(tab)}
                        className={`game-nav-tab game-nav-tab--compact ${
                          isActive ? 'game-nav-tab--active' : 'game-nav-tab--idle'
                        }`}
                      >
                        {tabIcon && tabIcon.startsWith('/images/') ? (
                          <img
                            src={tabIcon}
                            alt={tabLabel(tab)}
                            className={tabNavImageClass('desktop', tab.route, isActive)}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span
                            className={`text-lg xl:text-xl relative z-10 drop-shadow-lg ${
                              isActive ? 'text-champion-gold' : ''
                            }`}
                          >
                            {tabIcon}
                          </span>
                        )}
                        <span className="relative z-10 text-center leading-tight max-w-[3.75rem] xl:max-w-[4.5rem] truncate">
                          {tabLabel(tab)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <button
                  type="button"
                  aria-label="Próximas abas"
                  disabled={!desktopNav.canRight}
                  onClick={() => desktopNav.scrollByDir(1)}
                  className={`flex-shrink-0 h-9 w-8 rounded-lg border border-champion-gold/25 text-champion-gold transition-opacity ${
                    desktopNav.canRight
                      ? 'opacity-100 hover:bg-champion-gold/10'
                      : 'opacity-0 pointer-events-none'
                  }`}
                >
                  ›
                </button>
              </div>

              {/* Mobile: uma linha rolável */}
              <div className="lg:hidden flex items-center flex-1 min-w-0 gap-1">
                <button
                  type="button"
                  aria-label="Abas anteriores"
                  disabled={!mobileNav.canLeft}
                  onClick={() => mobileNav.scrollByDir(-1)}
                  className={`flex-shrink-0 h-8 w-7 rounded-md border border-champion-gold/25 text-champion-gold text-sm ${
                    mobileNav.canLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  ‹
                </button>
                <div
                  ref={mobileNav.scrollerRef}
                  className="flex items-center gap-1 flex-nowrap flex-1 min-w-0 overflow-x-auto scrollbar-hide scroll-smooth"
                >
                  {activeTabs.map((tab) => {
                    const isHelpRoute = tab.route === '/help';
                    const isActive =
                      location.pathname === tab.route ||
                      (tab.route !== '/' && location.pathname.startsWith(tab.route)) ||
                      (isHelpRoute && location.pathname === '/feedback');
                    const tabIcon = tabNavIconForRoute(tab.route, tab.icon);

                    return (
                      <Link
                        key={tab.key}
                        to={tab.route}
                        title={tabLabel(tab)}
                        className={`game-nav-tab game-nav-tab--compact min-h-[44px] text-[10px] sm:text-[11px] ${
                          isActive ? 'game-nav-tab--active' : 'game-nav-tab--idle'
                        }`}
                      >
                        {tabIcon && tabIcon.startsWith('/images/') ? (
                          <img
                            src={tabIcon}
                            alt={tabLabel(tab)}
                            className={tabNavImageClass('mobileRow', tab.route)}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-base sm:text-lg drop-shadow-lg">{tabIcon}</span>
                        )}
                        <span className="text-center leading-tight max-w-[3.75rem] truncate">
                          {tabLabel(tab)}
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <button
                  type="button"
                  aria-label="Próximas abas"
                  disabled={!mobileNav.canRight}
                  onClick={() => mobileNav.scrollByDir(1)}
                  className={`flex-shrink-0 h-8 w-7 rounded-md border border-champion-gold/25 text-champion-gold text-sm ${
                    mobileNav.canRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  ›
                </button>
              </div>

              <div className="ml-auto flex-shrink-0 pl-1">
                <LanguageSelector
                  variant="compact"
                  className="[&_button]:border-champion-gold/30 [&_button]:text-gray-200 [&_button:hover]:bg-champion-gold/10"
                />
              </div>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-champion-gold/20 bg-arena-ink/90 backdrop-blur-md">
              <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {activeTabs.map((tab) => {
                    const isHelpRoute = tab.route === '/help';
                    const isActive =
                      location.pathname === tab.route ||
                      (tab.route !== '/' && location.pathname.startsWith(tab.route)) ||
                      (isHelpRoute && location.pathname === '/feedback');
                    const tabIcon = tabNavIconForRoute(tab.route, tab.icon);

                    return (
                      <Link
                        key={tab.key}
                        to={tab.route}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex flex-col items-center justify-center gap-1 min-h-[48px] p-3 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? 'game-nav-tab--active'
                            : 'text-gray-300 hover:text-white hover:bg-champion-gold/10 border border-transparent'
                        }`}
                      >
                        {tabIcon && tabIcon.startsWith('/images/') ? (
                          <img
                            src={tabIcon}
                            alt={tabLabel(tab)}
                            className={tabNavImageClass('mobileGrid', tab.route)}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-2xl drop-shadow-lg">{tabIcon}</span>
                        )}
                        <span className="text-center">{tabLabel(tab)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* Uma única área de scroll: conteúdo + perfil juntos */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar [scrollbar-gutter:stable]">
          <div className="flex items-start min-h-full">
            <main className="flex-1 min-w-0 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5">
              <Suspense fallback={<PageOutletFallback />}>
                {children ?? <Outlet />}
              </Suspense>
            </main>

            <aside
              id="user-sidebar"
              className="user-sidebar hidden lg:block w-[15.75rem] xl:w-[17.75rem] flex-shrink-0"
            >
              <div className="p-2 xl:p-2.5">
                <div className="user-sidebar-panel p-2.5 xl:p-3">
                  <UserProfileCard />
                </div>
              </div>
            </aside>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-arena-ink/95 backdrop-blur-md border-t border-champion-gold/25">
            <div className="p-3 max-h-[40vh] overflow-y-auto">
              <div className="user-sidebar-panel p-3">
                <UserProfileCard />
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="flex-shrink-0 border-t border-champion-gold/15 py-1.5 px-3 bg-arena-ink/40 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto flex flex-row justify-between items-center gap-2">
          <p className="text-arena-mist text-[10px] sm:text-xs truncate">
            © 2026 Yugioh RPG: Champions Of Duels
          </p>
          {socialMediaLinks.length > 0 && (
            <div className="flex items-center gap-3 flex-shrink-0">
              {socialMediaLinks.map((social) => {
                const icon = getSocialIcon(social.platform, "w-4 h-4 sm:w-5 sm:h-5");
                return (
                  <a
                    key={social.id}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:scale-110 hover:text-champion-gold transition-all duration-200 opacity-75 hover:opacity-100"
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
