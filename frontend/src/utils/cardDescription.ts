/**
 * Retorna a descrição/efeito da carta a partir de qualquer objeto que possa ter
 * description, desc ou effect (ex.: API Yugioh usa "desc", backend usa "description").
 */
export function getCardDescription(card: { description?: string | null; desc?: string | null; effect?: string | null } | null | undefined): string {
  if (!card) return 'Sem descrição';
  const text = card.description ?? card.desc ?? card.effect ?? '';
  return typeof text === 'string' && text.trim() ? text : 'Sem descrição';
}
