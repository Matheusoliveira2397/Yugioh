import { useState, useEffect } from 'react';
import api from '../../api/axios';
import { motion } from 'framer-motion';

interface News {
  id: string;
  title: string;
  content: string;
  author: { nickname: string; clanTag?: string };
  createdAt: string;
  image?: string;
  isPinned: boolean;
  isActive: boolean;
}

export default function NewsManagement() {
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingNews, setEditingNews] = useState<News | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    image: '',
    isPinned: false,
  });

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const response = await api.get('/news');
      setNews(response.data);
    } catch (error) {
      console.error('Erro ao buscar notícias:', error);
      alert('Erro ao carregar notícias');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingNews) {
        // Atualizar notícia existente
        await api.patch(`/news/${editingNews.id}`, formData);
        alert('Notícia atualizada com sucesso!');
      } else {
        // Criar nova notícia
        await api.post('/news', formData);
        alert('Notícia criada com sucesso!');
      }

      setShowForm(false);
      setEditingNews(null);
      setFormData({ title: '', content: '', image: '', isPinned: false });
      fetchNews();
    } catch (error: any) {
      console.error('Erro ao salvar notícia:', error);
      alert(error.response?.data?.message || 'Erro ao salvar notícia');
    }
  };

  const handleEdit = (newsItem: News) => {
    setEditingNews(newsItem);
    setFormData({
      title: newsItem.title,
      content: newsItem.content,
      image: newsItem.image || '',
      isPinned: newsItem.isPinned,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar esta notícia?')) return;

    try {
      await api.delete(`/news/${id}`);
      alert('Notícia deletada com sucesso!');
      fetchNews();
    } catch (error) {
      console.error('Erro ao deletar notícia:', error);
      alert('Erro ao deletar notícia');
    }
  };

  const handleTogglePin = async (newsItem: News) => {
    try {
      await api.patch(`/news/${newsItem.id}`, { isPinned: !newsItem.isPinned });
      fetchNews();
    } catch (error) {
      console.error('Erro ao fixar/desafixar notícia:', error);
      alert('Erro ao atualizar notícia');
    }
  };

  const handleToggleActive = async (newsItem: News) => {
    try {
      await api.patch(`/news/${newsItem.id}`, { isActive: !newsItem.isActive });
      fetchNews();
    } catch (error) {
      console.error('Erro ao ativar/desativar notícia:', error);
      alert('Erro ao atualizar notícia');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">📰 Gerenciar Notícias</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingNews(null);
            setFormData({ title: '', content: '', image: '', isPinned: false });
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-lg transition"
        >
          {showForm ? '❌ Cancelar' : '➕ Nova Notícia'}
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <motion.form
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="bg-gray-800 rounded-lg p-6 mb-6"
        >
          <h3 className="text-2xl font-bold mb-4">
            {editingNews ? '✏️ Editar Notícia' : '➕ Nova Notícia'}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2">Título *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Digite o título da notícia..."
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">Conteúdo *</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                required
                rows={6}
                className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Digite o conteúdo da notícia..."
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-2">URL da Imagem (opcional)</label>
              <input
                type="text"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                className="w-full bg-gray-900 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://exemplo.com/imagem.jpg"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.isPinned}
                onChange={(e) => setFormData({ ...formData, isPinned: e.target.checked })}
                className="w-5 h-5"
              />
              <label className="font-bold">📌 Fixar no topo</label>
            </div>

            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition"
            >
              {editingNews ? '💾 Salvar Alterações' : '✅ Criar Notícia'}
            </button>
          </div>
        </motion.form>
      )}

      {/* Lista de Notícias */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-2xl">Carregando...</div>
        </div>
      ) : (
        <div className="space-y-4">
          {news.length > 0 ? (
            news.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-gray-800 rounded-lg p-6 border-l-4 ${
                  item.isPinned ? 'border-yellow-500' : 'border-blue-500'
                } ${!item.isActive ? 'opacity-50' : ''}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {item.isPinned && (
                        <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded">
                          FIXADO
                        </span>
                      )}
                      {!item.isActive && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                          INATIVO
                        </span>
                      )}
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{item.title}</h3>
                    <p className="text-gray-300 mb-2">{item.content}</p>
                    <div className="text-sm text-gray-500">
                      Por: {item.author?.clanTag ? `|${item.author.clanTag}| ${item.author?.nickname || 'Admin'}` : (item.author?.nickname || 'Admin')} •{' '}
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleEdit(item)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => handleTogglePin(item)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg transition"
                  >
                    {item.isPinned ? '📌 Desafixar' : '📌 Fixar'}
                  </button>
                  <button
                    onClick={() => handleToggleActive(item)}
                    className={`${
                      item.isActive
                        ? 'bg-orange-600 hover:bg-orange-700'
                        : 'bg-green-600 hover:bg-green-700'
                    } text-white px-4 py-2 rounded-lg transition`}
                  >
                    {item.isActive ? '🔒 Desativar' : '✅ Ativar'}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition"
                  >
                    🗑️ Deletar
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-12">
              <div className="text-6xl mb-4">📰</div>
              <div className="text-xl">Nenhuma notícia cadastrada</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
