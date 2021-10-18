// @ts-ignore
jest.mock('@teambit/legacy/dist/scope/network/http', () => ({
  Http: {
    // @ts-ignore
    getNetworkConfig: jest.fn(),
  },
}));

import { DependencyResolverMain } from './dependency-resolver.main.runtime';
import { Http } from '@teambit/legacy/dist/scope/network/http';

describe('DepenendencyResolverMain.getNetworkConfig()', () => {
  const packageManagerSlot = {
    // @ts-ignore
    get: jest.fn(),
  };
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
  it('should return settings from global config', async () => {
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
});
