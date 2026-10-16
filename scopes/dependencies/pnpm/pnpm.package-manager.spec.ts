import { expect } from 'chai';
import type { ResolvedConfig } from '@pnpm/napi';
import { PnpmPackageManager, applyInstallLinkSetting, mergeGraphLockfileIntoExisting } from './pnpm.package-manager';

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
  /** A graph lockfile that adds a resolution to the merge. */
  function resolved<T extends object>(graphLockfile: T) {
    return { ...graphLockfile, packages: { 'foo@1.0.0': { resolution: { integrity: 'sha512-a' } } } };
  }
  /** An existing lockfile that holds resolutions of its own. */
  function existing<T extends object>(existingLockfile: T) {
    return { ...existingLockfile, packages: { 'bar@1.0.0': { resolution: { integrity: 'sha512-b' } } } };
  }
  const settings = { autoInstallPeers: true, dedupePeers: true };

  it('keeps the pnpmfileChecksum both lockfiles were resolved with', () => {
    const merged = mergeGraphLockfileIntoExisting(existing(lockfile('bit-1')), resolved(lockfile('bit-1')));
    expect(merged.pnpmfileChecksum).to.equal('bit-1');
  });

  it('drops a pnpmfileChecksum the lockfiles disagree on', () => {
    expect(
      mergeGraphLockfileIntoExisting(existing(lockfile('bit-1')), resolved(lockfile('bit-2')))
    ).not.to.have.property('pnpmfileChecksum');
    expect(mergeGraphLockfileIntoExisting(existing(lockfile('bit-1')), resolved(lockfile()))).not.to.have.property(
      'pnpmfileChecksum'
    );
  });

  it('keeps the settings both lockfiles were resolved under', () => {
    const merged = mergeGraphLockfileIntoExisting(
      existing({ ...lockfile(), settings }),
      resolved({ ...lockfile(), settings: { ...settings } })
    );
    expect(merged.settings).to.eql(settings);
  });

  it('drops settings the lockfiles disagree on', () => {
    expect(
      mergeGraphLockfileIntoExisting(
        existing({ ...lockfile(), settings }),
        resolved({ ...lockfile(), settings: { ...settings, dedupePeers: false } })
      )
    ).not.to.have.property('settings');
    expect(
      mergeGraphLockfileIntoExisting(existing({ ...lockfile(), settings }), resolved(lockfile()))
    ).not.to.have.property('settings');
  });

  it('keeps the overrides both lockfiles were resolved with, and drops ones they disagree on', () => {
    const overrides = { '@teambit/legacy@*': '-' };
    expect(
      mergeGraphLockfileIntoExisting(
        existing({ ...lockfile(), overrides }),
        resolved({ ...lockfile(), overrides: { ...overrides } })
      ).overrides
    ).to.eql(overrides);
    expect(
      mergeGraphLockfileIntoExisting(existing({ ...lockfile(), overrides }), resolved(lockfile()))
    ).not.to.have.property('overrides');
  });

  it("takes the graph's checksum, settings and overrides when the existing lockfile has no resolutions", () => {
    const overrides = { '@teambit/legacy@*': '-' };
    const merged = mergeGraphLockfileIntoExisting(
      { ...lockfile('hooks-1'), settings: { dedupePeers: false } },
      resolved({ ...lockfile(), settings, overrides })
    );
    expect(merged).not.to.have.property('pnpmfileChecksum');
    expect(merged.settings).to.eql(settings);
    expect(merged.overrides).to.eql(overrides);
  });

  it('keeps the checksum and settings of the existing lockfile when the graph adds no resolutions', () => {
    const merged = mergeGraphLockfileIntoExisting(existing({ ...lockfile('bit-1'), settings }), lockfile());
    expect(merged.pnpmfileChecksum).to.equal('bit-1');
    expect(merged.settings).to.eql(settings);
  });
});

describe('mergeGraphLockfileIntoExisting with workspace components', () => {
  // Workspace components are `file:` directory packages, reached through
  // `file:` refs. The merge must keep them like any other reachable entry.
  it('keeps the file: snapshots the importers and other snapshots reach', () => {
    const merged = mergeGraphLockfileIntoExisting(
      {
        lockfileVersion: '9.0',
        importers: {
          'comps/comp1': {
            dependencies: { '@org/comp2': { version: 'file:comps/comp2(react@18.3.1)', specifier: '2.0.0' } },
          },
        },
        packages: {
          '@org/comp2@file:comps/comp2': { resolution: { directory: 'comps/comp2', type: 'directory' } },
          '@org/comp3@file:comps/comp3': { resolution: { directory: 'comps/comp3', type: 'directory' } },
          'react@18.3.1': { resolution: { integrity: 'sha512-react' } },
          'unused@1.0.0': { resolution: { integrity: 'sha512-unused' } },
        },
        snapshots: {
          '@org/comp2@file:comps/comp2(react@18.3.1)': {
            dependencies: { '@org/comp3': 'file:comps/comp3', react: '18.3.1' },
          },
          '@org/comp3@file:comps/comp3': {},
          'react@18.3.1': {},
          'unused@1.0.0': {},
        },
      } as any,
      { lockfileVersion: '9.0', importers: {} }
    );
    expect(Object.keys(merged.packages!).sort()).to.eql([
      '@org/comp2@file:comps/comp2',
      '@org/comp3@file:comps/comp3',
      'react@18.3.1',
    ]);
    expect(Object.keys(merged.snapshots!).sort()).to.eql([
      '@org/comp2@file:comps/comp2(react@18.3.1)',
      '@org/comp3@file:comps/comp3',
      'react@18.3.1',
    ]);
  });
});

describe('mergeGraphLockfileIntoExisting optional flags', () => {
  it('recomputes the optional flags from the merged importers', () => {
    const merged = mergeGraphLockfileIntoExisting(
      {
        lockfileVersion: '9.0',
        importers: { 'comps/comp1': { dependencies: { nan: { version: '2.29.0', specifier: '2.29.0' } } } },
        packages: { 'nan@2.29.0': { resolution: { integrity: 'sha512-nan' } } },
        snapshots: { 'nan@2.29.0': {} },
      } as any,
      {
        lockfileVersion: '9.0',
        importers: { 'comps/comp2': { optionalDependencies: { nan: { version: '2.29.0', specifier: '2.29.0' } } } },
        packages: { 'nan@2.29.0': { resolution: { integrity: 'sha512-nan' } } },
        // The graph lockfile reaches nan optionally only, and says so.
        snapshots: { 'nan@2.29.0': { optional: true } },
      } as any
    );
    expect(merged.snapshots!['nan@2.29.0']).not.to.have.property('optional');
  });
});

describe('applyInstallLinkSetting', () => {
  it("records the install's value in a lockfile that records settings, so a merge keeps the block", () => {
    const existing = {
      lockfileVersion: '9.0',
      importers: {},
      settings: { autoInstallPeers: true, excludeLinksFromLockfile: false },
    } as any;
    const graph = {
      lockfileVersion: '9.0',
      importers: {},
      settings: { autoInstallPeers: true, excludeLinksFromLockfile: true },
    } as any;
    applyInstallLinkSetting(existing, false);
    applyInstallLinkSetting(graph, false);
    const merged = mergeGraphLockfileIntoExisting(existing, graph);
    expect(merged.settings).to.eql({ autoInstallPeers: true, excludeLinksFromLockfile: false });
  });

  it('leaves a lockfile without settings alone', () => {
    const lockfile = { lockfileVersion: '9.0', importers: {} } as any;
    applyInstallLinkSetting(lockfile, false);
    expect(lockfile).not.to.have.property('settings');
  });
});
