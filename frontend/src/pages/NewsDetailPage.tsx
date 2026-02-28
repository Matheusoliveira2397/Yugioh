import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface News {
  id: string;
  title: string;
  content: string;
  author: { nickname: string; clanTag?: string };
  createdAt: string;
  image?: string;
  isPinned: boolean;
}

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    const fetchNews = async () => {
      try {
        const response = await axios.get(`${API_URL}/news/${id}`);
        setNews(response.data);
        
        // Marcar como vista se o usuário estiver logado
        if (token && user) {
          try {
            await axios.post(
              `${API_URL}/news/${id}/view`,
              {},
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
          } catch (error) {
            console.error('Erro ao marcar notícia como vista:', error);
          }
        }
      } catch (error) {
        console.error('Erro ao buscar notícia:', error);
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, [id, navigate, token, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl text-white">Carregando...</div>
      </div>
    );
  }

  if (!news) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-2xl text-white">Notícia não encontrada</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-transparent backdrop-blur-sm rounded-xl p-6 md:p-8 border border-blue-700/30"
      >
        {/* Botão Voltar */}
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-700/80 to-gray-800/80 hover:from-gray-600/90 hover:to-gray-700/90 text-white font-bold rounded-lg transition-all duration-200 border border-gray-600/50 hover:border-gray-500/70 shadow-md hover:shadow-lg"
        >
          <span className="text-lg">←</span>
          <span>Voltar</span>
        </button>

        {/* Badge Fixado */}
        {news.isPinned && (
          <div className="mb-4 inline-block px-3 py-1 bg-blue-500/30 text-white text-sm font-bold rounded-lg">
            📌 FIXADO
          </div>
        )}

        {/* Título */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 drop-shadow-lg">
          {news.title}
        </h1>

        {/* Data e Autor */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6 text-white/70 text-sm">
          <span>
            {new Date(news.createdAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span>
            Por: {news.author?.clanTag ? `|${news.author.clanTag}| ${news.author?.nickname || 'Admin'}` : (news.author?.nickname || 'Admin')}
          </span>
        </div>

        {/* Imagem */}
        {news.image && (
          <div className="mb-6 rounded-lg overflow-hidden">
            <img
              src={news.image.startsWith('http') ? news.image : `${API_URL}${news.image}`}
              alt={news.title}
              className="w-full h-auto object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Conteúdo */}
        <div className="prose prose-invert max-w-none">
          <div className="text-white/90 text-base md:text-lg leading-relaxed whitespace-pre-wrap">
            {news.content}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

