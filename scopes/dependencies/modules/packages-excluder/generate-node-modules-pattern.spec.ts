import { generateNodeModulesPattern } from './generate-node-modules-pattern';

describe('generateNodeModulesPattern()', () => {
  it('should return an empty regex when the received array is empty', () => {
    expect(generateNodeModulesPattern({ packages: [] })).toEqual('node_modules/(?!()/)');
  });
  it('should work with more than one packages', () => {
    const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
    const pattern = generateNodeModulesPattern({ packages: packagesToTransform });
    const regex = new RegExp(pattern);
    expect(pattern).toEqual(
      'node_modules/(?!(react|.pnpm/registry.npmjs.org/react.*|.pnpm/react.*|@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*|testing-library__dom|.pnpm/registry.npmjs.org/testing-library__dom.*|.pnpm/testing-library__dom.*)/)'
    );
    expect(regex.test('node_modules/react')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/registry.npmjs.org/react')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/react')).toBeTruthy();

    expect(regex.test('node_modules/@myorg')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/registry.npmjs.org/@myorg')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/@myorg')).toBeTruthy();

    expect(regex.test('node_modules/testing-library__dom')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/registry.npmjs.org/testing-library__dom')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/testing-library__dom')).toBeTruthy();
  });
  it('should work with one package', () => {
    const pattern = generateNodeModulesPattern({ packages: ['@myorg'] });
    const regex = new RegExp(pattern);
    expect(pattern).toEqual('node_modules/(?!(@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*)/)');
    expect(regex.test('node_modules/@myorg')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/registry.npmjs.org/@myorg')).toBeTruthy();
    expect(regex.test('node_modules/.pnpm/@myorg')).toBeTruthy();
  });
  it('should have old pnpm structure exlucded', () => {
    const pattern = generateNodeModulesPattern({ packages: ['@myorg'] });
    const regex = new RegExp(pattern);
    expect(pattern).toEqual('node_modules/(?!(@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*)/)');
    expect(regex.test('node_modules/.pnpm/registry.npmjs.org/@myorg')).toBeTruthy();
  });
  it('should have new pnpm structure excluded', () => {
    const pattern = generateNodeModulesPattern({ packages: ['@myorg'] });
    const regex = new RegExp(pattern);
    expect(pattern).toEqual('node_modules/(?!(@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*)/)');
    expect(regex.test('node_modules/.pnpm/@myorg')).toBeTruthy();
  });
  it('should have yarn structure excluded', () => {
    const pattern = generateNodeModulesPattern({ packages: ['@myorg'] });
    const regex = new RegExp(pattern);
    expect(pattern).toEqual('node_modules/(?!(@myorg|.pnpm/registry.npmjs.org/@myorg.*|.pnpm/@myorg.*)/)');
    expect(regex.test('node_modules/@myorg')).toBeTruthy();
  });
});
