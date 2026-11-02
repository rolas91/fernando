import { AsyncLocalStorage } from 'async_hooks';
import type { Request } from 'express';

export type ErrorRequest = Request & { user?: { id: string; role: string } };
export const errorContext = new AsyncLocalStorage<{
  requestId: string;
  request: ErrorRequest;
}>();

export function redact(value: unknown, max = 8000): string {
  let text: string;
  try {
    text =
      value instanceof Error
        ? value.message
        : typeof value === 'string'
          ? value
          : JSON.stringify(value);
  } catch {
    text = '[Unserializable error]';
  }
  return String(text ?? '')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(["']?(?:password|token|secret|authorization|cookie|api[-_]?key|access[-_]?key|signature)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&<>]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .slice(0, max);
}

export function safePath(value: string): string {
  return redact(value.split(/[?#]/)[0], 1000);
}
