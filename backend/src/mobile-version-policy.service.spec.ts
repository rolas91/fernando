import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { DataSource } from 'typeorm';
import * as store from './mobile-store-release';
import { MobileVersionPolicyService } from './mobile-version-policy.service';

describe('automatic mobile version promotion', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['1.0.6', '1.0.6'],
    [null, '1.0.5'],
    ['1.0.4', '1.0.5'],
  ])(
    'preserves or promotes the confirmed minimum for %s',
    async (published, expected) => {
      const read = jest.spyOn(store, 'readPublishedVersion');
      if (published) read.mockResolvedValue(published);
      else read.mockRejectedValue(new Error('Store unavailable'));

      const query = jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([
          {
            minimum_version: '1.0.5',
            candidate_version: '1.0.6',
            candidate_since: new Date(Date.now() - 7 * 60 * 60 * 1_000),
          },
        ])
        .mockResolvedValueOnce([]);
      const dataSource = {
        transaction: (
          run: (manager: { query: typeof query }) => Promise<void>,
        ) => run({ query }),
      } as unknown as DataSource;
      const service = new MobileVersionPolicyService(
        new ConfigService({ MOBILE_IOS_AUTO_UPDATE: 'true' }),
        dataSource,
      );
      await (
        service as unknown as {
          refreshPlatform(platform: store.MobilePlatform): Promise<void>;
        }
      ).refreshPlatform('ios');
      expect(query.mock.calls[2][1]).toEqual(['ios', expected, null, null]);
    },
  );

  it('does not raise Android’s minimum during a staged rollout or for unmapped artifacts', () => {
    const versions = { '42': '1.0.5', '43': '1.0.6' };
    expect(
      store.androidCompletedVersion(
        {
          track: 'production',
          releases: [
            { status: 'inProgress', versionCodes: ['43'] },
            { status: 'completed', versionCodes: ['42'] },
          ],
        },
        versions,
      ),
    ).toBe('1.0.5');
    expect(
      store.androidCompletedVersion(
        {
          track: 'production',
          releases: [{ status: 'completed', versionCodes: ['43', '44'] }],
        },
        versions,
      ),
    ).toBeNull();
    expect(
      store.androidCompletedVersion(
        {
          track: 'production',
          releases: [{ status: 'completed', versionCodes: ['42', '43'] }],
        },
        versions,
      ),
    ).toBeNull();
    expect(
      store.androidCompletedVersion(
        {
          track: 'production',
          releases: [{ status: 'completed', versionCodes: ['43'] }],
        },
        versions,
      ),
    ).toBe('1.0.6');
  });

  it('requires iOS storefronts to advertise the approved version', async () => {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const key = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const config = new ConfigService({
      MOBILE_IOS_STORE_URL: 'https://apps.apple.com/app/id123',
      MOBILE_IOS_STORE_COUNTRIES: 'US,CA',
      MOBILE_APPLE_APP_ID: '123',
      MOBILE_APPLE_ISSUER_ID: 'issuer',
      MOBILE_APPLE_KEY_ID: 'key',
      MOBILE_APPLE_PRIVATE_KEY_BASE64: Buffer.from(key).toString('base64'),
    });
    const response = (version: string) =>
      Response.json({
        results: [{ trackId: 123, bundleId: store.MOBILE_PACKAGE, version }],
      });
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              attributes: {
                appVersionState: 'READY_FOR_DISTRIBUTION',
                versionString: '1.0.6',
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response('1.0.6'))
      .mockResolvedValueOnce(response('1.0.5'));
    await expect(store.readPublishedVersion(config, 'ios')).resolves.toBeNull();
    expect(fetch.mock.calls[2][0]).toContain('country=CA');
  });

  it('discards the Android edit and skips releases approved but not published', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const account = {
      client_email: 'poller@example.test',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    };
    const config = new ConfigService({
      MOBILE_ANDROID_STORE_URL: `https://play.google.com/store/apps/details?id=${store.MOBILE_PACKAGE}`,
      MOBILE_ANDROID_STORE_COUNTRIES: 'US',
      MOBILE_ANDROID_VERSION_CODES: '{"43":"1.0.6"}',
      MOBILE_GOOGLE_PACKAGE_NAME: store.MOBILE_PACKAGE,
      MOBILE_GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: Buffer.from(
        JSON.stringify(account),
      ).toString('base64'),
    });
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ access_token: 'token' }))
      .mockResolvedValueOnce(Response.json({ id: 'edit' }))
      .mockResolvedValueOnce(
        Response.json({
          track: 'production',
          releases: [{ status: 'completed', versionCodes: ['43'] }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          releases: [
            {
              releaseLifecycleState:
                'RELEASE_LIFECYCLE_STATE_APPROVED_NOT_PUBLISHED',
              activeArtifacts: [{ versionCode: 43 }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      store.readPublishedVersion(config, 'android'),
    ).resolves.toBeNull();
    expect(fetch.mock.calls[4][1]).toMatchObject({ method: 'DELETE' });
  });
});
