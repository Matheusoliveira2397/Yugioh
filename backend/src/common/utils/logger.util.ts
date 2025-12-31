/**
 * Sistema de logging otimizado para produção
 * Reduz logs em produção para melhorar performance
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'debug');

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const currentLogLevel = LogLevel[LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] || LogLevel.INFO;

export const logger = {
  debug: (...args: any[]) => {
    if (currentLogLevel <= LogLevel.DEBUG || isDevelopment) {
      console.log(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (currentLogLevel <= LogLevel.INFO || isDevelopment) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (currentLogLevel <= LogLevel.WARN) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    // Erros sempre são logados
    console.error(...args);
  },
  
  // Logs de performance (sempre logados, mas formatados)
  perf: (label: string, duration: number) => {
    if (duration > 100) { // Só logar se demorar mais de 100ms
      console.warn(`⏱️ [PERF] ${label} levou ${duration}ms`);
    } else if (isDevelopment) {
      console.log(`⏱️ [PERF] ${label} levou ${duration}ms`);
    }
  },
};

