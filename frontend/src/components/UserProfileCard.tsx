import React, { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import MessageIcon from './MessageIcon';
import { getProfileImageUrl, DEFAULT_PROFILE_IMAGE_PATH } from '../utils/imageUrl';
import { getDivisionDisplayName, getDivisionImagePath } from '../utils/divisionDisplay';
import { formatScore } from '../utils/formatScore';

interface UserProfileCardProps {
  onLinkClick?: () => void; // Para fechar o menu mobile quando um link é clicado
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ onLinkClick }) => {
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Atualizar dados do usuário quando o componente montar
  useEffect(() => {
    if (isAuthenticated) {
      refreshUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!user) return null;

  const handleLinkClick = () => {
    if (onLinkClick) {
      onLinkClick();
    }
  };

  const handleLogout = () => {
    if (onLinkClick) {
      onLinkClick();
    }
    logout();
  };

  return (
    <div className="flex flex-col custom-scrollbar">
      {/* Header com Avatar */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex flex-col items-center gap-3 mb-4 relative">
          <div className="flex flex-col items-center gap-2">
            <Link to={`/profile/${user?.id || ''}`} className="group relative" onClick={handleLinkClick}>
              <div className="w-24 h-24 rounded-2xl overflow-hidden border-3 border-purple-500 shadow-xl shadow-purple-500/50 group-hover:scale-110 group-hover:shadow-purple-500/70 transition-all duration-300 relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <img
                  src={getProfileImageUrl(user?.profileImage)}
                  alt={user?.nickname}
                  className="w-full h-full object-cover relative z-10"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = DEFAULT_PROFILE_IMAGE_PATH;
                  }}
                />
              </div>
            </Link>

            <h3 className="text-lg font-bold text-white text-center leading-tight px-3 flex items-center justify-center gap-1.5">
              {user?.clanTag ? `|${user.clanTag}| ${user.nickname}` : user?.nickname}
            </h3>
          </div>

          {/* Ícones de notificação */}
          <div className="absolute top-0 right-0 flex flex-col gap-2">
            <NotificationBell />
            <MessageIcon />
          </div>
        </div>
      </div>

      {/* Recursos */}
      <div className="grid grid-cols-2 gap-2 mb-4 flex-shrink-0">
        <div className="flex flex-col items-center bg-transparent backdrop-blur-sm rounded-lg p-2.5 border border-purple-500/30 shadow-md transition-all duration-300 hover:scale-105">
          <span className="text-xl mb-1">💵</span>
          <p className="text-purple-300 font-bold text-base drop-shadow-lg">{(user?.cash || 0).toLocaleString()}</p>
          <p className="text-[10px] text-purple-300/80 font-semibold">Cash</p>
        </div>
        <div className="flex flex-col items-center bg-transparent backdrop-blur-sm rounded-lg p-2.5 border border-purple-500/30 shadow-md transition-all duration-300 hover:scale-105">
          <span className="text-xl mb-1">💰</span>
          <p className="text-blue-300 font-bold text-base drop-shadow-lg">{(user?.credits || 0).toLocaleString()}</p>
          <p className="text-[10px] text-purple-300/80 font-semibold">Crédito</p>
        </div>
      </div>

      {/* Estatísticas Detalhadas */}
      <div className="space-y-2 mb-4 bg-transparent backdrop-blur-md rounded-xl p-4 border border-purple-500/30 shadow-xl flex-shrink-0">
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">⭐</span> <span className="font-medium">Nível</span>
          </span>
          <span className="text-base font-bold text-white">{user?.level || 1}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">🌟</span> <span className="font-medium">Estrelas</span>
          </span>
          <span className="text-base font-bold text-amber-300/90">{(user as any)?.stars ?? 0}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">🏅</span> <span className="font-medium">Divisão</span>
          </span>
          <div className="flex items-center gap-2">
            {(() => {
              const division = user?.division || 'Bronze';
              const imagePath = getDivisionImagePath(division);
              const divisionLabel = getDivisionDisplayName(division);
              return (
                <>
                  {imagePath && (
                    <img
                      src={imagePath}
                      alt={divisionLabel}
                      className="w-5 h-5 object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  <span className="text-base font-bold text-cyan-400">{divisionLabel}</span>
                </>
              );
            })()}
          </div>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">📊</span> <span className="font-medium">Score Season</span>
          </span>
          <span className="text-base font-bold text-purple-400">{formatScore(user?.seasonScore)}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">🏆</span> <span className="font-medium">Score Geral</span>
          </span>
          <span className="text-base font-bold text-blue-400">
            {formatScore(user?.totalScore)}
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">📈</span> <span className="font-medium">Rank Season</span>
          </span>
          <span className="text-base font-bold text-purple-400">
            {user?.seasonRank !== null && user?.seasonRank !== undefined ? `${user.seasonRank}°` : '-'}
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">🎖️</span> <span className="font-medium">Rank Geral</span>
          </span>
          <span className="text-base font-bold text-pink-400">
            {(user?.generalRank !== null && user?.generalRank !== undefined) || (user?.globalRank !== null && user?.globalRank !== undefined)
              ? `${user.generalRank || user.globalRank}°` 
              : '-'}
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 border-b border-purple-500/20">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">📈</span> <span className="font-medium">V/D Geral</span>
          </span>
          <span className="text-base font-bold text-white">
            <span className="text-green-400">{user?.winsGeral || 0}</span> / <span className="text-red-400">{user?.lossesGeral || 0}</span>
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5">
          <span className="text-sm text-purple-200 flex items-center gap-2">
            <span className="text-base">⚡</span> <span className="font-medium">V/D Season</span>
          </span>
          <span className="text-base font-bold text-white">
            <span className="text-green-400">{user?.winsSeason || 0}</span> / <span className="text-red-400">{user?.lossesSeason || 0}</span>
          </span>
        </div>
        {user?.group && (
          <Link to={`/groups/${user.group.id}`} className="flex justify-between items-center hover:bg-purple-500/20 -mx-2 px-3 py-2 rounded-lg transition-colors mt-2 border-t border-purple-500/30 pt-2" onClick={handleLinkClick}>
            <span className="text-sm text-purple-200 flex items-center gap-2">
              <span className="text-base">👥</span> <span className="font-medium">Clã</span>
            </span>
            <span className="text-sm font-bold text-purple-400 truncate ml-2">[{user.group.tag}]</span>
          </Link>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex gap-3 mb-3 flex-shrink-0">
        <Link to={`/profile/${user?.id || ''}`} className="flex-1" onClick={handleLinkClick}>
          <button className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-2.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm shadow-lg hover:shadow-xl hover:scale-105">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Perfil
          </button>
        </Link>
        <button 
          onClick={handleLogout}
          className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold py-2.5 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-sm shadow-lg hover:shadow-xl hover:scale-105"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </button>
      </div>

      {/* Botão Admin (apenas para ADMIN/MASTER) */}
      {(user?.role === 'ADMIN' || user?.role === 'MASTER') && (
        <Link to="/admin" className="block mb-3 flex-shrink-0" onClick={handleLinkClick}>
          <button className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-bold py-3 rounded-xl transition-all duration-300 shadow-lg hover:shadow-yellow-500/50 hover:scale-105 flex items-center justify-center gap-2 text-sm">
            <span className="text-xl">👑</span>
            <span>Painel Admin</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </Link>
      )}

      {/* Card Organize seu Deck */}
      <Link 
        to="/deck-builder"
        className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-[1.03] mb-3 flex-shrink-0 border border-purple-500/30"
        onClick={handleLinkClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-indigo-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <img
          src="/images/decks/deck.png"
          alt="Organize seu deck"
          className="w-full h-20 object-contain relative z-10"
        />
        {/* Overlay com texto */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end p-3 z-20">
          <h3 className="text-white font-bold text-sm drop-shadow-lg">Organize seu deck</h3>
          <p className="text-slate-300 text-xs">Crie e edite seus baralhos</p>
        </div>
        {/* Efeito hover */}
        <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/30 transition-all duration-300 z-10"></div>
      </Link>

      {/* Card Inventário */}
      <Link 
        to="/inventory"
        className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-xl hover:shadow-teal-500/50 transition-all duration-300 hover:scale-[1.03] mb-3 flex-shrink-0 border border-teal-500/30"
        onClick={handleLinkClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-teal-600/20 to-cyan-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <img
          src="/images/inventario.png"
          alt="Inventário"
          className="w-full h-20 object-contain relative z-10"
        />
        {/* Overlay com texto */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end p-3 z-20">
          <h3 className="text-white font-bold text-sm drop-shadow-lg">Inventário</h3>
          <p className="text-slate-300 text-xs">Gerencie suas cartas</p>
        </div>
        {/* Efeito hover */}
        <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/30 transition-all duration-300 z-10"></div>
      </Link>

      {/* Card Amigos */}
      <Link 
        to="/friends"
        className="block relative rounded-xl overflow-hidden group cursor-pointer shadow-xl hover:shadow-pink-500/50 transition-all duration-300 hover:scale-[1.03] flex-shrink-0 border border-pink-500/30"
        onClick={handleLinkClick}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-pink-600/20 to-rose-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="w-full h-20 flex items-center justify-center relative z-10">
          <span className="text-5xl">👥</span>
        </div>
        {/* Overlay com texto */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col justify-end p-3 z-20">
          <h3 className="text-white font-bold text-sm drop-shadow-lg">Amigos</h3>
          <p className="text-slate-300 text-xs">Chat e convites</p>
        </div>
        {/* Efeito hover */}
        <div className="absolute inset-0 bg-pink-600/0 group-hover:bg-pink-600/30 transition-all duration-300 z-10"></div>
      </Link>
    </div>
  );
};
