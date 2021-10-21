// @ts-ignore
jest.mock('@teambit/legacy/dist/scope/network/http', () => ({
  Http: {
    // @ts-ignore
    getNetworkConfig: jest.fn(),
  },
}));

/* eslint-disable import/first */
import { Http } from '@teambit/legacy/dist/scope/network/http';
import { DependencyResolverMain } from './dependency-resolver.main.runtime';

describe('DepenendencyResolverMain.getNetworkConfig()', () => {
  const packageManagerSlot = {
    // @ts-ignore
    get: jest.fn(),
  };
  it('should return settings from global config', async () => {
    const depResolver = new DependencyResolverMain(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      packageManagerSlot as any,
      {} as any,
      {} as any,
      {} as any
    );
    packageManagerSlot.get.mockReturnValue({});
    const globalConfig = {
      fetchTimeout: 1,
      fetchRetries: 2,
      fetchRetryFactor: 3,
      fetchRetryMintimeout: 4,
      fetchRetryMaxtimeout: 5,
      networkConcurrency: 6,
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
      {} as any,
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
    } as any;
    packageManagerSlot.get.mockReturnValue({});
    // @ts-ignore
    Http.getNetworkConfig.mockReturnValue(Promise.resolve({}));
    const depResolver = new DependencyResolverMain(
      config,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
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
      {} as any,
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
    });
  });
});
