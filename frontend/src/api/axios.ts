import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Criar instância do axios com timeout adequado
// CRÍTICO: Timeout reduzido para falhar rápido e não bloquear outras requisições
export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000, // 10 segundos de timeout (reduzido para falhar rápido quando há WebSocket ativo)
});

// Interceptor para adicionar o token em todas as requisições
api.interceptors.request.use(
  (config) => {
    const authState = useAuthStore.getState();
    const token = authState.token;
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros de autenticação e timeout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Tratar timeout - NÃO bloquear outras requisições
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.warn('⚠️ Timeout na requisição:', error.config?.url);
      // Não mostrar erro para o usuário se for timeout - apenas logar
      error.message = 'A requisição demorou muito para responder.';
    }
    
    // Tratar erro de conexão - NÃO bloquear outras requisições
    if (error.code === 'ERR_NETWORK' || !error.response) {
      console.warn('⚠️ Erro de conexão:', error.config?.url);
      error.message = 'Não foi possível conectar ao servidor.';
    }
    
    // Em 401: fazer logout e redirecionar só se NÃO for a própria requisição de login (senão a página recarrega ao errar usuário/senha)
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    
    // SEMPRE rejeitar o erro, mas não bloquear outras requisições
    return Promise.reject(error);
  }
);

export default api;
