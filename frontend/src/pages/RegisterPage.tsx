import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function RegisterPage() {
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validações
    if (!nickname.trim()) {
      setError('Nickname é obrigatório');
      setLoading(false);
      return;
    }

    if (!username.trim()) {
      setError('Nome de usuário é obrigatório');
      setLoading(false);
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Nome de usuário deve conter apenas letras, números e underscore');
      setLoading(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Email inválido');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      setLoading(false);
      return;
    }

    try {
      await axios.post(`${API_URL}/auth/register`, {
        nickname,
        username,
        email,
        password,
      });

      setSuccess(true);
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      if (err.response?.data?.message) {
        if (err.response.data.message.includes('nickname')) {
          setError('Este nickname já está em uso');
        } else if (err.response.data.message.includes('username')) {
          setError('Este nome de usuário já está em uso');
        } else if (err.response.data.message.includes('email')) {
          setError('Este email já está cadastrado');
        } else {
          setError(err.response.data.message);
        }
      } else {
        setError('Erro ao registrar. Tente novamente.');
      }
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-gray-900 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-green-500 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-3xl font-bold mb-4 text-green-400">
              Cadastro Realizado!
            </h1>
            <p className="text-gray-300 mb-6">
              Um email de confirmação foi enviado para <strong>{email}</strong>
            </p>
            <p className="text-gray-400 mb-8">
              Por favor, verifique sua caixa de entrada e clique no link de confirmação para ativar sua conta.
            </p>
            <Link
              to="/login"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Ir para Login
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-purple-900 to-gray-900 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-purple-500">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            ⚔️ Criar Conta
          </h1>
          <p className="text-center text-gray-400 mb-8">Junte-se aos duelistas!</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium mb-2">
                Nickname <span className="text-red-500">*</span>
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Como você quer ser chamado"
                required
                maxLength={30}
              />
              <p className="text-xs text-gray-500 mt-1">Este será seu nome exibido no jogo</p>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2">
                Nome de Usuário <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="usuario_unico"
                required
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
              />
              <p className="text-xs text-gray-500 mt-1">Apenas letras, números e underscore</p>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="seu@email.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Senha <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Mínimo 6 caracteres"
                required
                minLength={6}
              />
              {password && password.length < 6 && (
                <p className="text-xs text-red-400 mt-1">Senha muito curta</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                Confirmar Senha <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  confirmPassword && password !== confirmPassword
                    ? 'border-red-500'
                    : 'border-gray-600'
                }`}
                placeholder="Digite a senha novamente"
                required
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-400 mt-1">As senhas não coincidem</p>
              )}
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500 bg-opacity-20 border border-red-500 text-red-400 px-4 py-3 rounded-lg flex items-center gap-2"
              >
                <span>❌</span>
                <span>{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Cadastrando...</span>
                </>
              ) : (
                'Cadastrar'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-400">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300 font-semibold">
              Entrar
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
