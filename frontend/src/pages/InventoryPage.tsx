import GameIcon from '../components/GameIcon';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useCosmeticsStore } from '../stores/cosmeticsStore';
import api from '../api/axios';
import { useI18n } from '../i18n/I18nContext';
import { AVATAR_FRAMES, type AvatarFrameId } from '../constants/avatarFrames';
import FramedAvatar from '../components/FramedAvatar';

export default function InventoryPage() {
  const { t } = useI18n();
  const { user, setUser } = useAuthStore();
  const [equippedFrameId, setEquippedFrameId] = useState<string | null>(
    user?.equippedAvatarFrame ?? null,
  );
  const {
    ownedPlaymats,
    ownedSkins,
    equippedPlaymatId,
    equippedSkinId,
    equipPlaymat,
    unequipPlaymat,
    equipSkin,
    unequipSkin,
    setOwnedPlaymats,
    setOwnedSkins,
  } = useCosmeticsStore();
  const [loading, setLoading] = useState(true);
  const [maletaLimits, setMaletaLimits] = useState<{ maxDecks: number; maletaCapacity: number }>({
    maxDecks: 3,
    maletaCapacity: 500,
  });
  const [ownedMaletas, setOwnedMaletas] = useState<Array<{
    id: string;
    maletaTemplateId: string;
    name: string;
    description: string | null;
    image: string | null;
    bonusDecks: number;
    bonusMaletaCapacity: number;
    purchasedAt?: string;
  }>>([]);
  const [talismans, setTalismans] = useState<Array<{
    id: string;
    talismanTemplateId: string;
    equipped: boolean;
    charges?: number;
    initialCharges?: number;
    name?: string;
    description?: string | null;
    image?: string | null;
    bonusScorePct?: number;
    bonusCashPct?: number;
    bonusArenaPointsPct?: number;
  }>>([]);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  // Buscar playmats, skins e talismãs do backend
  useEffect(() => {
    const fetchInventory = async () => {
      try {
        setLoading(true);
        
        // Buscar inventário (playmats, skins e talismãs)
        const inventoryResponse = await api.get('/shop/inventory');
        const inventoryData = inventoryResponse.data;
        
        // Usar apenas o que a API retorna (evita mostrar playmats/skins de outro usuário ou estado antigo)
        const playmats = Array.isArray(inventoryData.playmats)
          ? inventoryData.playmats.map((p: any) => ({
              id: p.id,
              name: p.name || `Playmat ${p.id}`,
              image: p.image || '',
            }))
          : [];
        const skins = Array.isArray(inventoryData.skins)
          ? inventoryData.skins.map((s: any) => ({
              id: s.id,
              name: s.name || `Skin ${s.id}`,
              image: s.image || '',
            }))
          : [];
        const talismansList = Array.isArray(inventoryData.talismans)
          ? inventoryData.talismans
          : [];
        const maletasList = Array.isArray(inventoryData.maletas) ? inventoryData.maletas : [];
        const limits = inventoryData.maletaLimits;
        setOwnedPlaymats(playmats);
        setOwnedSkins(skins);
        setTalismans(talismansList);
        setOwnedMaletas(maletasList);
        if (limits && typeof limits.maxDecks === 'number' && typeof limits.maletaCapacity === 'number') {
          setMaletaLimits({
            maxDecks: limits.maxDecks,
            maletaCapacity: limits.maletaCapacity,
          });
        }
        
        // Buscar dados do usuário para sincronizar playmats e skins equipados
        try {
          const userResponse = await api.get('/users/me');
          const userData = userResponse.data;
          
          if (userData.equippedPlaymatId) {
            equipPlaymat(userData.equippedPlaymatId);
          }
          
          if (userData.equippedSkinId) {
            equipSkin(userData.equippedSkinId);
          }
          if (userData.equippedAvatarFrame) {
            setEquippedFrameId(userData.equippedAvatarFrame);
          } else {
            setEquippedFrameId(null);
          }
        } catch (userError) {
          console.error('Erro ao buscar dados do usuário:', userError);
        }
      } catch (error) {
        console.error('Erro ao buscar inventário:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, [setOwnedPlaymats, setOwnedSkins, equipPlaymat, equipSkin]);

  const handleTogglePlaymat = async (playmatId: string, imageSrc: string, isEquipped: boolean) => {
    if (isEquipped) {
      unequipPlaymat();
      try {
        await api.patch('/me/cosmetics', {
          equippedPlaymatId: null,
          equippedPlaymatImage: null,
        });
      } catch {
        // Ignorar erro por enquanto, estado local já foi atualizado
      }
    } else {
      equipPlaymat(playmatId);
      try {
        await api.patch('/me/cosmetics', {
          equippedPlaymatId: playmatId,
          equippedPlaymatImage: imageSrc,
        });
      } catch {
        // Ignorar erro por enquanto
      }
    }
  };

  const handleToggleSkin = async (skinId: string, imageSrc: string, isEquipped: boolean) => {
    if (isEquipped) {
      unequipSkin();
      try {
        await api.patch('/me/cosmetics', {
          equippedSkinId: null,
          equippedSkinImage: null,
        });
      } catch {
        // Ignorar erro
      }
    } else {
      equipSkin(skinId);
      try {
        await api.patch('/me/cosmetics', {
          equippedSkinId: skinId,
          equippedSkinImage: imageSrc,
        });
      } catch {
        // Ignorar erro
      }
    }
  };

  const handleEquipTalisman = async (userTalismanId: string) => {
    try {
      await api.post('/shop/talisman/equip', { userTalismanId });
      const inventoryResponse = await api.get('/shop/inventory');
      setTalismans(Array.isArray(inventoryResponse.data.talismans) ? inventoryResponse.data.talismans : []);
    } catch (err: any) {
      console.error('Erro ao equipar talismã:', err);
      alert(err.response?.data?.message || 'Erro ao equipar talismã');
    }
  };

  const handleToggleFrame = async (frameId: AvatarFrameId, isEquipped: boolean) => {
    try {
      const next = isEquipped ? null : frameId;
      await api.patch('/me/cosmetics', { equippedAvatarFrame: next });
      setEquippedFrameId(next);
      if (user) {
        setUser({ ...user, equippedAvatarFrame: next });
      }
    } catch (err: any) {
      console.error('Erro ao equipar moldura:', err);
      alert(err.response?.data?.message || 'Erro ao equipar moldura');
    }
  };

  const handleUnequipTalisman = async () => {
    try {
      await api.post('/shop/talisman/unequip');
      const inventoryResponse = await api.get('/shop/inventory');
      setTalismans(Array.isArray(inventoryResponse.data.talismans) ? inventoryResponse.data.talismans : []);
    } catch (err: any) {
      console.error('Erro ao desequipar talismã:', err);
      alert(err.response?.data?.message || 'Erro ao desequipar talismã');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <header className="game-screen-hero mb-7">
          <p className="game-screen-kicker">Equipamentos do duelista</p>
          <h1 className="game-screen-heading"><span className="game-screen-icon"><GameIcon route="/inventory" size={27} /></span>{t('inventory.title')}</h1>
          <p className="game-screen-subtitle">{t('inventory.subtitle')}</p>
        </header>

        {/* Maleta: limites atuais e níveis comprados */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl p-5 mb-6 border border-amber-500/40 bg-gradient-to-r from-amber-950/40 to-yellow-950/20"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-amber-200 flex items-center gap-2">🧳 {t('inventory.myBriefcase')}</h2>
              <p className="text-gray-400 text-sm mt-1">
                Limites que valem para criar decks e guardar cartas fora dos decks
              </p>
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-black/20 px-4 py-3 text-sm">
              <p className="text-amber-100 font-bold">
                {loading ? (user?.maxDecks ?? maletaLimits.maxDecks) : maletaLimits.maxDecks} decks
                <span className="text-gray-400 font-normal mx-2">•</span>
                {loading ? (user?.maletaCapacity ?? maletaLimits.maletaCapacity) : maletaLimits.maletaCapacity}{' '}
                {t('inventory.cardsInBriefcase')}
              </p>
            </div>
          </div>
          {loading ? (
            <p className="text-gray-400 text-sm">{t('inventory.loadingBriefcase')}</p>
          ) : ownedMaletas.length === 0 ? (
            <p className="text-gray-400 text-sm">
              {t('inventory.noBriefcase')}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('inventory.levelsOwned')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ownedMaletas.map((m) => {
                  const imageSrc = m.image
                    ? (m.image.startsWith('http') ? m.image : `${API_URL}${m.image}`)
                    : '';
                  return (
                    <div
                      key={m.id}
                      className="flex gap-3 items-center rounded-lg border border-amber-500/25 bg-white/5 p-3"
                    >
                      <div className="w-20 h-14 rounded-md overflow-hidden border border-amber-400/40 bg-amber-900/30 flex-shrink-0 flex items-center justify-center">
                        {imageSrc ? (
                          <img
                            src={imageSrc}
                            alt={m.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-2xl">🧳</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-white text-sm truncate">{m.name}</p>
                        <p className="text-[11px] text-amber-200/80">
                          +{m.bonusDecks} deck(s) • +{m.bonusMaletaCapacity} cartas (ao comprar)
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Playmats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-5 border border-blue-500/40"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-blue-300 flex items-center gap-2">
                  🎨 {t('inventory.playmats')}
                </h2>
                <p className="text-gray-400 text-sm">
                  {t('inventory.playmatsHint')}
                </p>
              </div>
              {equippedPlaymatId && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-600/30 border border-blue-400 text-blue-100">
                  {t('inventory.oneEquipped')}
                </span>
              )}
            </div>

            {ownedPlaymats.length === 0 ? (
              <div className="text-center py-10 text-gray-400 rounded-lg border border-dashed border-blue-500/40">
                <p className="text-3xl mb-2">🛒</p>
                <p className="font-semibold">{t('inventory.noPlaymats')}</p>
                <p className="text-xs mt-1">Compre playmats na loja para personalizar seu campo de duelo</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {ownedPlaymats.map((playmat) => {
                  const isEquipped = equippedPlaymatId === playmat.id;
                  const imageSrc = playmat.image
                    ? (playmat.image.startsWith('http')
                        ? playmat.image
                        : `${API_URL}${playmat.image}`)
                    : '';
                  return (
                    <div
                      key={playmat.id}
                      className={`flex gap-3 items-center rounded-lg border p-3 ${
                        isEquipped ? 'border-blue-400 shadow-lg shadow-blue-500/40' : 'border-white/20'
                      }`}
                    >
                      <div className="flex flex-col items-center flex-shrink-0 w-32">
                        <div className="w-full aspect-[21/9] rounded-lg overflow-hidden border border-blue-400/50 bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-purple-500/30">
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={playmat.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-blue-100/80 text-3xl">
                              🎨
                            </div>
                          )}
                        </div>
                        <p className="font-bold text-white text-center text-sm mt-1.5 w-full break-words">{playmat.name}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">
                          Usado como plano de fundo do campo de duelo
                        </p>
                      </div>
                      <button
                        onClick={() => handleTogglePlaymat(playmat.id, imageSrc, isEquipped)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          isEquipped
                            ? 'text-blue-200 border border-blue-400 hover:bg-white/10'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                        }`}
                      >
                        {isEquipped ? t('inventory.unequip') : t('inventory.equip')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Sleeves */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-5 border border-emerald-500/40"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-emerald-300 flex items-center gap-2">
                  🎭 Sleeves
                </h2>
                <p className="text-gray-400 text-sm">
                  Verso personalizado das cartas
                </p>
              </div>
              {equippedSkinId && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-600/30 border border-emerald-400 text-emerald-100">
                  {t('inventory.oneEquipped')}
                </span>
              )}
            </div>

            {ownedSkins.length === 0 ? (
              <div className="text-center py-10 text-gray-400 rounded-lg border border-dashed border-emerald-500/40">
                <p className="text-3xl mb-2">🛒</p>
                <p className="font-semibold">{t('inventory.noSleeves')}</p>
                <p className="text-xs mt-1">Compre skins na loja para personalizar o verso das cartas</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {ownedSkins.map((skin) => {
                  const isEquipped = equippedSkinId === skin.id;
                  const imageSrc = skin.image
                    ? (skin.image.startsWith('http')
                        ? skin.image
                        : `${API_URL}${skin.image}`)
                    : '';
                  return (
                    <div
                      key={skin.id}
                      className={`flex gap-3 items-center rounded-lg border p-3 ${
                        isEquipped ? 'border-emerald-400 shadow-lg shadow-emerald-500/40' : 'border-white/20'
                      }`}
                    >
                      <div className="flex flex-col items-center flex-shrink-0 w-16 sm:w-20">
                        <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden border border-emerald-400/60 bg-gradient-to-br from-green-500/30 via-emerald-500/20 to-cyan-500/30">
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={skin.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-emerald-100/80 text-3xl">
                              🎭
                            </div>
                          )}
                        </div>
                        <p className="font-bold text-white text-center text-xs mt-1.5 w-full break-words">{skin.name}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">
                          Usada como fundo das cartas viradas para baixo
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggleSkin(skin.id, imageSrc, isEquipped)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                          isEquipped
                            ? 'text-emerald-200 border border-emerald-400 hover:bg-white/10'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                        }`}
                      >
                        {isEquipped ? t('inventory.unequip') : t('inventory.equip')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Molduras de avatar (Deuses Egípcios) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-5 border border-violet-500/40 lg:col-span-2"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-violet-300 flex items-center gap-2">
                  🖼️ {t('inventory.frames')}
                </h2>
                <p className="text-gray-400 text-sm">{t('inventory.framesHint')}</p>
              </div>
              {equippedFrameId && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-violet-600/30 border border-violet-400 text-violet-100">
                  {t('inventory.oneEquipped')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {AVATAR_FRAMES.map((frame) => {
                const isEquipped = equippedFrameId === frame.id;
                return (
                  <div
                    key={frame.id}
                    className={`flex flex-col items-center gap-3 rounded-lg border p-4 overflow-visible ${
                      isEquipped
                        ? 'border-violet-400 shadow-lg shadow-violet-500/30'
                        : 'border-white/15'
                    }`}
                  >
                    <div className="overflow-visible p-8">
                      <FramedAvatar
                        src={user?.profileImage}
                        alt={frame.name}
                        frameId={frame.id}
                        className="w-28 h-28"
                        rounded="full"
                      />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-white">{frame.name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{frame.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFrame(frame.id, isEquipped)}
                      className={`w-full px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        isEquipped
                          ? 'text-violet-200 border border-violet-400 hover:bg-white/10'
                          : 'bg-violet-600 hover:bg-violet-500 text-white shadow-md'
                      }`}
                    >
                      {isEquipped ? t('inventory.unequip') : t('inventory.equip')}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Talismãs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-5 border border-amber-500/40 lg:col-span-2"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-amber-300 flex items-center gap-2">
                  ✨ Talismãs
                </h2>
                <p className="text-gray-400 text-sm">
                  Equipe um talismã para ganhar bônus de Score, Cash e Arena Points na Arena de Duelos
                </p>
              </div>
              {talismans.some((t) => t.equipped) && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-600/30 border border-amber-400 text-amber-100">
                  {t('inventory.oneEquipped')}
                </span>
              )}
            </div>

            {talismans.length === 0 ? (
              <div className="text-center py-10 text-gray-400 rounded-lg border border-dashed border-amber-500/40">
                <p className="text-3xl mb-2">✨</p>
                <p className="font-semibold">{t('inventory.noTalismans')}</p>
                <p className="text-xs mt-1">Compre talismãs na loja para ganhar bônus na Arena</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {talismans.map((talisman) => {
                  const isEquipped = talisman.equipped;
                  const imageSrc = talisman.image
                    ? (talisman.image.startsWith('http') ? talisman.image : `${API_URL}${talisman.image}`)
                    : '';
                  return (
                    <div
                      key={talisman.id}
                      className={`flex gap-4 items-center py-2 border-b border-white/10 last:border-0 ${
                        isEquipped ? 'ring-1 ring-amber-400/50 ring-inset rounded-lg px-2 -mx-2' : ''
                      }`}
                    >
                      <div
                        className="flex flex-col items-center flex-shrink-0 w-[5.5rem]"
                        title={`${talisman.charges ?? 0}/${talisman.initialCharges ?? 10} cargas (arena)`}
                      >
                        <div className="w-full aspect-square flex items-center justify-center">
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt=""
                              className="max-w-full max-h-full w-auto h-auto object-contain"
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : null}
                        </div>
                        <p className="text-[10px] text-white text-center font-semibold leading-tight mt-1 line-clamp-2 w-full">
                          {talisman.name || 'Talismã'}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          isEquipped ? handleUnequipTalisman() : handleEquipTalisman(talisman.id)
                        }
                        className={`ml-auto px-4 py-2 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${
                          isEquipped
                            ? 'text-amber-200 border border-amber-400 hover:bg-white/10'
                            : 'bg-amber-600 hover:bg-amber-700 text-white shadow-md'
                        }`}
                      >
                        {isEquipped ? t('inventory.unequip') : t('inventory.equip')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
