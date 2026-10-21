import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { Navigate } from 'react-router-dom';
import api from '../api/axios';

type PatchNoteCategory = 'bugfix' | 'cards' | 'features' | 'balance' | 'other';

interface PatchNote {
  id: string;
  title: string;
  content: string;
  version?: string | null;
  category: PatchNoteCategory;
  isActive: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  author?: {
    nickname: string;
    username: string;
    clanTag?: string;
  };
}

const CATEGORIES: { value: PatchNoteCategory; label: string; icon: string }[] = [
  { value: 'bugfix', label: 'Correções', icon: '🐛' },
  { value: 'cards', label: 'Cartas', icon: '🎴' },
  { value: 'features', label: 'Novidades', icon: '✨' },
  { value: 'balance', label: 'Balanceamento', icon: '⚖️' },
  { value: 'other', label: 'Outros', icon: '📌' },
];

const emptyForm = {
  title: '',
  content: '',
  version: '',
  category: 'bugfix' as PatchNoteCategory,
  isPinned: false,
  isActive: true,
};

export default function AdminPatchNotesPanel() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<PatchNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PatchNote | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isAdmin = !!user && (user.role === 'ADMIN' || user.role === 'MASTER');

  const loadNotes = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/patch-notes');
      setNotes(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Erro ao carregar patch notes:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar patch notes' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    void loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const resetForm = () => {
    setFormData(emptyForm);
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const payload = {
      title: formData.title.trim(),
      content: formData.content.trim(),
      version: formData.version.trim() || undefined,
      category: formData.category,
      isPinned: formData.isPinned,
      isActive: formData.isActive,
    };

    try {
      if (editing) {
        await api.patch(`/admin/patch-notes/${editing.id}`, payload);
        setMessage({ type: 'success', text: '✅ Patch note atualizado!' });
      } else {
        await api.post('/admin/patch-notes', payload);
        setMessage({ type: 'success', text: '✅ Patch note publicado!' });
      }
      resetForm();
      setShowForm(false);
      await loadNotes();
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: `❌ ${error.response?.data?.message || error.message || 'Erro ao salvar'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (note: PatchNote) => {
    setEditing(note);
    setFormData({
      title: note.title,
      content: note.content,
      version: note.version || '',
      category: note.category || 'other',
      isPinned: note.isPinned,
      isActive: note.isActive,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente deletar este patch note?')) return;
    try {
      await api.delete(`/admin/patch-notes/${id}`);
      setMessage({ type: 'success', text: '✅ Patch note deletado' });
      await loadNotes();
    } catch {
      setMessage({ type: 'error', text: '❌ Erro ao deletar' });
    }
  };

  const toggleField = async (note: PatchNote, field: 'isPinned' | 'isActive') => {
    try {
      await api.patch(`/admin/patch-notes/${note.id}`, { [field]: !note[field] });
      await loadNotes();
    } catch {
      setMessage({ type: 'error', text: '❌ Erro ao atualizar' });
    }
  };

  const categoryMeta = (cat: PatchNoteCategory) =>
    CATEGORIES.find((c) => c.value === cat) || CATEGORIES[CATEGORIES.length - 1];

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-lg p-6 mb-8 shadow-2xl border border-indigo-700/40">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <button
              onClick={() => navigate('/admin')}
              className="text-sm text-indigo-300 hover:text-white mb-2"
            >
              ← Voltar ao painel
            </button>
            <h1 className="text-3xl md:text-4xl font-bold mb-1">📋 Patch Notes</h1>
            <p className="text-gray-300">
              Publique correções, cadastro de cartas e outras atualizações
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
          >
            {showForm ? '❌ Cancelar' : '➕ Novo Patch Note'}
          </button>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-500'
              : 'bg-red-900/50 border border-red-500'
          }`}
        >
          <p className="text-white font-semibold">{message.text}</p>
        </motion.div>
      )}

      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700"
        >
          <h2 className="text-2xl font-bold mb-6">
            {editing ? '✏️ Editar Patch Note' : '➕ Novo Patch Note'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-2">Título *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Correções e novas cartas"
                />
              </div>
              <div>
                <label className="block text-sm font-bold mb-2">Versão (opcional)</label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: 1.4.2"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Categoria</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat.value })}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      formData.category === cat.value
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Conteúdo *</label>
              <textarea
                required
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500 h-56 font-mono text-sm"
                placeholder={
                  '- Corrigido bug X\n- Adicionadas cartas Y e Z\n- Ajuste de efeito da carta W'
                }
              />
              <p className="text-sm text-gray-500 mt-2">
                {formData.content.length} caracteres — use uma linha por item
              </p>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isPinned}
                  onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                />
                <span>📌 Fixar no topo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span>👁️ Publicado (visível aos jogadores)</span>
              </label>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
              >
                {loading ? 'Salvando...' : editing ? '💾 Atualizar' : '✨ Publicar'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {loading && notes.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-2xl">⏳ Carregando...</p>
        </div>
      ) : notes.length > 0 ? (
        <div className="space-y-4">
          {notes.map((note) => {
            const meta = categoryMeta(note.category);
            return (
              <motion.div
                key={note.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-gray-800 rounded-lg p-5 border ${
                  note.isActive ? 'border-gray-700' : 'border-red-900/50 opacity-75'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {note.isPinned && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-600/40 text-amber-200">
                          📌 Fixado
                        </span>
                      )}
                      {!note.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-700/40 text-red-200">
                          Rascunho
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded bg-indigo-700/40 text-indigo-100">
                        {meta.icon} {meta.label}
                      </span>
                      {note.version && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-200">
                          v{note.version}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold">{note.title}</h3>
                    <p className="text-sm text-gray-400">
                      {new Date(note.createdAt).toLocaleString('pt-BR')}
                      {note.author &&
                        ` · ${note.author.nickname || note.author.username}`}
                    </p>
                  </div>
                </div>

                <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm mb-4 max-h-40 overflow-y-auto">
                  {note.content}
                </pre>

                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-700">
                  <button
                    onClick={() => handleEdit(note)}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold text-sm"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => toggleField(note, 'isPinned')}
                    className="bg-amber-700/80 hover:bg-amber-600 px-4 py-2 rounded-lg font-bold text-sm"
                  >
                    {note.isPinned ? 'Desafixar' : 'Fixar'}
                  </button>
                  <button
                    onClick={() => toggleField(note, 'isActive')}
                    className="bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg font-bold text-sm"
                  >
                    {note.isActive ? 'Ocultar' : 'Publicar'}
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold text-sm"
                  >
                    🗑️ Deletar
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-6xl mb-4">📋</p>
          <p className="text-2xl text-gray-400 mb-2">Nenhum patch note ainda</p>
          <p className="text-gray-500">Clique em &quot;Novo Patch Note&quot; para publicar a primeira atualização</p>
        </div>
      )}
    </div>
  );
}
