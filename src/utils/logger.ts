import { Logger } from 'koishi';
export interface PbhhLogger {
  info(message: unknown, ...args: unknown[]): void;
  warn(message: unknown, ...args: unknown[]): void;
  error(message: unknown, ...args: unknown[]): void;
  debug(message: unknown, ...args: unknown[]): void;
}
function truncateLongStrings(value: unknown, limit: number): unknown {
  if (value instanceof Error) {
    const cause = 'cause' in value ? truncateLongStrings((value as Error & { cause?: unknown; }).cause, limit) : undefined;
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncateLongStrings(value.stack, limit) : undefined,
      cause,
    };
  }
  if (typeof value === 'string') {
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => truncateLongStrings(v, limit));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = truncateLongStrings(v, limit);
  }
  return out;
}
function toStrings(args: unknown[]): string[] {
  return args.map((v) => {
    const v2 = truncateLongStrings(v, 100);
    if (typeof v2 === 'string') return v2;
    try {
      return JSON.stringify(v2);
    } catch {
      return String(v2);
    }
  });
}
export function createLogger(base: Logger, debugEnabled: boolean): PbhhLogger {
  return {
    info: (message, ...args) => base.info(String(message), ...toStrings(args)),
    warn: (message, ...args) => base.warn(String(message), ...toStrings(args)),
    error: (message, ...args) => base.error(String(message), ...toStrings(args)),
    debug: (message, ...args) => {
      if (!debugEnabled) return;
      base.info(String(message), ...toStrings(args));
    },
  };
}
