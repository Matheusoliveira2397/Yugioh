/** Corpo típico de erro HTTP do Nest (`HttpExceptionFilter`). */
export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  details?: { validationErrors?: string[] };
}

export function messageFromApiBody(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as ApiErrorBody;
  if (Array.isArray(d.message)) {
    return 'Erro de validação: ' + d.message.join(', ');
  }
  if (typeof d.message === 'string' && d.message.trim()) {
    return d.message.trim();
  }
  return null;
}

export function getStatusFallbackMessage(status: number): string | null {
  switch (status) {
    case 400:
      return 'Requisição inválida.';
    case 401:
      return 'Sessão expirada ou não autorizado.';
    case 403:
      return 'Você não tem permissão para esta ação.';
    case 404:
      return 'Recurso não encontrado.';
    case 409:
      return 'Conflito: o recurso já existe ou está em uso.';
    case 413:
      return 'Arquivo ou dados muito grandes.';
    case 429:
      return 'Muitas requisições. Aguarde um momento.';
    case 500:
      return 'Erro no servidor. Tente novamente.';
    case 502:
    case 503:
    case 504:
      return 'Servidor temporariamente indisponível.';
    default:
      return null;
  }
}

type AxiosLike = {
  response?: { status?: number; data?: unknown };
  message?: string;
  code?: string;
  isAxiosError?: boolean;
};

function asAxiosLike(error: unknown): AxiosLike | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as AxiosLike;
  if (e.isAxiosError || 'response' in error || 'code' in error) return e;
  return null;
}

/**
 * Mensagem única para exibir ao usuário a partir de qualquer erro de requisição (Axios ou genérico).
 */
export function getApiErrorMessage(error: unknown): string {
  const ax = asAxiosLike(error);
  if (ax) {
    const status = ax.response?.status;
    const fromBody =
      ax.response?.data != null ? messageFromApiBody(ax.response.data) : null;
    if (fromBody) return fromBody;
    if (ax.code === 'ECONNABORTED' || ax.message?.includes('timeout')) {
      return 'A requisição demorou muito para responder.';
    }
    if (ax.code === 'ERR_NETWORK' || !ax.response) {
      return 'Não foi possível conectar ao servidor.';
    }
    if (status != null) {
      const fb = getStatusFallbackMessage(status);
      if (fb) return fb;
    }
    if (ax.message) return ax.message;
  }
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

/** Atualiza `error.message` com texto amigável (usado pelo interceptor do `api`). */
export function normalizeAxiosErrorMessage(error: unknown): void {
  if (!error || typeof error !== 'object') return;
  const e = error as { message?: string };
  e.message = getApiErrorMessage(error);
}
