/**
 * Formata score para exibição:
 * - Número inteiro: sem decimais (22, 112, 1998)
 * - Número quebrado: 1 casa decimal com vírgula (21,7, 190,4)
 */
export function formatScore(value: number | undefined | null): string {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  const isInteger = Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9;
  if (isInteger) {
    return String(Math.round(n));
  }
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
