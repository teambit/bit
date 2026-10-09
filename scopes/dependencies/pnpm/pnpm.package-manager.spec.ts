import { expect } from 'chai';
import type { ResolvedConfig } from '@pnpm/napi';
import { PnpmPackageManager, mergeGraphLockfileIntoExisting } from './pnpm.package-manager';

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
      profile: () => {},
      profileAsync: async (_id: string, fn: () => Promise<unknown>) => fn(),
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

describe('mergeGraphLockfileIntoExisting', () => {
  function lockfile(pnpmfileChecksum?: string) {
    return { lockfileVersion: '9.0', importers: {}, ...(pnpmfileChecksum ? { pnpmfileChecksum } : {}) };
  }

  it('keeps the pnpmfileChecksum both lockfiles were resolved with', () => {
    const merged = mergeGraphLockfileIntoExisting(lockfile('bit-1'), lockfile('bit-1'));
    expect(merged.pnpmfileChecksum).to.equal('bit-1');
  });

  it('drops a pnpmfileChecksum the lockfiles disagree on', () => {
    expect(mergeGraphLockfileIntoExisting(lockfile('bit-1'), lockfile('bit-2'))).not.to.have.property(
      'pnpmfileChecksum'
    );
    expect(mergeGraphLockfileIntoExisting(lockfile('bit-1'), lockfile())).not.to.have.property('pnpmfileChecksum');
  });

  it('keeps the settings both lockfiles were resolved under', () => {
    const settings = { autoInstallPeers: true, dedupePeers: true };
    const merged = mergeGraphLockfileIntoExisting(
      { ...lockfile(), settings },
      { ...lockfile(), settings: { ...settings } }
    );
    expect(merged.settings).to.eql(settings);
  });

  it('drops settings the lockfiles disagree on', () => {
    const settings = { autoInstallPeers: true, dedupePeers: true };
    expect(
      mergeGraphLockfileIntoExisting(
        { ...lockfile(), settings },
        { ...lockfile(), settings: { ...settings, dedupePeers: false } }
      )
    ).not.to.have.property('settings');
    expect(mergeGraphLockfileIntoExisting({ ...lockfile(), settings }, lockfile())).not.to.have.property('settings');
  });
});
