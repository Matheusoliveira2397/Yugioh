/** Disparado pelo banner ao montar, ao voltar à aba, e após duelo encontrado/encerrado. */
export const ACTIVE_DUEL_REFRESH_EVENT = 'yugioh:refresh-active-duel-banner';

export function requestActiveDuelRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTIVE_DUEL_REFRESH_EVENT));
}
