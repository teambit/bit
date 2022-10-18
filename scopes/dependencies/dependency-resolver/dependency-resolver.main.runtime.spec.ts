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
import path from 'path';
import { Http } from '@teambit/legacy/dist/scope/network/http';
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
  const packageManagerSlot = {
    // @ts-ignore
    get: () => ({
      resolveRemoteVersion: (spec: string) => ({
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
        }[spec],
      }),
      getNetworkConfig: () => ({}),
    }),
  };
  const depResolver = new DependencyResolverMain(
    {
      policy: {
        dependencies: {
          'root-runtime-dep1': '1.0.0',
          'root-runtime-dep2': '1.0.0',
        },
        peerDependencies: {
          'root-peer-dep1': '1.0.0',
          'root-peer-dep2': '1.0.0',
        },
      },
    } as any,
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
      componentPoliciesById: {
        component1: {
          dependencies: {
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
        componentId: 'component1',
        targetField: 'dependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'component1-dev-dep1',
        source: 'component',
        componentId: 'component1',
        targetField: 'devDependencies',
      },
      {
        currentRange: '1.0.0',
        latestRange: '2.0.0',
        name: 'component1-peer-dep1',
        source: 'component',
        componentId: 'component1',
        targetField: 'peerDependencies',
      },
    ]);
  });
});
