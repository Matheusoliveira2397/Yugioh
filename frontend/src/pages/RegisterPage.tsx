import { useState, FormEvent, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface ValidationState {
  isValid: boolean | null;
  message: string;
  checking: boolean;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verificationLink, setVerificationLink] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>('');

  const [nicknameValidation, setNicknameValidation] = useState<ValidationState>({
    isValid: null,
    message: '',
    checking: false,
  });
  const [usernameValidation, setUsernameValidation] = useState<ValidationState>({
    isValid: null,
    message: '',
    checking: false,
  });
  const [emailValidation, setEmailValidation] = useState<ValidationState>({
    isValid: null,
    message: '',
    checking: false,
  });

  const nicknameTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const usernameTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const emailTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Validar nickname ao sair do campo
  const handleNicknameBlur = async () => {
    if (!nickname.trim()) {
      setNicknameValidation({ isValid: null, message: '', checking: false });
      return;
    }

    setNicknameValidation({ isValid: null, message: 'Verificando...', checking: true });
    try {
      const response = await axios.get(`${API_URL}/auth/check-nickname`, {
        params: { nickname: nickname.trim() },
      });
      setNicknameValidation({
        isValid: response.data.available,
        message: response.data.message,
        checking: false,
      });
    } catch (error: any) {
      setNicknameValidation({
        isValid: false,
        message: error.response?.data?.message || 'Erro ao verificar nickname',
        checking: false,
      });
    }
  };

  // Validar username ao sair do campo
  const handleUsernameBlur = async () => {
    if (!username.trim()) {
      setUsernameValidation({ isValid: null, message: '', checking: false });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameValidation({
        isValid: false,
        message: 'Username deve conter apenas letras, números e underscore',
        checking: false,
      });
      return;
    }

    setUsernameValidation({ isValid: null, message: 'Verificando...', checking: true });
    try {
      const response = await axios.get(`${API_URL}/auth/check-username`, {
        params: { username: username.trim().toLowerCase() },
      });
      setUsernameValidation({
        isValid: response.data.available,
        message: response.data.message,
        checking: false,
      });
    } catch (error: any) {
      setUsernameValidation({
        isValid: false,
        message: error.response?.data?.message || 'Erro ao verificar username',
        checking: false,
      });
    }
  };

  // Validar email ao sair do campo
  const handleEmailBlur = async () => {
    if (!email.trim()) {
      setEmailValidation({ isValid: null, message: '', checking: false });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailValidation({
        isValid: false,
        message: 'Email inválido',
        checking: false,
      });
      return;
    }

    setEmailValidation({ isValid: null, message: 'Verificando...', checking: true });
    try {
      const response = await axios.get(`${API_URL}/auth/check-email`, {
        params: { email: email.trim().toLowerCase() },
      });
      setEmailValidation({
        isValid: response.data.available,
        message: response.data.message,
        checking: false,
      });
    } catch (error: any) {
      setEmailValidation({
        isValid: false,
        message: error.response?.data?.message || 'Erro ao verificar email',
        checking: false,
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Validações
    if (!nickname.trim()) {
      setError('Nickname é obrigatório');
      return;
    }

    if (nicknameValidation.isValid === false) {
      setError('Por favor, escolha um nickname disponível');
      return;
    }

    if (!username.trim()) {
      setError('Nome de usuário é obrigatório');
      return;
    }

    if (usernameValidation.isValid === false) {
      setError('Por favor, escolha um username disponível');
      return;
    }

    if (!email.trim()) {
      setError('Email é obrigatório');
      return;
    }

    if (emailValidation.isValid === false) {
      setError('Por favor, use um email disponível');
      return;
    }

    if (email !== confirmEmail) {
      setError('Os emails não coincidem');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/register`, {
        nickname: nickname.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        confirmEmail: confirmEmail.trim().toLowerCase(),
        password,
        confirmPassword,
      });

      setEmailSent(response.data.emailSent || false);
      setVerificationLink(response.data.verificationLink || null);
      setRegisteredEmail(response.data.email || email.trim().toLowerCase());
      setSuccess(true);
      
      // Não redirecionar automaticamente - deixar usuário ver a mensagem
      // setTimeout(() => {
      //   navigate('/login');
      // }, 3000);
    } catch (err: any) {
      setLoading(false);
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Erro ao registrar. Tente novamente.');
      }
    }
  };

  if (success) {
    return (
      <div 
        className="min-h-screen flex items-center justify-center px-4 relative"
        style={{
          backgroundImage: 'url(/images/backgroundLogin.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-60 z-0"></div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full relative z-10"
        >
          <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-green-500">
            <div className="text-center mb-6">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-3xl font-bold mb-4 text-green-400">
              Cadastro Realizado!
            </h1>
            </div>
            
            {emailSent ? (
              <>
                <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4 mb-6">
                  <p className="text-blue-200 mb-2">
                    📧 <strong>Email de verificação enviado!</strong>
                  </p>
                  <p className="text-gray-300 text-sm">
                    Verifique sua caixa de entrada (e pasta de spam) no email: <strong>{registeredEmail}</strong>
                  </p>
                </div>
                <p className="text-gray-300 mb-4 text-center">
                  Clique no link no email para ativar sua conta.
                </p>
                <p className="text-yellow-300 mb-6 text-center text-sm">
                  ⚠️ <strong>Importante:</strong> Você só poderá fazer login após verificar seu email!
                </p>
              </>
            ) : (
              <>
                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 mb-6">
                  <p className="text-yellow-200 mb-2">
                    ⚠️ <strong>Email não foi enviado automaticamente</strong>
            </p>
                  <p className="text-gray-300 text-sm mb-3">
                    Use o link abaixo para verificar sua conta:
                  </p>
                  {verificationLink && (
                    <div className="bg-gray-900 rounded p-3 mb-3">
                      <p className="text-xs text-gray-400 mb-2">Link de verificação:</p>
                      <a 
                        href={verificationLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 break-all text-sm underline"
                      >
                        {verificationLink}
                      </a>
                    </div>
                  )}
                </div>
                <p className="text-yellow-300 mb-6 text-center text-sm">
                  ⚠️ <strong>Importante:</strong> Você só poderá fazer login após verificar seu email!
            </p>
              </>
            )}
            
            <div className="text-center">
            <Link
              to="/login"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Ir para Login
            </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 py-8 relative"
      style={{
        backgroundImage: 'url(/images/backgroundLogin.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-60 z-0"></div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full relative z-10"
      >
        <div className="bg-gray-800 rounded-lg shadow-2xl p-8 border border-purple-500">
          <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            ⚔️ Criar Conta
          </h1>
          <p className="text-center text-gray-400 mb-8">Junte-se aos duelistas!</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nickname */}
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium mb-2 text-gray-200">
                Nickname <span className="text-red-500">*</span>
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                onBlur={handleNicknameBlur}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  nicknameValidation.isValid === true
                    ? 'border-green-500'
                    : nicknameValidation.isValid === false
                    ? 'border-red-500'
                    : 'border-gray-600'
                }`}
                placeholder="Como você quer ser chamado"
                required
                maxLength={30}
              />
              {nicknameValidation.message && (
                <p
                  className={`text-xs mt-1 ${
                    nicknameValidation.isValid === true
                      ? 'text-green-400'
                      : nicknameValidation.isValid === false
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {nicknameValidation.checking ? '⏳ ' : nicknameValidation.isValid === true ? '✅ ' : '❌ '}
                  {nicknameValidation.message}
                </p>
              )}
            </div>

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2 text-gray-200">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                onBlur={handleUsernameBlur}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  usernameValidation.isValid === true
                    ? 'border-green-500'
                    : usernameValidation.isValid === false
                    ? 'border-red-500'
                    : 'border-gray-600'
                }`}
                placeholder="usuario_unico"
                required
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
              />
              {usernameValidation.message && (
                <p
                  className={`text-xs mt-1 ${
                    usernameValidation.isValid === true
                      ? 'text-green-400'
                      : usernameValidation.isValid === false
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {usernameValidation.checking ? '⏳ ' : usernameValidation.isValid === true ? '✅ ' : '❌ '}
                  {usernameValidation.message}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">Apenas letras, números e underscore</p>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2 text-gray-200">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  emailValidation.isValid === true
                    ? 'border-green-500'
                    : emailValidation.isValid === false
                    ? 'border-red-500'
                    : 'border-gray-600'
                }`}
                placeholder="seu@email.com"
                required
              />
              {emailValidation.message && (
                <p
                  className={`text-xs mt-1 ${
                    emailValidation.isValid === true
                      ? 'text-green-400'
                      : emailValidation.isValid === false
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`}
                >
                  {emailValidation.checking ? '⏳ ' : emailValidation.isValid === true ? '✅ ' : '❌ '}
                  {emailValidation.message}
                </p>
              )}
            </div>

            {/* Confirmar Email */}
            <div>
              <label htmlFor="confirmEmail" className="block text-sm font-medium mb-2 text-gray-200">
                Confirmar Email <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmEmail"
                type="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  confirmEmail && email && confirmEmail !== email
                    ? 'border-red-500'
                    : confirmEmail && email && confirmEmail === email
                    ? 'border-green-500'
                    : 'border-gray-600'
                }`}
                placeholder="confirme@email.com"
                required
              />
              {confirmEmail && email && confirmEmail !== email && (
                <p className="text-xs text-red-400 mt-1">❌ Os emails não coincidem</p>
              )}
              {confirmEmail && email && confirmEmail === email && (
                <p className="text-xs text-green-400 mt-1">✅ Emails coincidem</p>
              )}
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2 text-gray-200">
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
                <p className="text-xs text-red-400 mt-1">❌ Senha muito curta (mínimo 6 caracteres)</p>
              )}
            </div>

            {/* Confirmar Senha */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2 text-gray-200">
                Confirmar Senha <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  confirmPassword && password && confirmPassword !== password
                    ? 'border-red-500'
                    : confirmPassword && password && confirmPassword === password
                    ? 'border-green-500'
                    : 'border-gray-600'
                }`}
                placeholder="Digite a senha novamente"
                required
              />
              {confirmPassword && password && confirmPassword !== password && (
                <p className="text-xs text-red-400 mt-1">❌ As senhas não coincidem</p>
              )}
              {confirmPassword && password && confirmPassword === password && (
                <p className="text-xs text-green-400 mt-1">✅ Senhas coincidem</p>
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
              disabled={loading || nicknameValidation.isValid === false || usernameValidation.isValid === false || emailValidation.isValid === false}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Cadastrando...</span>
                </>
              ) : (
                'Criar Conta'
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
