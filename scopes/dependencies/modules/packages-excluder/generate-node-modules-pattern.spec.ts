import { generateNodeModulesPattern } from './generate-node-modules-pattern';

describe('generateNodeModulesPattern()', () => {
  it('should return an empty regex when the received array is empty', () => {
    expect(generateNodeModulesPattern({ packages: [] })).toEqual('node_modules/(?!()/)');
  });
  it('should work with more than one packages', () => {
    const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
    expect(generateNodeModulesPattern({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(react|.pnpm/registry.npmjs.org/react.*|.pnpm/react.*|@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*|testing-library__dom|.pnpm/registry.npmjs.org/testing-library__dom.*|.pnpm/testing-library__dom.*)/)'
    );
  });
  it('should work with one package', () => {
    const packagesToTransform = ['@myorg'];
    expect(generateNodeModulesPattern({ packages: packagesToTransform })).toEqual(
      'node_modules/(?!(@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*)/)'
    );
  });
  it('should have old pnpm structure exlucded', () => {
    expect(generateNodeModulesPattern({ packages: ['@myorg'] })).toContain('.pnpm/registry.npmjs.org/@myorg.*');
    expect(generateNodeModulesPattern({ packages: ['@myorg', '@mypackage'] })).toContain(
      '.pnpm/registry.npmjs.org/@myorg.*'
    );
    expect(generateNodeModulesPattern({ packages: ['@myorg', '@mypackage'] })).toContain(
      '.pnpm/registry.npmjs.org/@mypackage.*'
    );
  });
  it('should have new pnpm structure excluded', () => {
    expect(generateNodeModulesPattern({ packages: ['@myorg'] })).toContain('.pnpm/@myorg.*');
    expect(generateNodeModulesPattern({ packages: ['react', '@myorg'] })).toContain('.pnpm/@myorg.*');
    expect(generateNodeModulesPattern({ packages: ['react', '@myorg'] })).toContain('.pnpm/react.*');
  });
  it('should have yarn structure excluded', () => {
    expect(generateNodeModulesPattern({ packages: ['@myorg'] })).toContain('@myorg');
    expect(generateNodeModulesPattern({ packages: ['mypackage', '@myorg'] })).toContain('mypackage');
    expect(generateNodeModulesPattern({ packages: ['mypackage', '@myorg'] })).toContain('@myorg');
  });
});
