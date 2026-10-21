import React, { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Link } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import MessageIcon from './MessageIcon';
import { getDivisionDisplayName, getDivisionImagePath } from '../utils/divisionDisplay';
import { formatScore } from '../utils/formatScore';
import { useI18n } from '../i18n/I18nContext';
import FramedAvatar from './FramedAvatar';

interface UserProfileCardProps {
  onLinkClick?: () => void;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ onLinkClick }) => {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      refreshUser();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!user) return null;

  const handleLinkClick = () => {
    onLinkClick?.();
  };

  const handleLogout = () => {
    onLinkClick?.();
    logout();
  };

  const division = user?.division || 'Bronze';
  const divisionImage = getDivisionImagePath(division);
  const divisionLabel = getDivisionDisplayName(division);

  return (
    <div className="flex flex-col">
      {/* Banner com nick */}
      <div className="ygo-duelist-banner">
        <h3 className="font-display text-sm xl:text-[0.95rem] font-bold text-white leading-tight truncate px-3">
          {user?.clanTag ? `|${user.clanTag}| ${user.nickname}` : user?.nickname}
        </h3>
      </div>

      {/* Avatar + notificações */}
      <div className="relative mb-2.5 flex-shrink-0">
        <div className="flex flex-col items-center">
          <Link
            to={`/profile/${user?.id || ''}`}
            className="group relative overflow-visible pt-1 px-3 pb-2"
            onClick={handleLinkClick}
          >
            <div className="absolute -inset-1 rounded-2xl border border-champion-gold/40 opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <FramedAvatar
              src={user?.profileImage}
              alt={user?.nickname}
              frameId={user?.equippedAvatarFrame}
              className="w-16 h-16 xl:w-[4.75rem] xl:h-[4.75rem] shadow-gold-md group-hover:scale-105 transition-transform duration-300"
              rounded="2xl"
            />
            <span className="ygo-level-badge" title={t('profileCard.level')}>
              ★ Lv {user?.level || 1}
            </span>
          </Link>
        </div>

        <div className="absolute top-0 right-0 flex flex-col gap-1.5">
          <NotificationBell />
          <MessageIcon />
        </div>
      </div>

      {/* Recursos — gemas / orbes */}
      <div className="grid grid-cols-2 gap-1.5 mb-2.5 flex-shrink-0">
        <div className="ygo-resource-chip">
          <span className="text-sm leading-none mb-0.5" aria-hidden>💵</span>
          <p className="text-champion-gold font-bold text-sm tabular-nums leading-tight">
            {(user?.cash || 0).toLocaleString()}
          </p>
          <p className="text-[8px] uppercase tracking-wide text-arena-mist font-semibold">
            {t('profileCard.cash')}
          </p>
        </div>
        <div className="ygo-resource-chip ygo-resource-chip--cyan">
          <span className="text-sm leading-none mb-0.5" aria-hidden>💎</span>
          <p className="text-champion-cyan font-bold text-sm tabular-nums leading-tight">
            {(user?.credits || 0).toLocaleString()}
          </p>
          <p className="text-[8px] uppercase tracking-wide text-arena-mist font-semibold">
            {t('profileCard.credits')}
          </p>
        </div>
      </div>

      {/* Placa de status — ATK/DEF vibe */}
      <div className="ygo-stat-board flex-shrink-0">
        <div className="px-2 py-1 border-b border-champion-gold/20 bg-champion-gold/10">
          <p className="text-[9px] font-display font-bold uppercase tracking-[0.16em] text-champion-gold text-center">
            Status
          </p>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>🌟</span> {t('profileCard.stars')}
          </span>
          <span className="font-bold text-champion-gold tabular-nums">{(user as any)?.stars ?? 0}</span>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>🏅</span> {t('profileCard.division')}
          </span>
          <span className="flex items-center gap-1.5 font-bold text-champion-cyan">
            {divisionImage && (
              <img
                src={divisionImage}
                alt={divisionLabel}
                className="w-4 h-4 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            {divisionLabel}
          </span>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>📊</span> {t('profileCard.seasonScore')}
          </span>
          <span className="font-bold text-champion-gold tabular-nums">{formatScore(user?.seasonScore)}</span>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>🏆</span> {t('profileCard.generalScore')}
          </span>
          <span className="font-bold text-champion-cyan tabular-nums">{formatScore(user?.totalScore)}</span>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>📈</span> {t('profileCard.seasonRank')}
          </span>
          <span className="font-bold text-champion-gold tabular-nums">
            {user?.seasonRank != null ? `${user.seasonRank}°` : '-'}
          </span>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>🎖️</span> {t('profileCard.generalRank')}
          </span>
          <span className="font-bold text-champion-amber tabular-nums">
            {user?.generalRank != null || user?.globalRank != null
              ? `${user.generalRank || user.globalRank}°`
              : '-'}
          </span>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>⚔</span> {t('profileCard.wdGeneral')}
          </span>
          <span className="font-bold tabular-nums">
            <span className="text-emerald-400">{user?.winsGeral || 0}</span>
            <span className="text-white/40 mx-0.5">/</span>
            <span className="text-champion-crimson">{user?.lossesGeral || 0}</span>
          </span>
        </div>

        <div className="ygo-stat-row">
          <span className="text-arena-mist flex items-center gap-1.5">
            <span aria-hidden>⚡</span> {t('profileCard.wdSeason')}
          </span>
          <span className="font-bold tabular-nums">
            <span className="text-emerald-400">{user?.winsSeason || 0}</span>
            <span className="text-white/40 mx-0.5">/</span>
            <span className="text-champion-crimson">{user?.lossesSeason || 0}</span>
          </span>
        </div>

        {user?.group && (
          <Link
            to={`/groups/${user.group.id}`}
            className="ygo-stat-row border-t border-champion-gold/25"
            onClick={handleLinkClick}
          >
            <span className="text-arena-mist flex items-center gap-1.5">
              <span aria-hidden>👥</span> {t('profileCard.clan')}
            </span>
            <span className="font-bold text-champion-gold truncate ml-2">[{user.group.tag}]</span>
          </Link>
        )}
      </div>

      {/* Ações */}
      <div className="flex gap-1.5 mb-2.5 flex-shrink-0">
        <Link to={`/profile/${user?.id || ''}`} className="flex-1" onClick={handleLinkClick}>
          <button
            type="button"
            className="w-full btn-champion flex items-center justify-center gap-1 rounded-md text-[11px] py-1.5 hover:scale-[1.02]"
          >
            {t('profileCard.profile')}
          </button>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="flex-1 btn-danger py-1.5 rounded-md flex items-center justify-center gap-1 text-[11px] shadow-lg hover:scale-[1.02] transition-transform"
        >
          {t('profileCard.logout')}
        </button>
      </div>

      {(user?.role === 'ADMIN' || user?.role === 'MASTER') && (
        <Link to="/admin" className="block mb-2.5 flex-shrink-0" onClick={handleLinkClick}>
          <button
            type="button"
            className="w-full btn-champion py-2 rounded-md flex items-center justify-center gap-2 text-xs hover:scale-[1.02] animate-gold-pulse"
          >
            <span aria-hidden>👑</span>
            <span>{t('profileCard.adminPanel')}</span>
          </button>
        </Link>
      )}

      {/* Atalhos estilo cartas */}
      <Link to="/deck-builder" className="ygo-shortcut-card" onClick={handleLinkClick}>
        <img
          src="/images/decks/deck.png"
          alt=""
          className="w-full h-16 object-contain relative z-10 opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent flex flex-col justify-end p-2 z-20">
          <h3 className="font-display text-white font-bold text-xs drop-shadow-lg">
            {t('profileCard.organizeDeck')}
          </h3>
          <p className="text-arena-mist text-[10px] leading-tight">{t('profileCard.organizeDeckHint')}</p>
        </div>
      </Link>

      <Link to="/inventory" className="ygo-shortcut-card" onClick={handleLinkClick}>
        <img
          src="/images/inventario.png"
          alt=""
          className="w-full h-16 object-contain relative z-10 opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent flex flex-col justify-end p-2 z-20">
          <h3 className="font-display text-white font-bold text-xs drop-shadow-lg">
            {t('profileCard.inventory')}
          </h3>
          <p className="text-arena-mist text-[10px] leading-tight">{t('profileCard.inventoryHint')}</p>
        </div>
      </Link>

      <Link to="/friends" className="ygo-shortcut-card" onClick={handleLinkClick}>
        <div className="w-full h-16 flex items-center justify-center relative z-10">
          <span className="text-4xl" aria-hidden>👥</span>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent flex flex-col justify-end p-2 z-20">
          <h3 className="font-display text-white font-bold text-xs drop-shadow-lg">
            {t('profileCard.friends')}
          </h3>
          <p className="text-arena-mist text-[10px] leading-tight">{t('profileCard.friendsHint')}</p>
        </div>
      </Link>
    </div>
  );
};
