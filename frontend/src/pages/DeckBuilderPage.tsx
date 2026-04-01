
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/axios';
import CardImage from '../components/CardImage';
import { CARD_IMAGE_GRID_PROPS } from '../utils/cardImage';
import { useAuthStore } from '../stores/authStore';

interface DeckCardSummary {
  id: string;
  isExtraDeck?: boolean;
  card?: {
    id: string;
    idCarta?: string;
    name: string;
    cardImage?: string;
  };
}

interface DeckSummary {
  id: string;
  name: string;
  cards?: DeckCardSummary[];
  coverCardId?: string | null;
  coverCard?: { id: string; name: string; cardImage?: string; idCarta?: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export default function DeckBuilderPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);

  useEffect(() => {
    const fetchDecks = async () => {
      setLoadingDecks(true);
      try {
        const res = await api.get<DeckSummary[]>('/decks');
        setDecks(res.data || []);
      } catch (error) {
        console.error('❌ Erro ao carregar decks:', error);
        setDecks([]);
      } finally {
        setLoadingDecks(false);
      }
    };

    fetchDecks();
  }, []);

  return (
    <div className="min-h-screen py-4 sm:py-8 md:py-12 px-2 sm:px-4 relative z-10">
      <div className="max-w-6xl mx-auto">
        {/* Card Principal com Imagem */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl sm:rounded-2xl overflow-hidden mb-4 sm:mb-8"
        >
          {/* Imagem de Fundo com Overlay */}
          <div className="relative h-32 sm:h-48 md:h-64 overflow-hidden">
            <img
              src="/images/decks/deck.png"
              alt="Yu-Gi-Oh Deck"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><rect fill="%23374151" width="1200" height="400"/><text x="50%" y="50%" font-size="64" fill="%239CA3AF" text-anchor="middle" dominant-baseline="middle">🎴 Deck</text></svg>';
              }}
            />
            
            {/* Texto sobre a imagem */}
            <div className="absolute bottom-3 sm:bottom-6 left-4 sm:left-8">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-1 sm:mb-2 drop-shadow-2xl">Organize seu deck</h1>
              <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-200 drop-shadow-lg">Crie e edite seus baralhos</p>
            </div>
          </div>

          {/* Conteúdo do Card */}
          <div className="p-4 sm:p-6 md:p-8">

            {/* Grid com Meus Decks e Criar Novo Deck */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-8">
              {/* Lista de decks do usuário */}
              <div className="md:col-span-2">
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3 flex items-center gap-2">
                  <span>📚</span> Meus Decks
                </h2>
                <p className="text-sm text-gray-400 mb-3">
                  Só pode haver <strong className="text-white">1 deck equipado</strong> por vez. Equipar outro desequipa o atual.
                </p>
                {user?.equippedDeckName && (
                  <p className="text-sm text-purple-300 mb-3 flex items-center gap-2">
                    <span className="font-semibold text-purple-200">Deck equipado:</span>
                    <span className="font-medium text-white">{user.equippedDeckName}</span>
                  </p>
                )}
              {loadingDecks ? (
                <div className="text-gray-300 text-sm py-4">Carregando decks...</div>
              ) : decks.length === 0 ? (
                <div className="text-gray-400 text-xs sm:text-sm py-4">
                  Você ainda não tem nenhum deck salvo. Crie um novo para aparecer aqui.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {decks.map((deck, deckIndex) => {
                    const cardsCount = deck.cards?.length ?? 0;
                    const mainDeckCount = deck.cards?.filter((c) => !(c as DeckCardSummary).isExtraDeck).length ?? 0;
                    const lastDeckCard =
                      deck.cards && deck.cards.length > 0
                        ? deck.cards[deck.cards.length - 1]
                        : undefined;
                    const lastCard = lastDeckCard?.card;
                    const coverCard = deck.coverCard ?? null;
                    const displayCard = coverCard || lastCard;
                    const isEquipped = user?.equippedDeckId === deck.id;
                    return (
                      <motion.div
                        key={deck.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ scale: 1.02 }}
                        className={`rounded-xl p-4 border ${
                          isEquipped
                            ? 'border-purple-400 shadow-[0_0_18px_rgba(168,85,247,0.6)]'
                            : 'border-white/20'
                        } hover:border-purple-500/60 transition-all`}
                      >
                        {/* Nome + info */}
                        <div className="flex items-center justify-between mb-2">
                          <h3
                            className="text-lg font-semibold text-white truncate"
                            title={deck.name}
                          >
                            {deck.name}
                          </h3>
                          <span className="text-xs text-gray-300 bg-black/30 px-2 py-0.5 rounded-full" title={mainDeckCount > 0 ? `Principal: ${mainDeckCount} | Total: ${cardsCount}` : undefined}>
                            {cardsCount} cartas
                          </span>
                        </div>

                        {/* Imagem do deck (carta de capa ou última carta) */}
                        <div className="w-full max-w-[96px] mx-auto aspect-[2/3] rounded-lg overflow-hidden border border-white/20 mb-3">
                          {displayCard ? (
                            <CardImage
                              {...CARD_IMAGE_GRID_PROPS}
                              card={displayCard}
                              className="w-full h-full object-cover"
                              fallback="/images/fundoCarta.webp"
                              loading={deckIndex < 9 ? 'eager' : 'lazy'}
                              fetchPriority={deckIndex < 3 ? 'high' : 'auto'}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                              Sem carta
                            </div>
                          )}
                        </div>

                        {/* Detalhes + botões */}
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                          <span>
                            Criado:{' '}
                            {deck.createdAt
                              ? new Date(deck.createdAt).toLocaleDateString()
                              : '-'}
                          </span>
                          {isEquipped && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-600/80 text-[10px] font-bold text-white">
                              Equipado
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {/* Abrir/Editar: clique no card ou botão principal */}
                          <button
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
                            onClick={() =>
                              navigate('/deck-edit', {
                                state: { deckName: deck.name },
                              })
                            }
                            title="Abrir e editar deck"
                          >
                            ✏️ Abrir deck
                          </button>
                          {/* Equipar e excluir só aparecem quando o deck NÃO está equipado */}
                          {!isEquipped && (
                            <div className="flex gap-2 items-center">
                              <button
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={mainDeckCount < 40}
                                title={mainDeckCount < 40 ? 'O deck principal precisa ter pelo menos 40 cartas para equipar' : undefined}
                                onClick={async () => {
                                  try {
                                await api.patch('/me/cosmetics', {
                                  equippedDeckId: deck.id,
                                });
                                if (user) {
                                  useAuthStore.getState().setUser({
                                    ...user,
                                    equippedDeckId: deck.id,
                                    equippedDeckName: deck.name,
                                  } as any);
                                }
                                    alert(`✅ Deck "${deck.name}" equipado!`);
                                  } catch (error: any) {
                                    console.error('❌ Erro ao equipar deck:', error);
                                    alert(
                                      `❌ Erro ao equipar deck: ${
                                        error.response?.data?.message ||
                                        error.message ||
                                        'Erro desconhecido'
                                      }`,
                                    );
                                  }
                                }}
                              >
                                Equipar
                              </button>
                              <button
                                className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors text-sm"
                                onClick={async () => {
                                  if (!confirm(`Tem certeza que deseja deletar o deck "${deck.name}"?`)) {
                                    return;
                                  }
                                  try {
                                    await api.delete(`/decks/${deck.id}`);
                                    setDecks((prev) => prev.filter((d) => d.id !== deck.id));
                                    alert('✅ Deck deletado com sucesso.');
                                  } catch (error: any) {
                                    console.error('❌ Erro ao deletar deck:', error);
                                    alert(
                                      `❌ Erro ao deletar deck: ${
                                        error.response?.data?.message || error.message || 'Erro desconhecido'
                                      }`,
                                    );
                                  }
                                }}
                                title="Deletar deck"
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              </div>

              {/* Card - Criar Novo Deck (começar do zero) */}
              <div className="md:col-span-1">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  whileHover={{ scale: 1.03 }}
                  className="rounded-xl p-6 border border-dashed border-white/20 cursor-pointer hover:border-green-500/50 transition-all h-full"
                >
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-green-600 to-green-800 rounded-full flex items-center justify-center text-4xl mb-4">
                      ➕
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Criar Novo Deck</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Monte um deck do zero (entre 40 e 60 cartas)
                    </p>
                    <button
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                      onClick={() => navigate('/deck-edit', { state: { newDeck: true } })}
                    >
                      Começar
                    </button>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
