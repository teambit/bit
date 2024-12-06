// @ts-ignore
jest.mock('@teambit/legacy/dist/scope/network/http', () => ({
  Http: {
    // @ts-ignore
    getNetworkConfig: jest.fn(),
    // @ts-ignore
    getProxyConfig: jest.fn(),
  },
}));

/* eslint-disable import/first */
import { ComponentID } from '@teambit/component';
import path from 'path';
import { Http } from '@teambit/scope.network';
import { DependencyResolverMain } from './dependency-resolver.main.runtime';

const logger = {
  debug: () => {},
};

describe('DepenendencyResolverMain.getNetworkConfig()', () => {
  const packageManagerSlot = {
    // @ts-ignore
    get: jest.fn(() => ({
      getNetworkConfig: () => ({}),
    })),
  };
  it('should return settings from global config', async () => {
    const depResolver = new DependencyResolverMain(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      logger as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      packageManagerSlot as any,
      {} as any,
      {} as any,
      {} as any
    );
    const globalConfig = {
      fetchTimeout: 1,
      fetchRetries: 2,
      fetchRetryFactor: 3,
      fetchRetryMintimeout: 4,
      fetchRetryMaxtimeout: 5,
      networkConcurrency: 6,
      maxSockets: 7,
    };
    // @ts-ignore
    Http.getNetworkConfig.mockReturnValue(Promise.resolve(globalConfig));
    expect(await depResolver.getNetworkConfig()).toEqual(globalConfig);
  });
  it('should return settings from package manager config', async () => {
    const depResolver = new DependencyResolverMain(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      logger as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      packageManagerSlot as any,
      {} as any,
      {} as any,
      {} as any
    );
    const pmConfig = {
      fetchTimeout: 11,
      fetchRetries: 22,
      fetchRetryFactor: 33,
      fetchRetryMintimeout: 44,
      fetchRetryMaxtimeout: 55,
      networkConcurrency: 66,
      maxSockets: 77,
    };
    packageManagerSlot.get.mockReturnValue({
      getNetworkConfig: () => pmConfig,
    });
    // @ts-ignore
    Http.getNetworkConfig.mockReturnValue(Promise.resolve({}));
    expect(await depResolver.getNetworkConfig()).toEqual(pmConfig);
  });
  it('should return settings from aspect config', async () => {
    const config = {
      fetchTimeout: 111,
      fetchRetries: 222,
      fetchRetryFactor: 333,
      fetchRetryMintimeout: 444,
      fetchRetryMaxtimeout: 555,
      networkConcurrency: 666,
      maxSockets: 777,
    } as any;
    // @ts-ignore
    Http.getNetworkConfig.mockReturnValue(Promise.resolve({}));
    const depResolver = new DependencyResolverMain(
      config,
      {} as any,
      {} as any,
      {} as any,
      logger as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      packageManagerSlot as any,
      {} as any,
      {} as any,
      {} as any
    );
    expect(await depResolver.getNetworkConfig()).toEqual(config);
  });
  it('should merge settings from global config, package manager config, and aspect config', async () => {
    const globalConfig = {
      fetchTimeout: 1,
      fetchRetries: 2,
    };
    const pmConfig = {
      fetchRetryFactor: 33,
      fetchRetryMintimeout: 44,
    };
    const config = {
      fetchRetryMaxtimeout: 555,
      networkConcurrency: 666,
      maxSockets: 777,
    } as any;
    // @ts-ignore
    Http.getNetworkConfig.mockReturnValue(Promise.resolve(globalConfig));
    packageManagerSlot.get.mockReturnValue({
      getNetworkConfig: () => pmConfig,
    });
    const depResolver = new DependencyResolverMain(
      config,
      {} as any,
      {} as any,
      {} as any,
      logger as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      packageManagerSlot as any,
      {} as any,
      {} as any,
      {} as any
    );
    expect(await depResolver.getNetworkConfig()).toEqual({
      fetchTimeout: 1,
      fetchRetries: 2,
      fetchRetryFactor: 33,
      fetchRetryMintimeout: 44,
      fetchRetryMaxtimeout: 555,
      networkConcurrency: 666,
      maxSockets: 777,
    });
  });
  it('should read cafile when it is returned by the global config', async () => {
    const depResolver = new DependencyResolverMain(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { debug: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      packageManagerSlot as any,
      {} as any,
      {} as any,
      {} as any
    );
    // @ts-ignore
    Http.getNetworkConfig.mockReturnValue(
      Promise.resolve({
        cafile: path.join(__dirname, 'fixtures/cafile.txt'),
      })
    );
    // @ts-ignore
    expect((await depResolver.getNetworkConfig()).ca).toStrictEqual([
      `-----BEGIN CERTIFICATE-----
XXXX
-----END CERTIFICATE-----`,
    ]);
  });
});

describe('DepenendencyResolverMain.getOutdatedPkgsFromPolicies()', () => {
  function createDependencyResolverMain(
    resolveRemoteVersion: (spec: string) => { version: string | undefined },
    policy: any
  ) {
    const packageManagerSlot = {
      // @ts-ignore
      get: () => ({
        resolveRemoteVersion,
        getNetworkConfig: () => ({}),
      }),
    };
    return new DependencyResolverMain(
      { policy } as any,
      {} as any,
      {} as any,
      {} as any,
      {
        // @ts-ignore
        debug: jest.fn(),
        // @ts-ignore
        setStatusLine: jest.fn(),
        // @ts-ignore
        consoleSuccess: jest.fn(),
      } as any,
      {} as any,
      {} as any,
      {
        getSync: () => false,
      } as any,
      {} as any,
      packageManagerSlot as any,
      {} as any,
      {} as any,
      {} as any
    );
  }
  describe('without options', () => {
    function resolveRemoteVersion(spec: string): { version: string | undefined } {
      if (spec === 'cannot-resolve@latest') throw new Error('Cannot resolve latest');
      return {
        version: {
          'root-runtime-dep1@latest': '2.0.0',
          'root-peer-dep1@latest': '2.0.0',
          'variant1-runtime-dep1@latest': '2.0.0',
          'variant1-runtime-dep3@latest': '2.0.0',
          'variant1-dev-dep1@latest': '2.0.0',
          'variant1-dev-dep3@latest': '2.0.0',
          'variant1-peer-dep1@latest': '2.0.0',
          'variant1-peer-dep3@latest': '2.0.0',
          'component1-runtime-dep1@latest': '2.0.0',
          'component1-runtime-dep3@latest': '2.0.0',
          'component1-dev-dep1@latest': '2.0.0',
          'component1-dev-dep3@latest': '2.0.0',
          'component1-peer-dep1@latest': '2.0.0',
          'component1-peer-dep3@latest': '2.0.0',
          'pkg-with-old-latest@latest': '0.0.0',
        }[spec],
      };
    }
    const policy = {
      dependencies: {
        'root-runtime-dep1': '1.0.0',
        'root-runtime-dep2': '1.0.0',
      },
      peerDependencies: {
        'root-peer-dep1': '1.0.0',
        'root-peer-dep2': '1.0.0',
      },
    };
    const depResolver = createDependencyResolverMain(resolveRemoteVersion, policy);
    it('should return outdated dependencies', async () => {
      const outdatedPkgs = await depResolver.getOutdatedPkgsFromPolicies({
        rootDir: '',
        variantPoliciesByPatterns: {
          '{variant1/*}': {
            dependencies: {
              'variant1-runtime-dep1': '1.0.0',
              'variant1-runtime-dep2': '1.0.0',
              'variant1-runtime-dep3': '-',
            },
            devDependencies: {
              'variant1-dev-dep1': '1.0.0',
              'variant1-dev-dep2': '1.0.0',
              'variant1-dev-dep3': '-',
            },
            peerDependencies: {
              'variant1-peer-dep1': '1.0.0',
              'variant1-peer-dep2': '1.0.0',
              'variant1-peer-dep3': '-',
            },
          },
        },
        componentPolicies: [
          {
            componentId: ComponentID.fromString('scope/component1'),
            policy: {
              dependencies: {
                'pkg-with-old-latest': '1.0.0',
                'cannot-resolve': '1.0.0',
                'component1-runtime-dep1': '1.0.0',
                'component1-runtime-dep2': '1.0.0',
                'component1-runtime-dep3': '-',
              },
              devDependencies: {
                'component1-dev-dep1': '1.0.0',
                'component1-dev-dep2': '1.0.0',
                'component1-dev-dep3': '-',
              },
              peerDependencies: {
                'component1-peer-dep1': '1.0.0',
                'component1-peer-dep2': '1.0.0',
                'component1-peer-dep3': '-',
              },
            },
          },
        ],
        components: [],
      });
      // @ts-ignore
      expect(outdatedPkgs).toStrictEqual([
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'root-runtime-dep1',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'dependencies',
        },
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'root-peer-dep1',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'peerDependencies',
        },
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'variant1-runtime-dep1',
          source: 'variants',
          variantPattern: '{variant1/*}',
          targetField: 'dependencies',
        },
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'variant1-dev-dep1',
          source: 'variants',
          variantPattern: '{variant1/*}',
          targetField: 'devDependencies',
        },
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'variant1-peer-dep1',
          source: 'variants',
          variantPattern: '{variant1/*}',
          targetField: 'peerDependencies',
        },
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'component1-runtime-dep1',
          source: 'component',
          componentId: ComponentID.fromString('scope/component1'),
          targetField: 'dependencies',
        },
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'component1-dev-dep1',
          source: 'component',
          componentId: ComponentID.fromString('scope/component1'),
          targetField: 'devDependencies',
        },
        {
          currentRange: '1.0.0',
          latestRange: '2.0.0',
          name: 'component1-peer-dep1',
          source: 'component',
          componentId: ComponentID.fromString('scope/component1'),
          targetField: 'peerDependencies',
        },
      ]);
    });
  });
  describe('forced version bump', () => {
    function resolveRemoteVersion(spec: string): { version: string | undefined } {
      return {
        version: {
          'dep1@>=0.0.1 <0.1.0': '0.0.2',
          'dep1@>=0.0.1 <1.0.0': '0.0.2',
          'dep1@latest': '0.0.2',

          'dep2@>=0.1.0 <0.2.0': '0.1.0',
          'dep2@>=0.1.0 <1.0.0': '0.2.0',
          'dep2@latest': '0.2.0',

          'dep3@>=1.0.0 <1.1.0': '1.0.0',
          'dep3@>=1.0.0 <2.0.0': '1.0.0',
          'dep3@latest': '2.0.0',
        }[spec],
      };
    }
    const policy = {
      dependencies: {
        dep1: '0.0.1',
        dep2: '^0.1.0',
        dep3: '^1.0.0',
      },
    };
    const depResolver = createDependencyResolverMain(resolveRemoteVersion, policy);
    it('should return outdated dependencies when forcedVersionBump is set to patch', async () => {
      const outdatedPkgs = await depResolver.getOutdatedPkgsFromPolicies({
        rootDir: '',
        variantPoliciesByPatterns: {},
        componentPolicies: [],
        components: [],
        forceVersionBump: 'patch',
      });
      // @ts-ignore
      expect(outdatedPkgs).toStrictEqual([
        {
          currentRange: '0.0.1',
          latestRange: '0.0.2',
          name: 'dep1',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'dependencies',
        },
      ]);
    });
    it('should return outdated dependencies when forcedVersionBump is set to minor', async () => {
      const outdatedPkgs = await depResolver.getOutdatedPkgsFromPolicies({
        rootDir: '',
        variantPoliciesByPatterns: {},
        componentPolicies: [],
        components: [],
        forceVersionBump: 'minor',
      });
      // @ts-ignore
      expect(outdatedPkgs).toStrictEqual([
        {
          currentRange: '0.0.1',
          latestRange: '0.0.2',
          name: 'dep1',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'dependencies',
        },
        {
          currentRange: '^0.1.0',
          latestRange: '^0.2.0',
          name: 'dep2',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'dependencies',
        },
      ]);
    });
    it('should return outdated dependencies when forcedVersionBump is set to major', async () => {
      const outdatedPkgs = await depResolver.getOutdatedPkgsFromPolicies({
        rootDir: '',
        variantPoliciesByPatterns: {},
        componentPolicies: [],
        components: [],
        forceVersionBump: 'major',
      });
      // @ts-ignore
      expect(outdatedPkgs).toStrictEqual([
        {
          currentRange: '0.0.1',
          latestRange: '0.0.2',
          name: 'dep1',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'dependencies',
        },
        {
          currentRange: '^0.1.0',
          latestRange: '^0.2.0',
          name: 'dep2',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'dependencies',
        },
        {
          currentRange: '^1.0.0',
          latestRange: '^2.0.0',
          name: 'dep3',
          source: 'rootPolicy',
          variantPattern: null,
          targetField: 'dependencies',
        },
      ]);
    });
  });
});

describe('DepenendencyResolverMain.getComponentEnvPolicyFromEnv()', () => {
  it('should throw an error if the env policy has a peer with an empty string set for the supportedRange', async () => {
    const depResolver = new DependencyResolverMain(
      {} as any,
      {} as any,
      {} as any,
      {
        isCoreEnv: () => false,
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
    await expect(
      depResolver.getComponentEnvPolicyFromEnv(
        {
          getDependencies: () => ({
            peers: [
              {
                name: '@teambit/community.ui.bit-cli.commands-provider',
                supportedRange: '',
                version: '',
              },
            ],
          }),
        },
        { envId: 'teambit.test/test' }
      ) // @ts-ignore
    ).rejects.toThrowError('Peer "@teambit/community.ui.bit-cli.commands-provider" has an empty supportedRange');
  });
});
