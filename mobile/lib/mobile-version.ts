export type VersionPolicy = {
  minimumVersion: string | null;
  storeUrl: string | null;
};

export function isOlderVersion(installed: string, minimum: string): boolean {
  const pattern = /^\d+\.\d+\.\d+$/;
  if (!pattern.test(installed) || !pattern.test(minimum)) {
    throw new Error('Invalid application version');
  }
  const current = installed.split('.').map(Number);
  const required = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (current[i] !== required[i]) return current[i] < required[i];
  }
  return false;
}

export function parseVersionPolicy(
  value: unknown,
  platform: string,
): VersionPolicy {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid version policy');
  const policy = value as VersionPolicy;
  if (policy.minimumVersion === null && policy.storeUrl === null) return policy;
  if (
    typeof policy.minimumVersion !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(policy.minimumVersion) ||
    typeof policy.storeUrl !== 'string'
  ) {
    throw new Error('Invalid version policy');
  }
  const url = new URL(policy.storeUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    (platform === 'ios'
      ? url.hostname !== 'apps.apple.com'
      : url.hostname !== 'play.google.com' ||
        url.pathname !== '/store/apps/details' ||
        url.searchParams.get('id') !== 'com.drtrafficcontrol.mobile')
  ) {
    throw new Error('Invalid store URL');
  }
  return policy;
}
