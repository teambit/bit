import { nodeModulesExcludePackages } from './node-modules-exclude-packages';

describe('nodeModulesExcludePackages()', () => {
  it('should return an empty regex when the received array is empty', () => {
    expect(nodeModulesExcludePackages({ packages: [] })).toEqual('node_modules/(?!()/)');
  });
  it('should work with more than one packages', () => {
    const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
    expect(nodeModulesExcludePackages({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(react|.pnpm/registry.npmjs.org/react.*|@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*|testing-library__dom|.pnpm/registry.npmjs.org/testing-library__dom.*|.pnpm/testing-library__dom.*)/)'
    );
  });
  it('should work with one package', () => {
    const packagesToTransform = ['@myorg'];
    expect(nodeModulesExcludePackages({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(@myorg|.pnpm/registry.npmjs.org/@myorg.*)/)'
    );
  });
  it('should have old pnpm structure exlucded', () => {
    expect(nodeModulesExcludePackages({ packages: ['@myorg'] })).toContain('.pnpm/registry.npmjs.org/@myorg.*');
    expect(nodeModulesExcludePackages({ packages: ['@myorg', '@mypackage'] })).toContain(
      '.pnpm/registry.npmjs.org/@myorg.*'
    );
    expect(nodeModulesExcludePackages({ packages: ['@myorg', '@mypackage'] })).toContain(
      '.pnpm/registry.npmjs.org/@mypackage.*'
    );
  });
  it('should have new pnpm structure excluded', () => {
    expect(nodeModulesExcludePackages({ packages: ['@myorg'] }).includes('.pnpm/@myorg.*')).toBeFalsy();
    expect(nodeModulesExcludePackages({ packages: ['react', '@myorg'] })).toContain('.pnpm/@myorg.*');
  });
  it('should have yarn structure excluded', () => {
    expect(nodeModulesExcludePackages({ packages: ['@myorg'] })).toContain('@myorg');
    expect(nodeModulesExcludePackages({ packages: ['mypackage', '@myorg'] })).toContain('mypackage');
    expect(nodeModulesExcludePackages({ packages: ['mypackage', '@myorg'] })).toContain('@myorg');
  });
});
