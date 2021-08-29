import { nodeModulesExcludePackages } from './node-modules-exclude-packages';

describe('nodeModulesExcludePackages()', () => {
  it('should return an empty regex when the received array is empty', () => {
    expect(nodeModulesExcludePackages({ packages: [] })).toEqual('node_modules/(?!()/)');
  });
  it('should return a regex when the received array is not empty', () => {
    const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
    expect(nodeModulesExcludePackages({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(react|.pnpm/registry.npmjs.org/react.*|@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*|testing-library__dom|.pnpm/registry.npmjs.org/testing-library__dom.*|.pnpm/testing-library__dom.*)/)'
    );
  });
});
