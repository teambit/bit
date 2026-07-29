import { expect } from 'chai';
import type { Config } from '@pnpm/config.reader';
import { PnpmPackageManager } from './pnpm.package-manager';

describe('PnpmPackageManager.getNetworkConfig', () => {
  it('uses the Bit user agent when rawConfig is unavailable', async () => {
    const packageManager = createPackageManager({
      userAgent: 'pnpm/1.0.0',
      explicitlySetKeys: new Set(),
    });

    expect(await packageManager.getNetworkConfig()).to.include({
      userAgent: 'bit user/test-user',
    });
  });

  it('uses an explicitly configured user agent', async () => {
    const packageManager = createPackageManager({
      userAgent: 'custom-user-agent',
      explicitlySetKeys: new Set(['user-agent']),
    });

    expect(await packageManager.getNetworkConfig()).to.include({
      userAgent: 'custom-user-agent',
    });
  });

  it('supports the legacy rawConfig shape', async () => {
    const packageManager = createPackageManager({
      rawConfig: { 'user-agent': 'legacy-user-agent' },
    });

    expect(await packageManager.getNetworkConfig()).to.include({
      userAgent: 'legacy-user-agent',
    });
  });
});

function createPackageManager(config: Partial<Config> & { rawConfig?: Record<string, unknown> }) {
  const packageManager = new PnpmPackageManager(
    {} as any,
    {} as any,
    {
      getCurrentUser: async () => ({ username: 'test-user' }),
    } as any
  );
  packageManager.readConfig = async () => ({
    config: config as Config,
    warnings: [],
  });
  return packageManager;
}
