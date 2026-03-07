import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import LoginMasterPage from './pages/LoginMasterPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ConfirmEmailChangePage from './pages/ConfirmEmailChangePage';
import HomePage from './pages/NewHomePage';
import DeckBuilderPage from './pages/DeckBuilderPage';
import DeckEditPage from './pages/DeckEditPage';
import DuelPage from './pages/DuelPage';
import TournamentPage from './pages/TournamentPage';
import ChatPage from './pages/ChatPage';
import RandomDuelPage from './pages/RandomDuelPage';
import InventoryPage from './pages/InventoryPage';
import FriendsPage from './pages/FriendsPage';
import ShopPage from './pages/ShopPage';
import ShopCardsPage from './pages/ShopCardsPage';
import GroupsPage from './pages/GroupsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import RankingPage from './pages/RankingPage';
import { ProfilePage } from './pages/ProfilePage';
import AdminPanel from './pages/AdminPanel';
import AdminCreateAccountPanel from './pages/AdminCreateAccountPanel';
import AdminCardsPanel from './pages/AdminCardsPanel';
import AdminPlayersPanel from './pages/AdminPlayersPanel';
import AdminNewsPanel from './pages/AdminNewsPanel';
import AdminPlaymatsPanel from './pages/AdminPlaymatsPanel';
import AdminSleevesPanel from './pages/AdminSleevesPanel';
import AdminInitialDecksPanel from './pages/AdminInitialDecksPanel';
import AdminTournamentsPanel from './pages/AdminTournamentsPanel';
import AdminArenaPanel from './pages/AdminArenaPanel';
import AdminArenaSchedulesPanel from './pages/AdminArenaSchedulesPanel';
import AdminSeasonsPanel from './pages/AdminSeasonsPanel';
import AdminSiteTabsPanel from './pages/AdminSiteTabsPanel';
import AdminMessagesPanel from './pages/AdminMessagesPanel';
import AdminAchievementsPanel from './pages/AdminAchievementsPanel';
import AdminDivisionsPanel from './pages/AdminDivisionsPanel';
import AdminCashDivisionPanel from './pages/AdminCashDivisionPanel';
import AdminRandomDuelLevelRangesPanel from './pages/AdminRandomDuelLevelRangesPanel';
import AdminSocialMediaPanel from './pages/AdminSocialMediaPanel';
import AdminNewAccountSettingsPanel from './pages/AdminNewAccountSettingsPanel';
import AdminWatchDuelPage from './pages/AdminWatchDuelPage';
import AdminActiveDuelsPanel from './pages/AdminActiveDuelsPanel';
import CreditPage from './pages/CreditPage';
import HelpPage from './pages/HelpPage';
import MissionsPage from './pages/MissionsPage';
import DropsPage from './pages/DropsPage';
import DuelArena from './pages/DuelArena';
import ArenaPage from './pages/ArenaPage';
import ActiveDuelsPage from './pages/ActiveDuelsPage';
import FinishedDuelsPage from './pages/FinishedDuelsPage';
import NewsDetailPage from './pages/NewsDetailPage';
import Layout from './components/Layout';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/loginMaster" element={<LoginMasterPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/confirm-email-change/:token" element={<ConfirmEmailChangePage />} />
        
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Layout>
                <HomePage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/home"
          element={
            isAuthenticated ? (
              <Layout>
                <HomePage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/deck-builder"
          element={
            isAuthenticated ? (
              <Layout>
                <DeckBuilderPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/deck-edit"
          element={
            isAuthenticated ? (
              <Layout>
                <DeckEditPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/tournaments"
          element={
            isAuthenticated ? (
              <Layout>
                <TournamentPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/chat"
          element={
            isAuthenticated ? (
              <Layout>
                <ChatPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/random-duel"
          element={
            isAuthenticated ? (
              <Layout>
                <RandomDuelPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        {/* Arena de Desafios - Lista de Arenas */}
        <Route
          path="/arena"
          element={
            isAuthenticated ? (
              <Layout>
                <ArenaPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* Duelo - SEM Layout (campo de duelo) */}
        <Route
          path="/duel/:duelId"
          element={
            isAuthenticated ? (
              <DuelArena />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/inventory"
          element={
            isAuthenticated ? (
              <Layout>
                <InventoryPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/friends"
          element={
            isAuthenticated ? (
              <Layout>
                <FriendsPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/shop"
          element={
            isAuthenticated ? (
              <Layout>
                <ShopPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/shop-cards"
          element={
            isAuthenticated ? (
              <Layout>
                <ShopCardsPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/profile"
          element={
            isAuthenticated ? (
              <Layout>
                <ProfilePage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/groups"
          element={
            isAuthenticated ? (
              <Layout>
                <GroupsPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/groups/:id"
          element={
            isAuthenticated ? (
              <Layout>
                <GroupDetailPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/ranking"
          element={
            isAuthenticated ? (
              <Layout>
                <RankingPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/missions"
          element={
            isAuthenticated ? (
              <Layout>
                <MissionsPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/drops"
          element={
            isAuthenticated ? (
              <Layout>
                <DropsPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/profile/:id"
          element={
            isAuthenticated ? (
              <Layout>
                <ProfilePage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/create-account"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminCreateAccountPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/cartas"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminCardsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/players"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminPlayersPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/news"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminNewsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/playmats"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminPlaymatsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/sleeves"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminSleevesPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/initial-decks"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminInitialDecksPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/tournaments"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminTournamentsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/arena"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminArenaPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/watch-duel"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminWatchDuelPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/active-duels"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminActiveDuelsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/arena/schedules"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminArenaSchedulesPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        
        <Route
          path="/admin/seasons"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminSeasonsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/site-tabs"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminSiteTabsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/messages"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminMessagesPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/admin/achievements"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminAchievementsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/admin/divisions"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminDivisionsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/random-duel-level-ranges"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminRandomDuelLevelRangesPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/social-media"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminSocialMediaPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/new-account-settings"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminNewAccountSettingsPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/admin/cash-division"
          element={
            isAuthenticated ? (
              <Layout>
                <AdminCashDivisionPanel />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/credit"
          element={
            isAuthenticated ? (
              <Layout>
                <CreditPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/help"
          element={
            isAuthenticated ? (
              <Layout>
                <HelpPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/active-duels"
          element={
            isAuthenticated ? (
              <Layout>
                <ActiveDuelsPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/finished-duels"
          element={
            isAuthenticated ? (
              <Layout>
                <FinishedDuelsPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        <Route
          path="/news/:id"
          element={
            isAuthenticated ? (
              <Layout>
                <NewsDetailPage />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
