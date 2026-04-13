import { randomBytes } from 'crypto';

function isProduction() {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

export function ensureRuntimeEnv() {
  if (!process.env.JWT_SECRET) {
    if (isProduction()) {
      throw new Error(
        'Missing env JWT_SECRET. Set JWT_SECRET in your environment (.env) before starting the app.',
      );
    }

    // Dev fallback: stable for the current process only.
    process.env.JWT_SECRET = randomBytes(32).toString('hex');

    console.warn(
      '[dev] JWT_SECRET was not set. Generated an ephemeral JWT secret for this process. ' +
        'Set JWT_SECRET in .env to keep tokens valid across restarts.',
    );
  }
}
