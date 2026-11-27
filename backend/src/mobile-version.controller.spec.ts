import { ConfigService } from '@nestjs/config';
import { MobileVersionController } from './mobile-version.controller';
import { MobileVersionPolicyService } from './mobile-version-policy.service';
import { DataSource } from 'typeorm';

describe('Mobile version policy', () => {
  const controller = (values: Record<string, string> = {}, stored?: string) => {
    const config = new ConfigService(values);
    const database = {
      query: jest.fn().mockResolvedValue([{ minimum_version: stored }]),
    } as unknown as DataSource;
    return new MobileVersionController(
      config,
      new MobileVersionPolicyService(config, database),
    );
  };
  it('disables enforcement until explicitly configured', async () => {
    await expect(controller().getPolicy('ios')).resolves.toEqual({
      minimumVersion: null,
      storeUrl: null,
    });
  });
  it('keeps platform policies independent', async () => {
    const api = controller({
      MOBILE_ANDROID_MIN_VERSION: '1.0.5',
      MOBILE_ANDROID_STORE_URL:
        'https://play.google.com/store/apps/details?id=com.drtrafficcontrol.mobile',
    });
    expect((await api.getPolicy('android')).minimumVersion).toBe('1.0.5');
    expect((await api.getPolicy('ios')).minimumVersion).toBeNull();
  });
  it('rejects invalid configuration instead of disabling enforcement', async () => {
    await expect(
      controller({ MOBILE_IOS_MIN_VERSION: '1.0.5' }).getPolicy('ios'),
    ).rejects.toThrow();
    await expect(
      controller({
        MOBILE_IOS_MIN_VERSION: 'oops',
        MOBILE_IOS_STORE_URL: 'https://apps.apple.com/app/id123',
      }).getPolicy('ios'),
    ).rejects.toThrow();
    await expect(controller().getPolicy('web')).rejects.toThrow();
  });
  it('accepts Apple country and named app URLs', async () => {
    await expect(
      controller({
        MOBILE_IOS_MIN_VERSION: '1.0.5',
        MOBILE_IOS_STORE_URL:
          'https://apps.apple.com/us/app/dr-workops/id123456',
      }).getPolicy('ios'),
    ).resolves.toMatchObject({ minimumVersion: '1.0.5' });
  });

  it('serves the confirmed minimum with a manual downgrade and off switch', async () => {
    const values = {
      MOBILE_IOS_AUTO_UPDATE: 'true',
      MOBILE_IOS_STORE_URL: 'https://apps.apple.com/app/id123',
    };
    for (const [override, expected] of [
      ['', '1.0.6'],
      ['1.0.5', '1.0.5'],
      ['off', null],
    ] as const) {
      await expect(
        controller(
          { ...values, MOBILE_IOS_MIN_VERSION: override },
          '1.0.6',
        ).getPolicy('ios'),
      ).resolves.toMatchObject({ minimumVersion: expected });
    }
  });
});
