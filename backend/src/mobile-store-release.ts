import { sign } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

export type MobilePlatform = 'ios' | 'android';
export const MOBILE_PACKAGE = 'com.drtrafficcontrol.mobile';
export const VERSION_PATTERN = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;

export function validStoreUrl(platform: MobilePlatform, url: string): boolean {
  return platform === 'ios'
    ? /^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[^/?#]+\/)?id\d+(?:\?[^#]*)?$/i.test(
        url,
      )
    : url === `https://play.google.com/store/apps/details?id=${MOBILE_PACKAGE}`;
}

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function required(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function jwt(
  header: Record<string, string>,
  claims: Record<string, string | number>,
  key: string,
) {
  const encode = (part: object) =>
    Buffer.from(JSON.stringify(part)).toString('base64url');
  const body = `${encode(header)}.${encode(claims)}`;
  const es256 = header.alg === 'ES256';
  const signature = sign(
    es256 ? 'sha256' : 'RSA-SHA256',
    Buffer.from(body),
    es256 ? { key, dsaEncoding: 'ieee-p1363' } : key,
  );
  return `${body}.${signature.toString('base64url')}`;
}

async function storeRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Store HTTP ${response.status}`);
  if (response.status === 204 || options.method === 'DELETE')
    return undefined as T;
  return (await response.json()) as T;
}

export function androidCompletedVersion(
  track: {
    track?: string;
    releases?: Array<{ status?: string; versionCodes?: string[] }>;
  },
  versions: Record<string, string>,
): string | null {
  if (track.track !== 'production') return null;
  const completed = (track.releases ?? []).filter(
    (release) => release.status === 'completed',
  );
  const codes = completed.flatMap((release) => release.versionCodes ?? []);
  // Retained artifacts can still serve some devices. Require the same version
  // for every artifact in the fully rolled out release(s).
  if (
    !codes.length ||
    completed.some((release) => !release.versionCodes?.length)
  )
    return null;
  const version = versions[codes[0]];
  return VERSION_PATTERN.test(version) &&
    codes.every((code) => versions[code] === version)
    ? version
    : null;
}

export async function readPublishedVersion(
  config: ConfigService,
  platform: MobilePlatform,
): Promise<string | null> {
  const prefix = `MOBILE_${platform.toUpperCase()}`;
  const storeUrl = required(config, `${prefix}_STORE_URL`);
  if (!validStoreUrl(platform, storeUrl)) throw new Error('Invalid store URL');
  const countries = [
    ...new Set(
      required(config, `${prefix}_STORE_COUNTRIES`)
        .toUpperCase()
        .split(',')
        .map((country) => country.trim()),
    ),
  ];
  if (countries.some((country) => !/^[A-Z]{2}$/.test(country)))
    throw new Error('Invalid store countries');

  const now = Math.floor(Date.now() / 1_000);
  if (platform === 'ios') {
    const appId = required(config, 'MOBILE_APPLE_APP_ID');
    if (
      !/^\d+$/.test(appId) ||
      !new URL(storeUrl).pathname.endsWith(`/id${appId}`)
    )
      throw new Error('Apple app ID and store URL must match');
    const token = jwt(
      {
        alg: 'ES256',
        kid: required(config, 'MOBILE_APPLE_KEY_ID'),
        typ: 'JWT',
      },
      {
        iss: required(config, 'MOBILE_APPLE_ISSUER_ID'),
        iat: now,
        exp: now + 300,
        aud: 'appstoreconnect-v1',
      },
      Buffer.from(
        required(config, 'MOBILE_APPLE_PRIVATE_KEY_BASE64'),
        'base64',
      ).toString('utf8'),
    );
    const query = new URLSearchParams({
      'filter[platform]': 'IOS',
      'filter[appVersionState]': 'READY_FOR_DISTRIBUTION',
      'fields[appStoreVersions]': 'appVersionState,versionString',
    });
    const { data } = await storeRequest<{
      data: Array<{
        attributes: { appVersionState: string; versionString: string };
      }>;
    }>(
      `https://api.appstoreconnect.apple.com/v1/apps/${appId}/appStoreVersions?${query}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const version = data
      .filter(
        ({ attributes }) =>
          attributes.appVersionState === 'READY_FOR_DISTRIBUTION',
      )
      .map(({ attributes }) => attributes.versionString)
      .filter((value) => VERSION_PATTERN.test(value))
      .sort(compareVersions)
      .at(-1);
    if (!version) return null;
    for (const country of countries) {
      const params = new URLSearchParams({
        id: appId,
        country,
        entity: 'software',
      });
      const { results } = await storeRequest<{
        results: Array<{ trackId: number; bundleId: string; version: string }>;
      }>(`https://itunes.apple.com/lookup?${params}`);
      if (
        !results.some(
          (result) =>
            String(result.trackId) === appId &&
            result.bundleId === MOBILE_PACKAGE &&
            result.version === version,
        )
      )
        return null;
    }
    return version;
  }

  const packageName = required(config, 'MOBILE_GOOGLE_PACKAGE_NAME');
  if (packageName !== MOBILE_PACKAGE)
    throw new Error('Unexpected Google package');
  const versions = JSON.parse(
    required(config, 'MOBILE_ANDROID_VERSION_CODES'),
  ) as Record<string, string>;
  if (
    !versions ||
    Array.isArray(versions) ||
    typeof versions !== 'object' ||
    Object.entries(versions).some(
      ([code, value]) =>
        !/^\d+$/.test(code) ||
        typeof value !== 'string' ||
        !VERSION_PATTERN.test(value),
    )
  )
    throw new Error('Invalid Android version code mapping');

  const account = JSON.parse(
    Buffer.from(
      required(config, 'MOBILE_GOOGLE_SERVICE_ACCOUNT_JSON_BASE64'),
      'base64',
    ).toString('utf8'),
  ) as { client_email: string; private_key: string };
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const assertion = jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      aud: tokenUrl,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      iat: now,
      exp: now + 300,
    },
    account.private_key,
  );
  const { access_token } = await storeRequest<{ access_token: string }>(
    tokenUrl,
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    },
  );
  if (!access_token) throw new Error('Missing Google access token');
  const headers = { Authorization: `Bearer ${access_token}` };
  const application = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}`;
  const edits = `${application}/edits`;
  const { id } = await storeRequest<{ id: string }>(edits, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!id) throw new Error('Missing Google edit ID');
  const edit = `${edits}/${encodeURIComponent(id)}`;
  try {
    const track = await storeRequest<
      Parameters<typeof androidCompletedVersion>[0]
    >(`${edit}/tracks/production`, { headers });
    const version = androidCompletedVersion(track, versions);
    if (!version) return null;
    const lifecycle = await storeRequest<{
      releases?: Array<{
        releaseLifecycleState: string;
        activeArtifacts?: Array<{ versionCode: number }>;
      }>;
    }>(`${application}/tracks/production/releases`, { headers });
    const published = new Set(
      (lifecycle.releases ?? [])
        .filter(
          (release) =>
            release.releaseLifecycleState ===
            'RELEASE_LIFECYCLE_STATE_PUBLISHED',
        )
        .flatMap((release) => release.activeArtifacts ?? [])
        .map(({ versionCode }) => String(versionCode)),
    );
    const completedCodes = (track.releases ?? [])
      .filter((release) => release.status === 'completed')
      .flatMap((release) => release.versionCodes ?? []);
    if (!completedCodes.every((code) => published.has(code))) return null;
    const availability = await storeRequest<{
      countries?: Array<{ countryCode: string }>;
    }>(`${edit}/countryAvailability/production`, { headers });
    const availableCountries = new Set(
      availability.countries?.map(({ countryCode }) => countryCode),
    );
    return countries.every((country) => availableCountries.has(country))
      ? version
      : null;
  } finally {
    await storeRequest(edit, { method: 'DELETE', headers });
  }
}
