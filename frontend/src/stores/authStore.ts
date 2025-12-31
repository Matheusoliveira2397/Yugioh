import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api/axios';

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
  experience?: number;
  avatar?: string;
  clanTag?: string;
  credits?: number;
  cash?: number;
  seasonScore?: number;
  totalScore?: number;
  seasonRank?: number;
  generalRank?: number;
  globalRank?: number;
  division?: string;
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
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  setUser: (user: User) => void;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (username: string, password: string) => {
        try {
          const response = await api.post('/auth/login', {
            username,
            password,
          });

          const { access_token, user } = response.data;

          set({
            user,
            token: access_token,
            isAuthenticated: true,
          });
        } catch (error) {
          console.error('Login error:', error);
          throw error;
        }
      },

      register: async (username: string, email: string, password: string) => {
        try {
          const response = await api.post('/auth/register', {
            username,
            email,
            password,
          });

          const { access_token, user } = response.data;

          set({
            user,
            token: access_token,
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

      refreshUser: async () => {
        const currentState = useAuthStore.getState();
        if (!currentState.token || !currentState.isAuthenticated) {
          return;
        }

        try {
          // O axios já adiciona o token automaticamente via interceptor
          const response = await api.get('/users/me');
          const updatedUser = response.data;
          set({ user: updatedUser });
        } catch (error) {
          console.error('Erro ao atualizar dados do usuário:', error);
          // Não fazer logout em caso de erro, apenas logar o erro
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
