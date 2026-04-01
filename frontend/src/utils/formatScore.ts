/**
 * Formata score (duelista ou grupo) para exibição:
 * - Após arredondar a 1 casa decimal: se for inteiro → sem decimais (100, 1.000)
 * - Caso contrário → exatamente 1 casa decimal em pt-BR (100,9)
 */
export function formatScore(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '0';
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return '0';

  const rounded = Math.round(n * 10) / 10;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;

  if (isWhole) {
    return Math.round(rounded).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  return rounded.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
