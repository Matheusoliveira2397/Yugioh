import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import ArenaFullBleedBackground from '../components/ArenaFullBleedBackground';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { useI18n } from '../i18n/I18nContext';
import LanguageSelector from '../components/LanguageSelector';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface ValidationState {
  isValid: boolean | null;
  message: string;
  checking: boolean;
}

export default function RegisterPage() {
  const { t } = useI18n();
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
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


  // Validar nickname ao sair do campo
  const handleNicknameBlur = async () => {
    if (!nickname.trim()) {
      setNicknameValidation({ isValid: null, message: '', checking: false });
      return;
    }

    setNicknameValidation({ isValid: null, message: t('register.checking'), checking: true });
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

    setUsernameValidation({ isValid: null, message: t('register.checking'), checking: true });
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

    setEmailValidation({ isValid: null, message: t('register.checking'), checking: true });
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
      <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden">
        <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md relative z-10"
        >
          <div className="rounded-2xl shadow-2xl overflow-hidden border border-white/10 bg-slate-900/80 backdrop-blur-xl">
            <div className="p-8 sm:p-10">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/40 mb-5">
                  <span className="text-3xl">✅</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                  {t('register.successTitle')}
                </h1>
                <p className="text-slate-400 text-sm">{t('register.nextStep')}</p>
              </div>

              {emailSent ? (
                <div className="space-y-4 mb-8">
                  <div className="rounded-xl bg-blue-500/10 border border-blue-400/30 p-4">
                    <p className="text-blue-200 font-medium text-sm flex items-center gap-2">
                      <span>📧</span> {t('register.emailSent')}
                    </p>
                    <p className="text-slate-300 text-sm mt-2">
                      {t('register.checkSpam')}
                    </p>
                    <p className="text-amber-200/90 text-sm font-medium mt-1 break-all">{registeredEmail}</p>
                  </div>
                  <p className="text-slate-400 text-sm text-center">
                    {t('register.clickEmailLink')}
                  </p>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-400/30 px-3 py-2 text-center">
                    <p className="text-amber-200 text-xs">
                      {t('register.loginAfterVerify')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 mb-8">
                  <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-4">
                    <p className="text-amber-200 font-medium text-sm flex items-center gap-2">
                      <span>⚠️</span> {t('register.emailMaybeNotSent')}
                    </p>
                    <p className="text-slate-300 text-sm mt-2">
                      {t('register.emailMaybeNotSentHint')}{' '}
                      <strong className="text-slate-200">{registeredEmail}</strong>
                    </p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 border border-amber-400/30 px-3 py-2 text-center">
                    <p className="text-amber-200 text-xs">
                      {t('register.loginAfterVerify')}
                    </p>
                  </div>
                </div>
              )}

              <Link
                to="/login"
                className="block w-full text-center py-3.5 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all"
              >
                {t('register.goToLogin')}
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const inputBase =
    'w-full px-4 py-3 rounded-xl bg-white/5 border text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/50 transition-all';
  const inputValid = 'border-emerald-500/50';
  const inputInvalid = 'border-red-500/50';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <ArenaFullBleedBackground basePathWithoutExt="/images/backgroundLogin" zIndexClass="fixed inset-0 z-0" />
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="rounded-2xl shadow-2xl overflow-hidden border border-white/10 bg-slate-900/80 backdrop-blur-xl">
          {/* Header do card */}
          <div className="px-8 pt-8 pb-6 border-b border-white/5 relative">
            <div className="absolute top-4 right-4">
              <LanguageSelector variant="compact" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white text-center">
              {t('register.title')}
            </h1>
            <p className="text-slate-400 text-center text-sm mt-1">
              {t('register.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {/* Seção: Identificação */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('register.sectionIdentity')}
              </h2>
              <div>
                <label htmlFor="nickname" className="block text-sm font-medium text-slate-200 mb-1.5">
                  {t('register.nickname')} <span className="text-red-400">*</span>
                </label>
                <input
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  onBlur={handleNicknameBlur}
                  className={`${inputBase} ${
                    nicknameValidation.isValid === true
                      ? inputValid
                      : nicknameValidation.isValid === false
                        ? inputInvalid
                        : 'border-white/10'
                  }`}
                  placeholder={t('register.nicknamePlaceholder')}
                  required
                  maxLength={30}
                />
                {nicknameValidation.message && (
                  <p
                    className={`text-xs mt-1.5 ${
                      nicknameValidation.isValid === true
                        ? 'text-emerald-400'
                        : nicknameValidation.isValid === false
                          ? 'text-red-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {nicknameValidation.checking ? '⏳ ' : nicknameValidation.isValid === true ? '✅ ' : '❌ '}
                    {nicknameValidation.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-200 mb-1.5">
                  {t('register.username')} <span className="text-red-400">*</span>
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  onBlur={handleUsernameBlur}
                  className={`${inputBase} ${
                    usernameValidation.isValid === true
                      ? inputValid
                      : usernameValidation.isValid === false
                        ? inputInvalid
                        : 'border-white/10'
                  }`}
                  placeholder={t('register.usernamePlaceholder')}
                  required
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]+"
                />
                {usernameValidation.message && (
                  <p
                    className={`text-xs mt-1.5 ${
                      usernameValidation.isValid === true
                        ? 'text-emerald-400'
                        : usernameValidation.isValid === false
                          ? 'text-red-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {usernameValidation.checking ? '⏳ ' : usernameValidation.isValid === true ? '✅ ' : '❌ '}
                    {usernameValidation.message}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1">{t('register.usernameHint')}</p>
              </div>
            </div>

            {/* Seção: Email */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('register.email')}
              </h2>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-200 mb-1.5">
                  {t('register.email')} <span className="text-red-400">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={handleEmailBlur}
                  className={`${inputBase} ${
                    emailValidation.isValid === true
                      ? inputValid
                      : emailValidation.isValid === false
                        ? inputInvalid
                        : 'border-white/10'
                  }`}
                  placeholder={t('register.emailPlaceholder')}
                  required
                />
                {emailValidation.message && (
                  <p
                    className={`text-xs mt-1.5 ${
                      emailValidation.isValid === true
                        ? 'text-emerald-400'
                        : emailValidation.isValid === false
                          ? 'text-red-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {emailValidation.checking ? '⏳ ' : emailValidation.isValid === true ? '✅ ' : '❌ '}
                    {emailValidation.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="confirmEmail" className="block text-sm font-medium text-slate-200 mb-1.5">
                  {t('register.confirmEmail')} <span className="text-red-400">*</span>
                </label>
                <input
                  id="confirmEmail"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  className={`${inputBase} ${
                    confirmEmail && email && confirmEmail !== email
                      ? inputInvalid
                      : confirmEmail && email && confirmEmail === email
                        ? inputValid
                        : 'border-white/10'
                  }`}
                  placeholder={t('register.confirmEmailPlaceholder')}
                  required
                />
                {confirmEmail && email && confirmEmail !== email && (
                  <p className="text-xs text-red-400 mt-1.5">{t('register.emailsMismatch')}</p>
                )}
                {confirmEmail && email && confirmEmail === email && (
                  <p className="text-xs text-emerald-400 mt-1.5">{t('register.emailsMatch')}</p>
                )}
              </div>
            </div>

            {/* Seção: Senha */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('register.password')}
              </h2>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-200 mb-1.5">
                  {t('register.password')} <span className="text-red-400">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputBase} border-white/10`}
                  placeholder={t('register.passwordPlaceholder')}
                  required
                  minLength={6}
                />
                {password && password.length < 6 && (
                  <p className="text-xs text-red-400 mt-1.5">{t('register.passwordTooShort')}</p>
                )}
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-200 mb-1.5">
                  {t('register.confirmPassword')} <span className="text-red-400">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputBase} ${
                    confirmPassword && password && confirmPassword !== password
                      ? inputInvalid
                      : confirmPassword && password && confirmPassword === password
                        ? inputValid
                        : 'border-white/10'
                  }`}
                  placeholder={t('register.confirmPasswordPlaceholder')}
                  required
                />
                {confirmPassword && password && confirmPassword !== password && (
                  <p className="text-xs text-red-400 mt-1.5">{t('register.passwordsMismatch')}</p>
                )}
                {confirmPassword && password && confirmPassword === password && (
                  <p className="text-xs text-emerald-400 mt-1.5">{t('register.passwordsMatch')}</p>
                )}
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 flex items-center gap-2 text-sm"
              >
                <span>❌</span>
                <span>{error}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                nicknameValidation.isValid === false ||
                usernameValidation.isValid === false ||
                emailValidation.isValid === false
              }
              className="w-full py-3.5 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 focus:ring-2 focus:ring-blue-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" />
                  <span>{t('register.submitting')}</span>
                </>
              ) : (
                t('register.title')
              )}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
              <span className="flex-1 h-px bg-white/10" />
              <span>{t('register.or')}</span>
              <span className="flex-1 h-px bg-white/10" />
            </div>
            <GoogleSignInButton label={t('register.google')} showConfigHint />
          </form>

          <div className="px-8 pb-8 pt-2 text-center">
            <p className="text-slate-400 text-sm">
              {t('register.haveAccountFull')}{' '}
              <Link to="/login" className="text-blue-400 hover:text-blue-300 font-semibold">
                {t('register.loginLink')}
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
