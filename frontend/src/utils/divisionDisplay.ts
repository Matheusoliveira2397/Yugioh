/**
 * API retorna divisão sempre em inglês (Bronze, Silver, Gold, ...).
 * Este util padroniza a exibição em português na interface.
 */

const DIVISION_PT: Record<string, string> = {
  Bronze: 'Bronze',
  Silver: 'Prata',
  Gold: 'Ouro',
  Platinum: 'Platina',
  Diamond: 'Diamante',
  Master: 'Mestre',
  Legendary: 'Desafiante',
};

/** Nome da divisão para exibir na UI (sempre em português onde houver tradução). */
export function getDivisionDisplayName(division: string | null | undefined): string {
  if (!division) return 'Bronze';
  const key = division.trim();
  return DIVISION_PT[key] ?? key;
}

/** Caminho da imagem do emblema da divisão (pastas usam nomes em português). */
export function getDivisionImagePath(division: string | null | undefined): string | null {
  if (!division) return null;
  const normalized = division.trim().toUpperCase();
  const map: Record<string, string> = {
    BRONZE: 'Bronze',
    SILVER: 'Prata',
    PRATA: 'Prata',
    GOLD: 'Ouro',
    OURO: 'Ouro',
    PLATINUM: 'Platina',
    PLATINA: 'Platina',
    DIAMOND: 'Diamante',
    DIAMANTE: 'Diamante',
    MASTER: 'Mestre',
    MESTRE: 'Mestre',
    LEGENDARY: 'Desafiante',
    DESAFIANTE: 'Desafiante',
  };
  const fileName = map[normalized] || division.trim();
  return `/images/Divisões/${fileName}.png`;
}
