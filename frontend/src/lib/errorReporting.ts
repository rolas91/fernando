type ErrorReport = {
  message: string;
  stack?: string;
  context?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  level?: 'error' | 'warn';
  requestId?: string;
};

const base = import.meta.env.VITE_API_URL || '';
const originalFetch = window.fetch.bind(window);
let installed = false;
let busy = false;
const queue: { report: ErrorReport; token: string | null }[] = [];
const recent = new Map<string, number>();

function clean(value: unknown, max = 8000): string {
  let text = '';
  try {
    text =
      value instanceof Error
        ? value.message
        : typeof value === 'string'
          ? value
          : JSON.stringify(value);
  } catch {
    text = 'Unknown error';
  }
  return String(text ?? '')
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(["']?(?:password|token|secret|authorization|cookie|api[-_]?key|signature)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&<>]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[EMAIL]')
    .slice(0, max);
}

export function reportError(
  error: unknown,
  details: Partial<ErrorReport> = {},
) {
  try {
    const report: ErrorReport = {
      ...details,
      message: clean(error),
      stack: clean(
        details.stack || (error instanceof Error ? error.stack : ''),
      ),
      context: clean(details.context || 'Browser', 200),
      path: clean((details.path || location.pathname).split(/[?#]/)[0], 1000),
    };
    const key = JSON.stringify([
      report.message,
      report.context,
      report.path,
      report.method,
      report.statusCode,
    ]);
    const now = Date.now();
    for (const [entry, date] of recent)
      if (now - date > 60000) recent.delete(entry);
    if (recent.has(key) || queue.length >= 20 || recent.size >= 30) return;
    recent.set(key, now);
    queue.push({
      report,
      token:
        localStorage.getItem('auth_token') ||
        localStorage.getItem('dr_auth_token'),
    });
    void flush();
  } catch {
    /* Reporting must never interrupt the application. */
  }
}

async function flush() {
  if (busy || !navigator.onLine || !queue.length) return;
  busy = true;
  try {
    while (queue.length) {
      const { report, token } = queue[0];
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      let result: Response;
      try {
        result = await originalFetch(`${base}/api/system-errors/report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(report),
          keepalive: true,
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      if (result.status >= 500 || result.status === 429) break;
      queue.shift();
    }
  } catch {
    /* Retry on the next timer or when the connection returns. */
  } finally {
    busy = false;
  }
}

export function installErrorReporting() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) =>
    reportError(event.error || event.message, { context: 'JavaScript' }),
  );
  window.addEventListener('unhandledrejection', (event) =>
    reportError(event.reason, { context: 'Unhandled promise' }),
  );
  window.addEventListener('online', () => void flush());
  window.setInterval(() => void flush(), 30000);
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    // Capture handled errors too; avoid copying arbitrary objects that may contain form data.
    reportError(
      args.find((value) => value instanceof Error) ||
        args.filter((value) => typeof value === 'string').join(' '),
      { context: 'Console' },
    );
  };
  window.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      location.origin,
    );
    const apiOrigin = new URL(base || location.origin, location.origin).origin;
    const tracked =
      url.origin === apiOrigin &&
      url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/api/system-errors');
    const method =
      init?.method || (input instanceof Request ? input.method : 'GET');
    try {
      const response = await originalFetch(input, init);
      if (tracked && !response.ok)
        reportError(`HTTP ${response.status}`, {
          context: 'API',
          path: url.pathname,
          method,
          statusCode: response.status,
          requestId: response.headers.get('X-Request-Id') || undefined,
          level: response.status >= 500 ? 'error' : 'warn',
        });
      return response;
    } catch (error) {
      if (
        tracked &&
        !(error instanceof DOMException && error.name === 'AbortError')
      )
        reportError(error, { context: 'Network', path: url.pathname, method });
      throw error;
    }
  };
}
