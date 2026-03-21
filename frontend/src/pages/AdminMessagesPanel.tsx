import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import LoginBroadcastRichEditor, {
  isLoginBroadcastBodyEmpty,
} from '../components/admin/LoginBroadcastRichEditor';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type LoginBroadcastActive = {
  id: string;
  title: string;
  bodyHtml: string;
  createdAt: string;
};

export default function AdminMessagesPanel() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const [lbTitle, setLbTitle] = useState('');
  const [lbHtml, setLbHtml] = useState('');
  const [lbActive, setLbActive] = useState<LoginBroadcastActive | null>(null);
  const [lbSaving, setLbSaving] = useState(false);
  const [lbError, setLbError] = useState<string | null>(null);
  const [lbSuccess, setLbSuccess] = useState<string | null>(null);
  const [showLbPreview, setShowLbPreview] = useState(false);
  const [lbEditorMode, setLbEditorMode] = useState<'visual' | 'html'>('visual');

  const authHeaders = token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : {};

  useEffect(() => {
    if (!token || !user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) return;
    let c = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/admin/login-broadcast`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 20000,
        });
        if (c) return;
        const a = data?.active as LoginBroadcastActive | null | undefined;
        setLbActive(a ?? null);
        if (a) {
          setLbTitle(a.title ?? '');
          setLbHtml(a.bodyHtml ?? '');
        }
      } catch {
        if (!c) setLbActive(null);
      }
    })();
    return () => {
      c = true;
    };
  }, [token, user?.id, user?.role]);

  // Proteção: apenas ADMIN ou MASTER
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MASTER')) {
    return <Navigate to="/" replace />;
  }

  const handlePublishLoginBroadcast = async () => {
    if (!token) {
      setLbError('Token não encontrado');
      return;
    }
    if (isLoginBroadcastBodyEmpty(lbHtml)) {
      setLbError('Escreva o conteúdo do aviso no editor');
      return;
    }
    setLbSaving(true);
    setLbError(null);
    setLbSuccess(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/admin/login-broadcast/publish`,
        { title: lbTitle.trim(), bodyHtml: lbHtml },
        { headers: authHeaders, timeout: 60000 },
      );
      setLbSuccess(`Aviso publicado. Novo id: ${data?.broadcast?.id || '—'} — todos os jogadores verão ao entrar até dispensarem.`);
      const fresh = await axios.get(`${API_URL}/admin/login-broadcast`, { headers: authHeaders, timeout: 20000 });
      setLbActive(fresh.data?.active ?? null);
    } catch (err: any) {
      setLbError(err.response?.data?.message || err.message || 'Erro ao publicar aviso');
    } finally {
      setLbSaving(false);
    }
  };

  const handleClearLoginBroadcast = async () => {
    if (!token) return;
    if (!confirm('Remover o aviso ativo? Ninguém verá modal até você publicar outro.')) return;
    setLbSaving(true);
    setLbError(null);
    setLbSuccess(null);
    try {
      await axios.post(`${API_URL}/admin/login-broadcast/clear`, {}, { headers: authHeaders, timeout: 20000 });
      setLbActive(null);
      setLbSuccess('Aviso desativado.');
    } catch (err: any) {
      setLbError(err.response?.data?.message || err.message || 'Erro ao limpar');
    } finally {
      setLbSaving(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      setError('Por favor, digite uma mensagem');
      return;
    }

    if (!token) {
      setError('Token de autenticação não encontrado');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);
    setSentCount(null);

    try {
      const response = await axios.post(
        `${API_URL}/admin/messages/broadcast`,
        { content: message },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setSuccess(true);
      setSentCount(response.data.sentCount || 0);
      setMessage('');
      
      // Limpar mensagem de sucesso após 5 segundos
      setTimeout(() => {
        setSuccess(false);
        setSentCount(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao enviar mensagem:', err);
      setError(
        err.response?.data?.message || 
        err.message || 
        'Erro ao enviar mensagem para todos os usuários'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-4">
            <span className="text-6xl">📢</span>
            <div>
              <h1 className="text-5xl font-bold text-white">Mensagens em Massa</h1>
              <p className="text-slate-400 text-lg">
                Envie mensagens para todos os usuários do sistema
              </p>
            </div>
          </div>

          {/* Badge de Admin */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg">
            <span className="text-2xl">👑</span>
            <span className="text-yellow-400 font-bold">
              {user.role === 'MASTER' ? 'MASTER' : 'ADMIN'}
            </span>
          </div>
        </motion.div>

        {/* Card de Envio */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-purple-900/50 to-blue-900/50 rounded-xl p-6 border border-purple-500/30 shadow-xl"
        >
          <div className="mb-6">
            <label className="block text-white font-semibold mb-2 text-lg">
              Mensagem
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem que será enviada para todos os usuários..."
              className="w-full h-40 px-4 py-3 bg-slate-800/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              disabled={loading}
            />
            <p className="text-gray-400 text-sm mt-2">
              {message.length} caracteres
            </p>
          </div>

          {/* Mensagens de Feedback */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg"
            >
              <p className="text-red-300 font-semibold">❌ {error}</p>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg"
            >
              <p className="text-green-300 font-semibold">
                ✅ Mensagem enviada com sucesso!
                {sentCount !== null && (
                  <span className="block mt-1 text-sm">
                    Enviada para {sentCount} usuário(s)
                  </span>
                )}
              </p>
            </motion.div>
          )}

          {/* Botões */}
          <div className="flex gap-4">
            <button
              onClick={handleSendMessage}
              disabled={loading || !message.trim()}
              className={`
                flex-1 px-6 py-3 rounded-lg font-bold text-white transition-all
                ${loading || !message.trim()
                  ? 'bg-gray-600 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 hover:scale-105 shadow-lg'
                }
              `}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  Enviando...
                </span>
              ) : (
                '📤 Enviar para Todos os Usuários'
              )}
            </button>
            <button
              onClick={() => navigate('/admin')}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-all"
            >
              ← Voltar
            </button>
          </div>

          {/* Aviso */}
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-300 text-sm">
              ⚠️ <strong>Atenção:</strong> Esta mensagem será enviada para todos os usuários cadastrados no sistema. 
              Use com responsabilidade.
            </p>
          </div>
        </motion.div>

        {/* Aviso ao login (modal rico em HTML) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-8 bg-gradient-to-br from-slate-900/60 to-indigo-900/40 rounded-xl p-6 border border-indigo-500/30 shadow-xl"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="text-3xl">🪟</span> Aviso ao entrar no jogo
              </h2>
              <p className="text-slate-400 text-sm mt-1 max-w-2xl">
                Ao publicar, <strong>todos os jogadores</strong> veem um <strong>modal</strong> ao entrar no site. Use o{' '}
                <strong>editor visual</strong> (como Word): negrito, cores, listas, links e{' '}
                <strong>imagem</strong> pela barra (cole a URL da arte da carta ou banner). Modo <strong>HTML</strong> para ajustes finos.
              </p>
            </div>
          </div>

          {lbActive && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-xs">
              <span className="font-semibold">Aviso ativo:</span> {lbActive.title || '(sem título)'} · id{' '}
              <code className="text-white/80">{lbActive.id}</code> ·{' '}
              {lbActive.createdAt ? new Date(lbActive.createdAt).toLocaleString('pt-BR') : ''}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-white font-semibold mb-2">Título do modal</label>
              <input
                type="text"
                value={lbTitle}
                onChange={(e) => setLbTitle(e.target.value)}
                placeholder="Ex.: Novidades da temporada"
                disabled={lbSaving}
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-indigo-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="block text-white font-semibold">Conteúdo do aviso</label>
                <div className="flex rounded-lg overflow-hidden border border-indigo-500/40">
                  <button
                    type="button"
                    onClick={() => setLbEditorMode('visual')}
                    disabled={lbSaving}
                    className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                      lbEditorMode === 'visual'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Editor visual
                  </button>
                  <button
                    type="button"
                    onClick={() => setLbEditorMode('html')}
                    disabled={lbSaving}
                    className={`px-3 py-1.5 text-sm font-semibold transition-colors ${
                      lbEditorMode === 'html'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    HTML
                  </button>
                </div>
              </div>
              {lbEditorMode === 'visual' ? (
                <LoginBroadcastRichEditor
                  value={lbHtml}
                  onChange={setLbHtml}
                  readOnly={lbSaving}
                  placeholder="Escreva aqui o texto do aviso. Use a barra para formatar, inserir link ou imagem (URL)…"
                />
              ) : (
                <textarea
                  value={lbHtml}
                  onChange={(e) => setLbHtml(e.target.value)}
                  placeholder="HTML bruto (avançado)"
                  disabled={lbSaving}
                  className="w-full min-h-[280px] px-4 py-3 bg-slate-800/50 border border-indigo-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowLbPreview((v) => !v)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold"
              >
                {showLbPreview ? 'Ocultar prévia' : 'Prévia (como o jogador vê)'}
              </button>
            </div>

            {showLbPreview && !isLoginBroadcastBodyEmpty(lbHtml) && (
              <div className="rounded-xl border border-white/20 bg-black/40 p-4 max-h-80 overflow-y-auto text-sm text-white/90 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_a]:text-purple-300 [&_a]:underline">
                <p className="text-xs text-white/50 mb-2">Simulação do modal no jogo</p>
                <div dangerouslySetInnerHTML={{ __html: lbHtml }} />
              </div>
            )}

            {lbError && (
              <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm">{lbError}</div>
            )}
            {lbSuccess && (
              <div className="p-3 rounded-lg bg-green-500/20 border border-green-500/50 text-green-200 text-sm">{lbSuccess}</div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePublishLoginBroadcast}
                disabled={lbSaving || isLoginBroadcastBodyEmpty(lbHtml)}
                className="px-6 py-3 rounded-lg font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {lbSaving ? 'Publicando…' : '📌 Publicar aviso (todos os jogadores)'}
              </button>
              <button
                type="button"
                onClick={handleClearLoginBroadcast}
                disabled={lbSaving || !lbActive}
                className="px-6 py-3 rounded-lg font-bold text-white bg-slate-700 hover:bg-slate-600 disabled:opacity-40"
              >
                Desativar aviso atual
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

