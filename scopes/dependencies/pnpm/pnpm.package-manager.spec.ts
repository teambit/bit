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

describe('PnpmPackageManager.install', () => {
  it('rethrows dependency graph conversion errors when strict restoration is requested', async () => {
    const packageManager = createPackageManager({});
    const restoreError = new Error('failed to restore lockfile');
    packageManager.dependenciesGraphToLockfile = async () => {
      throw restoreError;
    };

    let thrown: unknown;
    try {
      await packageManager.install(
        {
          rootDir: '/tmp/workspace',
          manifests: {},
          componentDirectoryMap: {} as any,
        },
        {
          dependenciesGraph: {} as any,
          rootComponents: true,
          failOnDependenciesGraphError: true,
        }
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).to.equal(restoreError);
  });
});

function createPackageManager(config: Partial<ResolvedConfig>) {
  const packageManager = new PnpmPackageManager(
    {
      getRegistries: async () => undefined,
      getProxyConfig: async () => undefined,
      getNetworkConfig: async () => undefined,
    } as any,
    {
      error: () => {},
    } as any,
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
