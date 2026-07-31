import { expect } from 'chai';
import type { ResolvedConfig } from '@pnpm/napi';
import { PnpmPackageManager } from './pnpm.package-manager';

describe('PnpmPackageManager.getNetworkConfig', () => {
  it('uses the Bit user agent when no user agent is configured', async () => {
    const packageManager = createPackageManager({});

    const networkConfig = await packageManager.getNetworkConfig?.();
    expect(networkConfig).to.include({
      userAgent: 'bit user/test-user',
    });
  });

  it('uses the explicitly configured user agent', async () => {
    const packageManager = createPackageManager({
      userAgent: 'custom-user-agent',
    });

    const networkConfig = await packageManager.getNetworkConfig?.();
    expect(networkConfig).to.include({
      userAgent: 'custom-user-agent',
    });
  });
});

function createPackageManager(config: Partial<ResolvedConfig>) {
  const packageManager = new PnpmPackageManager(
    {} as any,
    {} as any,
    {
      getCurrentUser: async () => ({ username: 'test-user' }),
    } as any
  );
  packageManager.readConfig = async () => ({
    config: config as ResolvedConfig,
    warnings: [],
  });
  return packageManager;
}
