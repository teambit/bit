import { generateNodeModulesPatterns } from './generate-node-modules-patterns';

describe('generateNodeModulesPatterns()', () => {
  it('should return an empty regex when the received array is empty', () => {
    expect(generateNodeModulesPatterns({ packages: [] })).toEqual('node_modules/(?!()/)');
  });
  it('should work with more than one packages', () => {
    const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
    expect(generateNodeModulesPatterns({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(react|.pnpm/registry.npmjs.org/react.*|.pnpm/react.*|@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*|testing-library__dom|.pnpm/registry.npmjs.org/testing-library__dom.*|.pnpm/testing-library__dom.*)/)'
    );
  });
  it('should work with one package', () => {
    const packagesToTransform = ['@myorg'];
    expect(generateNodeModulesPatterns({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*)/)'
    );
  });
  it('should have old pnpm structure exlucded', () => {
    expect(generateNodeModulesPatterns({ packages: ['@myorg'] })).toContain('.pnpm/registry.npmjs.org/@myorg.*');
    expect(generateNodeModulesPatterns({ packages: ['@myorg', '@mypackage'] })).toContain(
      '.pnpm/registry.npmjs.org/@myorg.*'
    );
    expect(generateNodeModulesPatterns({ packages: ['@myorg', '@mypackage'] })).toContain(
      '.pnpm/registry.npmjs.org/@mypackage.*'
    );
  });
  it('should have new pnpm structure excluded', () => {
    expect(generateNodeModulesPatterns({ packages: ['@myorg'] })).toContain('.pnpm/@myorg.*');
    expect(generateNodeModulesPatterns({ packages: ['react', '@myorg'] })).toContain('.pnpm/@myorg.*');
    expect(generateNodeModulesPatterns({ packages: ['react', '@myorg'] })).toContain('.pnpm/react.*');
  });
  it('should have yarn structure excluded', () => {
    expect(generateNodeModulesPatterns({ packages: ['@myorg'] })).toContain('@myorg');
    expect(generateNodeModulesPatterns({ packages: ['mypackage', '@myorg'] })).toContain('mypackage');
    expect(generateNodeModulesPatterns({ packages: ['mypackage', '@myorg'] })).toContain('@myorg');
  });
});
