const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function reporter() {
  const events = {};
  const calls = [];
  const storage = new Map();
  const navigator = { onLine: true };
  let failReporting = false;
  let apiStatus = 500;
  let apiMessage = '';
  const dispatched = [];
  const session = new Map();
  const auth = { exports: {}, window: {}, Event };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        require('node:path').join(__dirname, '../src/lib/authErrors.ts'),
        'utf8',
      ),
      {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
        },
      },
    ).outputText,
    auth,
  );
  const fetch = async (input, options) => {
    const url = String(input);
    calls.push({ url, options });
    if (url.includes('/system-errors/report')) {
      if (failReporting) throw new Error('Offline');
      return { ok: true, status: 202 };
    }
    return {
      ok: false,
      status: apiStatus,
      clone: () => ({ json: async () => ({ message: apiMessage }) }),
      headers: { get: () => '063a0934-6654-4f9c-9643-81fdc257a927' },
    };
  };
  const window = {
    fetch,
    dispatchEvent: (event) => dispatched.push(event.type),
    addEventListener: (name, fn) => {
      events[name] = fn;
    },
    setInterval: (fn) => {
      events.timer = fn;
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const source = fs
    .readFileSync(
      require('node:path').join(__dirname, '../src/lib/errorReporting.ts'),
      'utf8',
    )
    .replace('import.meta.env.VITE_API_URL', "''");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const context = {
    window,
    navigator,
    location: { pathname: '/reset', origin: 'https://test.local' },
    localStorage: { getItem: (key) => storage.get(key) || null },
    exports: {},
    console: { error: () => {} },
    Error,
    URL,
    Request,
    Headers,
    Event,
    sessionStorage: { setItem: (key, value) => session.set(key, value) },
    require: (name) => {
      assert.equal(name, './authErrors');
      return auth.exports;
    },
    DOMException,
    AbortController,
  };
  vm.runInNewContext(code, context);
  context.exports.installErrorReporting();
  return {
    ...context.exports,
    dispatched,
    session,
    auth: auth.exports,
    setApiResponse: (status, message) => {
      apiStatus = status;
      apiMessage = message;
    },
    window,
    events,
    calls,
    navigator,
    storage,
    setReportingFailure: (value) => {
      failReporting = value;
    },
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('redacts reports, strips query parameters, and deduplicates repeated errors', async () => {
  const r = reporter();
  r.reportError(new Error('password=private user@example.com'), {
    path: '/reset?token=private',
  });
  r.reportError(new Error('password=private user@example.com'), {
    path: '/reset?token=private',
  });
  await settle();
  assert.equal(r.calls.length, 1);
  const report = JSON.parse(r.calls[0].options.body);
  assert.equal(report.path, '/reset');
  assert.doesNotMatch(JSON.stringify(report), /private|user@example.com/);
});

test('reports HTTP errors with request ID without copying request bodies', async () => {
  const r = reporter();
  await r.window.fetch('/api/example', {
    method: 'POST',
    body: 'private form values',
  });
  await settle();
  const report = JSON.parse(
    r.calls.find((call) => call.url.includes('/system-errors/report')).options
      .body,
  );
  assert.equal(report.statusCode, 500);
  assert.equal(report.requestId, '063a0934-6654-4f9c-9643-81fdc257a927');
  assert.equal(report.path, '/api/example');
  assert.doesNotMatch(JSON.stringify(report), /private form/);
});

test('never recursively reports failures of the reporting endpoint', async () => {
  const r = reporter();
  r.setReportingFailure(true);
  r.reportError('Original error');
  await settle();
  assert.equal(r.calls.length, 1);
  r.setReportingFailure(false);
  r.events.timer();
  await settle();
  assert.equal(r.calls.length, 2);
});

test('keeps the original session attribution when retrying offline reports', async () => {
  const r = reporter();
  r.navigator.onLine = false;
  r.storage.set('auth_token', 'original-session');
  r.reportError('Offline error');
  r.storage.set('auth_token', 'different-session');
  r.navigator.onLine = true;
  r.events.online();
  await settle();
  assert.equal(
    r.calls[0].options.headers.Authorization,
    'Bearer original-session',
  );
});

test('bounds the offline queue', async () => {
  const r = reporter();
  r.navigator.onLine = false;
  for (let i = 0; i < 100; i++) r.reportError(`Error ${i}`);
  r.navigator.onLine = true;
  r.events.online();
  await settle();
  assert.equal(r.calls.length, 20);
});

test('captures global JavaScript and promise failures', async () => {
  const r = reporter();
  r.events.error({ error: new Error('Render exploded') });
  r.events.unhandledrejection({ reason: new Error('Async failed') });
  await settle();
  assert.equal(r.calls.length, 2);
  assert.deepEqual(
    r.calls.map((call) => JSON.parse(call.options.body).context),
    ['JavaScript', 'Unhandled promise'],
  );
});

test('marks web API requests without changing authorization or external requests', async () => {
  const r = reporter();
  await r.window.fetch('/api/workers', {
    headers: { Authorization: 'Bearer existing-token' },
  });
  const call = r.calls.find((c) => c.url === '/api/workers');
  assert.equal(call.options.headers.get('X-Client-Platform'), 'web');
  assert.equal(
    call.options.headers.get('Authorization'),
    'Bearer existing-token',
  );
  await r.window.fetch('https://external.local/data');
  assert.equal(
    r.calls.find((c) => c.url.includes('external.local')).options,
    undefined,
  );
});

test('revoked web access ends the panel session with a specific notice', async () => {
  const r = reporter();
  r.setApiResponse(403, r.auth.AUTH_MESSAGES.webAccessDenied);
  await r.window.fetch('/api/workers');
  assert.deepEqual(r.dispatched, [r.auth.AUTH_SESSION_EXPIRED_EVENT]);
  assert.equal(
    r.session.get(r.auth.AUTH_NOTICE_KEY),
    r.auth.AUTH_MESSAGES.webAccessDenied,
  );
});

test('ordinary forbidden operations do not end a valid session', async () => {
  const r = reporter();
  r.setApiResponse(403, 'Insufficient permissions');
  await r.window.fetch('/api/workers');
  assert.equal(r.dispatched.length, 0);
});

test('web login denial uses the platform-specific message', () => {
  const r = reporter();
  assert.equal(
    r.auth.loginErrorMessage(
      new r.auth.AuthHttpError(403, r.auth.AUTH_MESSAGES.webAccessDenied),
    ),
    r.auth.AUTH_MESSAGES.webAccessDenied,
  );
});
