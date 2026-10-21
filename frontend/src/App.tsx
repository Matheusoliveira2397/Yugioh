import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/Layout';
import LoginBroadcastModal from './components/LoginBroadcastModal';

// Auth + home: eager (primeira pintura)
import LoginPage from './pages/LoginPage';
import LoginMasterPage from './pages/LoginMasterPage';
import RegisterPage from './pages/RegisterPage';
import AuthGoogleCallbackPage from './pages/AuthGoogleCallbackPage';
import ChooseNicknamePage from './pages/ChooseNicknamePage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ConfirmEmailChangePage from './pages/ConfirmEmailChangePage';
import HomePage from './pages/NewHomePage';

// Páginas do jogo: lazy = bundle inicial menor (carrega sob demanda)
const StoryModePage = lazy(() => import('./pages/StoryModePage'));
const DeckBuilderPage = lazy(() => import('./pages/DeckBuilderPage'));
const DeckEditPage = lazy(() => import('./pages/DeckEditPage'));
const TournamentPage = lazy(() => import('./pages/TournamentPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const RandomDuelPage = lazy(() => import('./pages/RandomDuelPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const ShopPage = lazy(() => import('./pages/ShopPage'));
const ShopCardsPage = lazy(() => import('./pages/ShopCardsPage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const GroupDetailPage = lazy(() => import('./pages/GroupDetailPage'));
const RankingPage = lazy(() => import('./pages/RankingPage'));
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const LootBoxesPage = lazy(() => import('./pages/LootBoxesPage'));
const BattlePassPage = lazy(() => import('./pages/BattlePassPage'));
const CreditPage = lazy(() => import('./pages/CreditPage'));
const RedeemCodePage = lazy(() => import('./pages/RedeemCodePage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const MissionsPage = lazy(() => import('./pages/MissionsPage'));
const DropsPage = lazy(() => import('./pages/DropsPage'));
const ArenaPage = lazy(() => import('./pages/ArenaPage'));
const ActiveDuelsPage = lazy(() => import('./pages/ActiveDuelsPage'));
const FinishedDuelsPage = lazy(() => import('./pages/FinishedDuelsPage'));
const NewsDetailPage = lazy(() => import('./pages/NewsDetailPage'));
const PatchNotesPage = lazy(() => import('./pages/PatchNotesPage'));
const AdminPatchNotesPanel = lazy(() => import('./pages/AdminPatchNotesPanel'));

const DuelArena = lazy(() => import('./pages/DuelArena'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const AdminCreateAccountPanel = lazy(() => import('./pages/AdminCreateAccountPanel'));
const AdminCardsPanel = lazy(() => import('./pages/AdminCardsPanel'));
const AdminCardEffectsBoard = lazy(() => import('./pages/AdminCardEffectsBoard'));
const AdminCardOwnershipPanel = lazy(() => import('./pages/AdminCardOwnershipPanel'));
const AdminPlayersPanel = lazy(() => import('./pages/AdminPlayersPanel'));
const AdminNewsPanel = lazy(() => import('./pages/AdminNewsPanel'));
const AdminPlaymatsPanel = lazy(() => import('./pages/AdminPlaymatsPanel'));
const AdminSleevesPanel = lazy(() => import('./pages/AdminSleevesPanel'));
const AdminTalismansPanel = lazy(() => import('./pages/AdminTalismansPanel'));
const AdminBriefcasesPanel = lazy(() => import('./pages/AdminBriefcasesPanel'));
const AdminLootBoxesPanel = lazy(() => import('./pages/AdminLootBoxesPanel'));
const AdminPromotionsPanel = lazy(() => import('./pages/AdminPromotionsPanel'));
const AdminControlPanel = lazy(() => import('./pages/AdminControlPanel'));
const AdminInitialDecksPanel = lazy(() => import('./pages/AdminInitialDecksPanel'));
const AdminAnimeDecksPanel = lazy(() => import('./pages/AdminAnimeDecksPanel'));
const AdminTournamentsPanel = lazy(() => import('./pages/AdminTournamentsPanel'));
const AdminArenaPanel = lazy(() => import('./pages/AdminArenaPanel'));
const AdminArenaSchedulesPanel = lazy(() => import('./pages/AdminArenaSchedulesPanel'));
const AdminSeasonsPanel = lazy(() => import('./pages/AdminSeasonsPanel'));
const AdminSiteTabsPanel = lazy(() => import('./pages/AdminSiteTabsPanel'));
const AdminMessagesPanel = lazy(() => import('./pages/AdminMessagesPanel'));
const AdminFeedbackPanel = lazy(() => import('./pages/AdminFeedbackPanel'));
const AdminAchievementsPanel = lazy(() => import('./pages/AdminAchievementsPanel'));
const AdminDivisionsPanel = lazy(() => import('./pages/AdminDivisionsPanel'));
const AdminCashDivisionPanel = lazy(() => import('./pages/AdminCashDivisionPanel'));
const AdminPaymentsPanel = lazy(() => import('./pages/AdminPaymentsPanel'));
const AdminCreditPackagesPanel = lazy(() => import('./pages/AdminCreditPackagesPanel'));
const AdminPromoCodesPanel = lazy(() => import('./pages/AdminPromoCodesPanel'));
const AdminBattlePassPanel = lazy(() => import('./pages/AdminBattlePassPanel'));
const AdminMissionsPanel = lazy(() => import('./pages/AdminMissionsPanel'));
const AdminRandomDuelLevelRangesPanel = lazy(() => import('./pages/AdminRandomDuelLevelRangesPanel'));
const AdminBotsPanel = lazy(() => import('./pages/AdminBotsPanel'));
const AdminDuelScoreSettingsPanel = lazy(() => import('./pages/AdminDuelScoreSettingsPanel'));
const AdminSocialMediaPanel = lazy(() => import('./pages/AdminSocialMediaPanel'));
const AdminNewAccountSettingsPanel = lazy(() => import('./pages/AdminNewAccountSettingsPanel'));
const AdminWatchDuelPage = lazy(() => import('./pages/AdminWatchDuelPage'));
const AdminActiveDuelsPanel = lazy(() => import('./pages/AdminActiveDuelsPanel'));


function PageLoadingFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-white/80">
      <div className="flex flex-col items-center gap-3">
        <div className="h-9 w-9 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin" />
        <p className="text-sm text-white/60">Carregando...</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children?: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const needsNickname = useAuthStore((s) => s.user?.profileSetupCompleted === false);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsNickname) {
    return <Navigate to="/auth/choose-nickname" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

function AuthenticatedLayout() {
  return (
    <RequireAuth>
      <Layout />
    </RequireAuth>
  );
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>;
}

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const needsNicknameSetup = useAuthStore(
    (s) => s.isAuthenticated && s.user?.profileSetupCompleted === false,
  );

  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {isAuthenticated && !needsNicknameSetup ? <LoginBroadcastModal /> : null}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/loginMaster" element={<LoginMasterPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/google/callback" element={<AuthGoogleCallbackPage />} />
        <Route path="/auth/choose-nickname" element={<ChooseNicknamePage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/confirm-email-change/:token" element={<ConfirmEmailChangePage />} />

        {/* Duelo sem Layout */}
        <Route
          path="/duel/:duelId"
          element={
            <RequireAuth>
              <Suspense fallback={<PageLoadingFallback />}>
                <DuelArena />
              </Suspense>
            </RequireAuth>
          }
        />

        {/* Shell autenticado persistente — Layout NÃO remonta ao trocar de aba */}
        <Route element={<AuthenticatedLayout />}>
          <Route index element={<HomePage />} />
          <Route path="home" element={<HomePage />} />
          <Route path="story" element={<LazyPage><StoryModePage /></LazyPage>} />
          <Route path="loot-boxes" element={<LazyPage><LootBoxesPage /></LazyPage>} />
          <Route path="deck-builder" element={<LazyPage><DeckBuilderPage /></LazyPage>} />
          <Route path="deck-edit" element={<LazyPage><DeckEditPage /></LazyPage>} />
          <Route path="tournaments" element={<LazyPage><TournamentPage /></LazyPage>} />
          <Route path="tournaments/:id" element={<LazyPage><TournamentPage /></LazyPage>} />
          <Route path="chat" element={<LazyPage><ChatPage /></LazyPage>} />
          <Route path="random-duel" element={<LazyPage><RandomDuelPage /></LazyPage>} />
          <Route path="arena" element={<LazyPage><ArenaPage /></LazyPage>} />
          <Route path="inventory" element={<LazyPage><InventoryPage /></LazyPage>} />
          <Route path="friends" element={<LazyPage><FriendsPage /></LazyPage>} />
          <Route path="shop" element={<LazyPage><ShopPage /></LazyPage>} />
          <Route path="shop-cards" element={<LazyPage><ShopCardsPage /></LazyPage>} />
          <Route path="collection" element={<LazyPage><CollectionPage /></LazyPage>} />
          <Route path="profile" element={<LazyPage><ProfilePage /></LazyPage>} />
          <Route path="profile/:id" element={<LazyPage><ProfilePage /></LazyPage>} />
          <Route path="groups" element={<LazyPage><GroupsPage /></LazyPage>} />
          <Route path="groups/:id" element={<LazyPage><GroupDetailPage /></LazyPage>} />
          <Route path="ranking" element={<LazyPage><RankingPage /></LazyPage>} />
          <Route path="missions" element={<LazyPage><MissionsPage /></LazyPage>} />
          <Route path="battle-pass" element={<LazyPage><BattlePassPage /></LazyPage>} />
          <Route path="drops" element={<LazyPage><DropsPage /></LazyPage>} />
          <Route path="credit" element={<LazyPage><CreditPage /></LazyPage>} />
          <Route path="redeem" element={<LazyPage><RedeemCodePage /></LazyPage>} />
          <Route path="help" element={<LazyPage><HelpPage /></LazyPage>} />
          <Route path="feedback" element={<LazyPage><FeedbackPage /></LazyPage>} />
          <Route path="active-duels" element={<LazyPage><ActiveDuelsPage /></LazyPage>} />
          <Route path="finished-duels" element={<LazyPage><FinishedDuelsPage /></LazyPage>} />
          <Route path="news/:id" element={<LazyPage><NewsDetailPage /></LazyPage>} />
          <Route path="patch-notes" element={<LazyPage><PatchNotesPage /></LazyPage>} />
          <Route path="admin" element={<LazyPage><AdminPanel /></LazyPage>} />
          <Route path="admin/create-account" element={<LazyPage><AdminCreateAccountPanel /></LazyPage>} />
          <Route path="admin/cartas" element={<LazyPage><AdminCardsPanel /></LazyPage>} />
          <Route path="admin/cartas/efeitos" element={<LazyPage><AdminCardEffectsBoard /></LazyPage>} />
          <Route path="admin/card-ownership" element={<LazyPage><AdminCardOwnershipPanel /></LazyPage>} />
          <Route path="admin/players" element={<LazyPage><AdminPlayersPanel /></LazyPage>} />
          <Route path="admin/news" element={<LazyPage><AdminNewsPanel /></LazyPage>} />
          <Route path="admin/patch-notes" element={<LazyPage><AdminPatchNotesPanel /></LazyPage>} />
          <Route path="admin/playmats" element={<LazyPage><AdminPlaymatsPanel /></LazyPage>} />
          <Route path="admin/sleeves" element={<LazyPage><AdminSleevesPanel /></LazyPage>} />
          <Route path="admin/talismans" element={<LazyPage><AdminTalismansPanel /></LazyPage>} />
          <Route path="admin/briefcases" element={<LazyPage><AdminBriefcasesPanel /></LazyPage>} />
          <Route path="admin/loot-boxes" element={<LazyPage><AdminLootBoxesPanel /></LazyPage>} />
          <Route path="admin/promotions" element={<LazyPage><AdminPromotionsPanel /></LazyPage>} />
          <Route path="admin/admin-control" element={<LazyPage><AdminControlPanel /></LazyPage>} />
          <Route path="admin/initial-decks" element={<LazyPage><AdminInitialDecksPanel /></LazyPage>} />
          <Route path="admin/anime-decks" element={<LazyPage><AdminAnimeDecksPanel /></LazyPage>} />
          <Route path="admin/tournaments" element={<LazyPage><AdminTournamentsPanel /></LazyPage>} />
          <Route path="admin/arena" element={<LazyPage><AdminArenaPanel /></LazyPage>} />
          <Route path="admin/watch-duel" element={<LazyPage><AdminWatchDuelPage /></LazyPage>} />
          <Route path="admin/active-duels" element={<LazyPage><AdminActiveDuelsPanel /></LazyPage>} />
          <Route path="admin/arena/schedules" element={<LazyPage><AdminArenaSchedulesPanel /></LazyPage>} />
          <Route path="admin/seasons" element={<LazyPage><AdminSeasonsPanel /></LazyPage>} />
          <Route path="admin/site-tabs" element={<LazyPage><AdminSiteTabsPanel /></LazyPage>} />
          <Route path="admin/messages" element={<LazyPage><AdminMessagesPanel /></LazyPage>} />
          <Route path="admin/feedback" element={<LazyPage><AdminFeedbackPanel /></LazyPage>} />
          <Route path="admin/achievements" element={<LazyPage><AdminAchievementsPanel /></LazyPage>} />
          <Route path="admin/divisions" element={<LazyPage><AdminDivisionsPanel /></LazyPage>} />
          <Route path="admin/bots" element={<LazyPage><AdminBotsPanel /></LazyPage>} />
          <Route path="admin/random-duel-level-ranges" element={<LazyPage><AdminRandomDuelLevelRangesPanel /></LazyPage>} />
          <Route path="admin/duel-score-settings" element={<LazyPage><AdminDuelScoreSettingsPanel /></LazyPage>} />
          <Route path="admin/social-media" element={<LazyPage><AdminSocialMediaPanel /></LazyPage>} />
          <Route path="admin/new-account-settings" element={<LazyPage><AdminNewAccountSettingsPanel /></LazyPage>} />
          <Route path="admin/cash-division" element={<LazyPage><AdminCashDivisionPanel /></LazyPage>} />
          <Route path="admin/payments" element={<LazyPage><AdminPaymentsPanel /></LazyPage>} />
          <Route path="admin/credit-packages" element={<LazyPage><AdminCreditPackagesPanel /></LazyPage>} />
          <Route path="admin/promo-codes" element={<LazyPage><AdminPromoCodesPanel /></LazyPage>} />
          <Route path="admin/battle-pass" element={<LazyPage><AdminBattlePassPanel /></LazyPage>} />
          <Route path="admin/missions" element={<LazyPage><AdminMissionsPanel /></LazyPage>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
