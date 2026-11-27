import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  compareVersions,
  MobilePlatform,
  readPublishedVersion,
} from './mobile-store-release';

const CHECK_INTERVAL = 15 * 60 * 1_000;
const DISTRIBUTION_GRACE = 6 * 60 * 60 * 1_000;

type StoredPolicy = {
  minimum_version: string | null;
  candidate_version: string | null;
  candidate_since: Date | null;
};

@Injectable()
export class MobileVersionPolicyService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MobileVersionPolicyService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly database: DataSource,
  ) {}

  private manualMinimum(platform: MobilePlatform) {
    return this.config
      .get<string>(`MOBILE_${platform.toUpperCase()}_MIN_VERSION`)
      ?.trim();
  }

  private autoEnabled(platform: MobilePlatform) {
    return (
      !this.manualMinimum(platform) &&
      this.config
        .get<string>(`MOBILE_${platform.toUpperCase()}_AUTO_UPDATE`)
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  async getMinimum(platform: MobilePlatform): Promise<string | null> {
    const manual = this.manualMinimum(platform);
    if (manual) return manual.toLowerCase() === 'off' ? null : manual;
    if (!this.autoEnabled(platform)) return null;

    const [stored] = await this.database.query<StoredPolicy[]>(
      'SELECT minimum_version FROM mobile_version_policies WHERE platform = $1',
      [platform],
    );
    return stored?.minimum_version ?? null;
  }

  onModuleInit() {
    if (!this.autoEnabled('ios') && !this.autoEnabled('android')) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), CHECK_INTERVAL);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async refresh() {
    await Promise.all([
      this.refreshPlatform('ios'),
      this.refreshPlatform('android'),
    ]);
  }

  private async refreshPlatform(platform: MobilePlatform) {
    if (!this.autoEnabled(platform)) return;
    try {
      await this.database.transaction(async (db) => {
        // Poll once per platform even when multiple API containers are running.
        const [{ locked }] = await db.query<Array<{ locked: boolean }>>(
          'SELECT pg_try_advisory_xact_lock(241807, $1) AS locked',
          [platform === 'ios' ? 1 : 2],
        );
        if (!locked) return;
        const [stored] = await db.query<StoredPolicy[]>(
          'SELECT * FROM mobile_version_policies WHERE platform = $1',
          [platform],
        );
        let version: string | null = null;
        try {
          version = await readPublishedVersion(this.config, platform);
        } catch {
          // Store failures must never overwrite the confirmed minimum.
          this.logger.warn(`${platform}: store version could not be verified`);
        }
        const minimum = stored?.minimum_version ?? null;
        const candidate =
          version && (!minimum || compareVersions(version, minimum) > 0)
            ? version
            : null;
        if (!candidate && !stored?.candidate_version) return;

        const now = new Date();
        const firstSeen =
          candidate === stored?.candidate_version
            ? stored?.candidate_since
            : null;
        const promote = Boolean(
          firstSeen &&
          now.getTime() - firstSeen.getTime() >= DISTRIBUTION_GRACE,
        );
        await db.query(
          `INSERT INTO mobile_version_policies
             (platform, minimum_version, candidate_version, candidate_since)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (platform) DO UPDATE
           SET minimum_version = EXCLUDED.minimum_version,
               candidate_version = EXCLUDED.candidate_version,
               candidate_since = EXCLUDED.candidate_since`,
          [
            platform,
            promote ? candidate : minimum,
            promote ? null : candidate,
            candidate && !promote ? (firstSeen ?? now) : null,
          ],
        );
        if (promote)
          this.logger.log(`${platform}: enforced minimum ${candidate}`);
      });
    } catch {
      this.logger.warn(`${platform}: could not persist mobile version policy`);
    }
  }
}
