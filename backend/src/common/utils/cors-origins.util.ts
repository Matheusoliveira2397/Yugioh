/**
 * Mesma origem lógica que `main.ts` (HTTP CORS) e gateways Socket.IO.
 * `CORS_ORIGIN` pode listar várias URLs separadas por vírgula.
 */
export function getCorsOrigins(): string[] {
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const origins = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length ? origins : ['http://localhost:5173'];
}

/** Valor aceito por `enableCors` e `cors.origin` do Socket.IO. */
export function getCorsOriginOption(): string | string[] {
  const o = getCorsOrigins();
  return o.length === 1 ? o[0] : o;
}
