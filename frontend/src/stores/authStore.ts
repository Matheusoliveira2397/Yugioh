import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';
import { useCosmeticsStore } from './cosmeticsStore';

interface User {
  id: number | string; // Aceita number (novo) ou string (antigo para compatibilidade)
  nickname: string;
  username: string;
  email: string;
  winsGeral: number;
  lossesGeral: number;
  winsSeason: number;
  lossesSeason: number;
  profileImage: string;
  role?: 'PLAYER' | 'ADMIN' | 'MASTER';
  level?: number;
  clanTag?: string;
  credits?: number;
  cash?: number;
  seasonScore?: number;
  totalScore?: number;
  /** Pontos da partida ranqueada (sobe e desce) */
  rankedPoints?: number;
  seasonRank?: number;
  generalRank?: number;
  globalRank?: number;
  division?: string;
  adminAllowedTabs?: string[] | null;
  /** ID do deck equipado (identifica o deck mesmo com nomes repetidos) */
  equippedDeckId?: string | null;
  /** Nome do deck equipado (para exibição) */
  equippedDeckName?: string | null;
  /** Moldura do avatar: obelisk | ra | slifer */
  equippedAvatarFrame?: string | null;
  /** Estrelas (premiação de torneios e outras recompensas) */
  stars?: number;
  /** false = precisa escolher nick após login Google */
  profileSetupCompleted?: boolean;
  /** Limite de decks desbloqueado pela maleta */
  maxDecks?: number;
  /** Capacidade total de cartas na maleta */
  maletaCapacity?: number;
  /** Tipos de cartas ativas que o duelista possui */
  ownedActiveCards?: number;
  /** Total de cartas ativas no jogo */
  totalActiveCards?: number;
  /** % da coleção (cartas ativas que tem / cartas ativas no jogo) */
  collectionPercent?: number;
  group?: {
    id: string;
    name: string;
    tag: string;
    logo?: string;
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginMaster: (username: string, password: string) => Promise<void>;
  /** Troca o código one-time do OAuth Google por sessão JWT. Retorna se precisa escolher nick. */
  loginWithSession: (exchangeCode: string) => Promise<{ needsNicknameSetup: boolean }>;
  completeGoogleNickname: (nickname: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  setUser: (user: User) => void;
  setTokens: (token: string, refreshToken: string) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

/** Throttle de /users/me entre Layout, perfil e focus */
let lastRefreshUserAt = 0;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        try {
          const response = await api.post('/auth/login', {
            username,
            password,
          });

          const { access_token, refresh_token, user } = response.data;

          set({
            user,
            token: access_token,
            refreshToken: refresh_token ?? null,
            isAuthenticated: true,
          });
          useCosmeticsStore.getState().resetCosmetics();
        } catch (error) {
          console.error('Login error:', error);
          throw error;
        }
      },

      loginMaster: async (username: string, password: string) => {
        try {
          const response = await api.post('/auth/login-master', {
            username,
            password,
          });

          const { access_token, refresh_token, user } = response.data;

          set({
            user,
            token: access_token,
            refreshToken: refresh_token ?? null,
            isAuthenticated: true,
          });
          useCosmeticsStore.getState().resetCosmetics();
        } catch (error) {
          console.error('Login Master error:', error);
          throw error;
        }
      },

      loginWithSession: async (exchangeCode: string) => {
        const response = await api.post('/auth/google/exchange', {
          code: exchangeCode,
        });
        const { access_token, refresh_token, user, needsNicknameSetup } = response.data;
        set({
          user: {
            ...user,
            profileSetupCompleted: needsNicknameSetup ? false : user?.profileSetupCompleted !== false,
          },
          token: access_token,
          refreshToken: refresh_token ?? null,
          isAuthenticated: true,
        });
        useCosmeticsStore.getState().resetCosmetics();
        return { needsNicknameSetup: Boolean(needsNicknameSetup) };
      },

      completeGoogleNickname: async (nickname: string) => {
        const response = await api.post('/auth/google/complete-profile', { nickname });
        const { access_token, refresh_token, user } = response.data;
        set({
          user: { ...user, profileSetupCompleted: true },
          token: access_token ?? get().token,
          refreshToken: refresh_token ?? get().refreshToken,
          isAuthenticated: true,
        });
      },

      register: async (username: string, email: string, password: string) => {
        try {
          const response = await api.post('/auth/register', {
            username,
            email,
            password,
          });

          const { access_token, refresh_token, user } = response.data;

          set({
            user,
            token: access_token,
            refreshToken: refresh_token ?? null,
            isAuthenticated: true,
          });
        } catch (error) {
          console.error('Register error:', error);
          throw error;
        }
      },

      setUser: (user: User) => {
        set({ user });
      },

      setTokens: (token: string, refreshToken: string) => {
        set({ token, refreshToken });
      },

      refreshUser: async () => {
        const currentState = useAuthStore.getState();
        if (!currentState.token || !currentState.isAuthenticated) {
          return;
        }

        const now = Date.now();
        if (now - lastRefreshUserAt < 15000) {
          return;
        }
        lastRefreshUserAt = now;

        try {
          const response = await api.get('/users/me', { timeout: 8000 });
          const updatedUser = response.data;
          set({ user: updatedUser });
        } catch (error) {
          console.error('Erro ao atualizar dados do usuário:', error);
        }
      },

      logout: () => {
        useCosmeticsStore.getState().resetCosmetics();
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
