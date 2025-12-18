import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
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
import AdminCardsPanel from './pages/AdminCardsPanel';
import AdminPlayersPanel from './pages/AdminPlayersPanel';
import AdminNewsPanel from './pages/AdminNewsPanel';
import MissionsPage from './pages/MissionsPage';
import DropsPage from './pages/DropsPage';
import DuelArena from './pages/DuelArena';
import ArenaPage from './pages/ArenaPage';
import ActiveDuelsPage from './pages/ActiveDuelsPage';
import FinishedDuelsPage from './pages/FinishedDuelsPage';
import Layout from './components/Layout';

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        
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
      </Routes>
    </Router>
  );
}

export default App;
