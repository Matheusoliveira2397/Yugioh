import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface User {
  id: string;
  nickname: string;
  username: string;
  email: string;
  wins: number;
  losses: number;
  rating: number;
  gems: number;
  profileImage: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
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
          const response = await axios.post(`${API_URL}/auth/login`, {
            username,
            password,
          });

          const { access_token, user } = response.data;

          set({
            user,
            token: access_token,
            isAuthenticated: true,
          });

          // Configurar token para requisições futuras
          axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        } catch (error) {
          console.error('Login error:', error);
          throw error;
        }
      },

      register: async (username: string, email: string, password: string) => {
        try {
          const response = await axios.post(`${API_URL}/auth/register`, {
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

          axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        } catch (error) {
          console.error('Register error:', error);
          throw error;
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
        delete axios.defaults.headers.common['Authorization'];
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
