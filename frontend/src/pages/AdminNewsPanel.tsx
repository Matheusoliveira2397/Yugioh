import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '../api/axios';

interface News {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    nickname: string;
    username: string;
    clanTag?: string;
  };
}

export default function AdminNewsPanel() {
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    imageUrl: '',
  });

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async () => {
    try {
      const response = await api.get('/news');
      setNews(response.data);
    } catch (error) {
      console.error('Erro ao carregar notícias:', error);
      setMessage({ type: 'error', text: 'Erro ao carregar notícias' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (editingNews) {
        await api.patch(`/news/${editingNews.id}`, formData);
        setMessage({ type: 'success', text: '✅ Notícia atualizada com sucesso!' });
      } else {
        await api.post('/news', formData);
        setMessage({ type: 'success', text: '✅ Notícia criada com sucesso!' });
      }

      resetForm();
      loadNews();
      setShowForm(false);
    } catch (error: any) {
      setMessage({ 
        type: 'error', 
        text: `❌ Erro: ${error.response?.data?.message || error.message || 'Erro desconhecido'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (newsItem: News) => {
    setEditingNews(newsItem);
    setFormData({
      title: newsItem.title,
      content: newsItem.content,
      imageUrl: newsItem.imageUrl || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente deletar esta notícia?')) return;

    try {
      await api.delete(`/news/${id}`);
      setMessage({ type: 'success', text: '✅ Notícia deletada com sucesso!' });
      loadNews();
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Erro ao deletar notícia' });
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      imageUrl: '',
    });
    setEditingNews(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-lg p-6 mb-8 shadow-2xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">📰 Gerenciamento de Notícias</h1>
            <p className="text-gray-300">Crie e gerencie notícias do jogo</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-bold transition-all"
          >
            {showForm ? '❌ Cancelar' : '➕ Nova Notícia'}
          </button>
        </div>
      </div>

      {/* Message */}
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

      {/* Form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700"
        >
          <h2 className="text-2xl font-bold mb-6">
            {editingNews ? '✏️ Editar Notícia' : '➕ Nova Notícia'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold mb-2">Título *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                placeholder="Ex: Novo evento disponível!"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Conteúdo *</label>
              <textarea
                required
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 h-48"
                placeholder="Escreva o conteúdo da notícia aqui..."
              />
              <p className="text-sm text-gray-500 mt-2">
                {formData.content.length} caracteres
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">URL da Imagem (opcional)</label>
              <input
                type="text"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                placeholder="https://exemplo.com/imagem.jpg"
              />
              {formData.imageUrl && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-2">Preview:</p>
                  <img 
                    src={formData.imageUrl} 
                    alt="Preview" 
                    className="w-full max-h-64 object-cover rounded-lg border-2 border-blue-500"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
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
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg disabled:opacity-50"
              >
                {loading ? 'Salvando...' : editingNews ? '💾 Atualizar' : '✨ Criar'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* News List */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-2xl">⏳ Carregando...</p>
        </div>
      ) : news.length > 0 ? (
        <div className="space-y-6">
          {news.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gray-800 rounded-lg overflow-hidden shadow-xl border border-gray-700"
            >
              {item.imageUrl && (
                <img 
                  src={item.imageUrl} 
                  alt={item.title}
                  className="w-full h-48 object-cover"
                />
              )}

              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold mb-2">{item.title}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span>
                        📅 {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                      {item.author && (
                        <span>
                          ✍️ {item.author.clanTag ? `|${item.author.clanTag}| ${item.author.nickname || item.author.username}` : (item.author.nickname || item.author.username)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-gray-300 whitespace-pre-wrap mb-6">
                  {item.content}
                </p>

                <div className="flex gap-2 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => handleEdit(item)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold transition-colors"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-bold transition-colors"
                  >
                    🗑️ Deletar
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-6xl mb-4">📰</p>
          <p className="text-2xl text-gray-400 mb-2">Nenhuma notícia criada</p>
          <p className="text-gray-500">Clique em "Nova Notícia" para começar</p>
        </div>
      )}
    </div>
  );
}
