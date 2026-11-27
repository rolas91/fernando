import {
  Controller,
  Get,
  Header,
  Param,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MobileVersionPolicyService } from './mobile-version-policy.service';
import { validStoreUrl, VERSION_PATTERN } from './mobile-store-release';

@Controller('mobile/version')
export class MobileVersionController {
  constructor(
    private readonly config: ConfigService,
    private readonly policies: MobileVersionPolicyService,
  ) {}

  @Get(':platform')
  @Header('Cache-Control', 'no-store')
  async getPolicy(@Param('platform') platform: string) {
    if (platform !== 'ios' && platform !== 'android') {
      throw new BadRequestException('Unsupported mobile platform');
    }
    const prefix = `MOBILE_${platform.toUpperCase()}`;
    const minimumVersion = await this.policies.getMinimum(platform);
    if (!minimumVersion) return { minimumVersion: null, storeUrl: null };
    const storeUrl =
      this.config.get<string>(`${prefix}_STORE_URL`)?.trim() ?? '';
    if (
      !VERSION_PATTERN.test(minimumVersion) ||
      !validStoreUrl(platform, storeUrl)
    ) {
      throw new ServiceUnavailableException(
        'Mobile version policy is misconfigured',
      );
    }
    return { minimumVersion, storeUrl };
  }
}
