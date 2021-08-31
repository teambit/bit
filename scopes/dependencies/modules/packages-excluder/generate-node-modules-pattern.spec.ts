import { generateNodeModulesPattern } from './generate-node-modules-pattern';

describe('generateNodeModulesPattern()', () => {
  it('should return an empty regex when the received array is empty', () => {
    expect(generateNodeModulesPattern({ packages: [] })).toEqual('node_modules/(?!()/)');
  });
  describe('should work with one package', () => {
    const pattern = generateNodeModulesPattern({ packages: ['@myorg'] });
    const regex = new RegExp(pattern);

    describe('should exclude the package', () => {
      it('should have yarn structure excluded', () => {
        expect(regex.test('node_modules/@myorg/something')).toBeFalsy();
      });
      it('should have old pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/registry.npmjs.org/@myorg/something')).toBeFalsy();
      });
      it('should have new pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/@myorg/something')).toBeFalsy();
      });
    });
  });
  describe('should work with more than one packages', () => {
    const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
    const pattern = generateNodeModulesPattern({ packages: packagesToTransform });
    const regex = new RegExp(pattern);

    describe('should exclude the first package', () => {
      it('should have yarn structure excluded', () => {
        expect(regex.test('node_modules/react/something')).toBeFalsy();
      });
      it('should have old pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/registry.npmjs.org/react/something')).toBeFalsy();
      });
      it('should have new pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/react/something')).toBeFalsy();
      });
    });
    describe('should exclude the second package', () => {
      it('should have yarn structure excluded', () => {
        expect(regex.test('node_modules/@myorg/something')).toBeFalsy();
      });
      it('should have old pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/registry.npmjs.org/@myorg/something')).toBeFalsy();
      });
      it('should have new pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/@myorg/something')).toBeFalsy();
      });
    });
    describe('should exclude the third package', () => {
      it('should have yarn structure excluded', () => {
        expect(regex.test('node_modules/testing-library__dom/something')).toBeFalsy();
      });
      it('should have old pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/registry.npmjs.org/testing-library__dom/something')).toBeFalsy();
      });
      it('should have new pnpm structure excluded', () => {
        expect(regex.test('node_modules/.pnpm/testing-library__dom/something')).toBeFalsy();
      });
    });
  });
  describe('should not exclude the package when is not in the regex', () => {
    const packagesToTransform = ['react'];
    const pattern = generateNodeModulesPattern({ packages: packagesToTransform });
    const regex = new RegExp(pattern);

    describe('should not exclude', () => {
      it('with yarn structure', () => {
        expect(regex.test('node_modules/not-excluded-package/some-path')).toBeTruthy();
      });
      it('with old pnpm structure', () => {
        expect(regex.test('node_modules/.pnpm/registry.npmjs.org/not-excluded-package/some-path')).toBeTruthy();
      });
      it('with new pnpm structure', () => {
        expect(regex.test('node_modules/.pnpm/not-excluded-package/some-path')).toBeTruthy();
      });
    });
  });
});
