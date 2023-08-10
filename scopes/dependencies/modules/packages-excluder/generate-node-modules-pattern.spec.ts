import { PatternTarget, generateNodeModulesPattern } from './generate-node-modules-pattern';

describe('generateNodeModulesPattern()', () => {
  describe('default format for JEST', () => {
    describe('should work with empty array', () => {
      it('include any package in the node_modules', () => {
        expect(generateNodeModulesPattern({ packages: [] })).toEqual('node_modules/(?!()/)');
      });
    });
    describe('should work with one package', () => {
      let pattern;
      let regex;
      beforeAll(() => {
        pattern = generateNodeModulesPattern({ packages: ['@myorg'] });
        regex = new RegExp(pattern);
      });

      describe('should exclude the package', () => {
        it('should have yarn structure excluded', () => {
          expect(regex.test('node_modules/@myorg/something')).toBeFalsy();
        });
        it('should have new pnpm structure with + excluded', () => {
          expect(regex.test('node_modules/.pnpm/registry.npmjs.org+@myorg+something/')).toBeFalsy();
        });
        it('should have new pnpm structure excluded', () => {
          expect(regex.test('node_modules/.pnpm/@myorg+something/')).toBeFalsy();
        });
      });
    });
    describe('should work with more than one packages', () => {
      let packagesToTransform;
      let pattern;
      let regex;
      beforeAll(() => {
        packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
        pattern = generateNodeModulesPattern({ packages: packagesToTransform });
        regex = new RegExp(pattern);
      });

      describe('should exclude the first package', () => {
        it('should have yarn structure excluded', () => {
          expect(regex.test('node_modules/react/something')).toBeFalsy();
        });
        it('should have new pnpm structure with + excluded', () => {
          expect(regex.test('node_modules/.pnpm/registry.npmjs.org+react/something')).toBeFalsy();
        });
        it('should have new pnpm structure excluded', () => {
          expect(regex.test('node_modules/.pnpm/react/something')).toBeFalsy();
        });
      });
      describe('should exclude the second package', () => {
        it('should have yarn structure excluded', () => {
          expect(regex.test('node_modules/@myorg/something')).toBeFalsy();
        });
        it('should have new pnpm structure with + excluded', () => {
          expect(regex.test('node_modules/.pnpm/registry.npmjs.org+@myorg+something/')).toBeFalsy();
        });
        it('should have new pnpm structure excluded', () => {
          expect(regex.test('node_modules/.pnpm/@myorg+something/')).toBeFalsy();
        });
      });
      describe('should exclude the third package', () => {
        it('should have yarn structure excluded', () => {
          expect(regex.test('node_modules/testing-library__dom/something')).toBeFalsy();
        });
        it('should have new pnpm structure with + excluded', () => {
          expect(regex.test('node_modules/.pnpm/registry.npmjs.org+testing-library__dom/something')).toBeFalsy();
        });
        it('should have new pnpm structure excluded', () => {
          expect(regex.test('node_modules/.pnpm/testing-library__dom/something')).toBeFalsy();
        });
      });
    });
    describe('should not exclude the package when is not in the regex', () => {
      let packagesToTransform;
      let pattern;
      let regex;
      beforeAll(() => {
        packagesToTransform = ['react'];
        pattern = generateNodeModulesPattern({ packages: packagesToTransform });
        regex = new RegExp(pattern);
      });

      describe('should not exclude', () => {
        it('with yarn structure', () => {
          expect(regex.test('node_modules/not-excluded-package/some-path')).toBeTruthy();
        });
        it('with old pnpm structure', () => {
          expect(regex.test('node_modules/.pnpm/registry.npmjs.org/not-excluded-package/some-path')).toBeTruthy();
        });
        it("with new pnpm structure with '+'", () => {
          expect(regex.test('node_modules/.pnpm/registry.npmjs.org+not-excluded-package/some-path')).toBeTruthy();
        });
        it('with old pnpm structure, different registry name', () => {
          expect(
            regex.test('node_modules/.pnpm/registry.artifactory.something/not-excluded-package/some-path')
          ).toBeTruthy();
        });
        it("with new pnpm structure with '+'", () => {
          expect(
            regex.test('node_modules/.pnpm/registry.artifactory.something+not-excluded-package/some-path')
          ).toBeTruthy();
        });
        it('with new pnpm structure', () => {
          expect(regex.test('node_modules/.pnpm/not-excluded-package/some-path')).toBeTruthy();
        });
      });
    });
    describe('should exclude components', () => {
      let pattern;
      let regex;
      beforeAll(() => {
        pattern = generateNodeModulesPattern({ excludeComponents: true });
        regex = new RegExp(pattern);
      });
      const fixtures = [
        [true, 'not-a-component'],
        [true, '@myorg/not-a-component'],
        [true, 'scope.comp-name'],
        [false, '@myorg/scope.comp-name'],
        [false, '@myorg/scope.namespace.comp-name'],
        [false, '@myorg/scope.ns1.ns2.comp-name'],
      ];
      // @ts-ignore
      it.each(fixtures)(`should return %s for %s in yarn node_modules`, (expectedResult: boolean, pkgName: string) => {
        expect(regex.test(`node_modules/${pkgName}/`)).toEqual(expectedResult);
      });
      // @ts-ignore
      it.each(fixtures)(`should return %s for %s in pnpm node_modules`, (expectedResult: boolean, pkgName: string) => {
        expect(regex.test(`node_modules/.pnpm/${pkgName.replace(/\//g, '+')}/`)).toEqual(expectedResult);
        expect(regex.test(`node_modules/.pnpm/registry.npmjs.org+${pkgName.replace(/\//g, '+')}/`)).toEqual(
          expectedResult
        );
      });
    });
    describe('should exclude components and listed packages', () => {
      let pattern;
      let regex;
      beforeAll(() => {
        pattern = generateNodeModulesPattern({ packages: ['@myorg'], excludeComponents: true });
        regex = new RegExp(pattern);
      });
      it('should have yarn structure excluded', () => {
        expect(regex.test('node_modules/@myorg/something')).toBeFalsy();
      });
    });
    describe('should work with packages under the .pnpm directory', () => {
      let pattern;
      let regex;
      beforeAll(() => {
        pattern = generateNodeModulesPattern({ packages: ['@shohamgilad'], excludeComponents: false });
        regex = new RegExp(pattern);
      });
      it('should exclude package under the .pnpm directory', () => {
        expect(
          regex.test(
            'node_modules/.pnpm/file+shohamgilad.test-new-env_ui_button@0.0.27_react@18.2.0/node_modules/@shohamgilad/test-new-env.ui.button/dist/index.js'
          )
        ).toBeFalsy();
      });
    });
    describe('should work with components under the .pnpm directory', () => {
      let pattern;
      let regex;
      beforeAll(() => {
        pattern = generateNodeModulesPattern({ excludeComponents: true });
        regex = new RegExp(pattern);
      });
      it('should exclude package under the .pnpm directory', () => {
        expect(
          regex.test(
            'node_modules/.pnpm/file+shohamgilad.test-new-env_ui_button@0.0.27_react@18.2.0/node_modules/@shohamgilad/test-new-env.ui.button/dist/index.js'
          )
        ).toBeFalsy();
      });
    });
  });
  describe('format for webpack', () => {
    describe('when packages provided is an empty array', () => {
      it('should return an empty array', () => {
        expect(generateNodeModulesPattern({ packages: [], target: PatternTarget.WEBPACK })).toEqual([]);
      });
    });
    describe('when packages contains a single package', () => {
      let patterns;
      beforeAll(() => {
        patterns = generateNodeModulesPattern({
          packages: ['@my-org/my-scope.components'],
          target: PatternTarget.WEBPACK,
        });
      });

      it('should return an array with 2 patterns', () => {
        expect((patterns || []).length).toEqual(2);
        expect(patterns).toEqual([
          '^(.+?[\\/]node_modules[\\/](?!(@my-org[\\/]my-scope.components))(@.+?[\\/])?.+?)[\\/]',
          '^(.+?[\\/]node_modules[\\/](?!(\\.pnpm[\\/](.*[+\\/])?@my-org\\+my-scope.components.*))(@.+?[\\/])?.+?)[\\/]',
        ]);
      });
    });

    describe('when packages are provided', () => {
      let patterns;
      let regexps;
      beforeAll(() => {
        patterns = generateNodeModulesPattern({
          packages: ['@my-org/my-scope.components', '@other-org/my-scope.my-app'],
          target: PatternTarget.WEBPACK,
        });
        regexps = [...patterns.map((pattern) => new RegExp(pattern))];
      });

      it('should exclude the packages from node modules', () => {
        expect(
          regexps.every((regexp) => regexp.test('node_modules/@my-org/my-scope.components/package.json'))
        ).toBeFalsy();
        expect(
          regexps.every((regexp) => regexp.test('node_modules/@my-org/my-scope.components/dist/index.ts'))
        ).toBeFalsy();
      });

      it('should exclude the packages from pnpm folder', () => {
        expect(regexps.every((regexp) => regexp.test('node_modules/.pnpm/@my-org+my-scope.components'))).toBeFalsy();
        expect(
          regexps.every((regexp) => regexp.test('node_modules/.pnpm/@my-org+my-scope.components/dist/index.ts'))
        ).toBeFalsy();
      });

      it('should exclude the packages from absolute paths', () => {
        expect(
          regexps.every((regexp) =>
            regexp.test('/Users/aUser/dev/bit-example/node_modules/@my-org/my-scope.components/package.json')
          )
        ).toBeFalsy();
        expect(
          regexps.every((regexp) =>
            regexp.test('/Users/aUser/dev/bit-example/node_modules/.pnpm/@my-org+my-scope.components/package.json')
          )
        ).toBeFalsy();
      });

      it('should not exclude other packages', () => {
        expect(
          regexps.some((regexp) =>
            regexp.test('/Users/aUser/dev/bit-example/node_modules/@my-org/my-scope.apps/package.json')
          )
        ).toBeTruthy();
        expect(
          regexps.some((regexp) => regexp.test('/Users/aUser/dev/bit-example/node_modules/@lodash/package.json'))
        ).toBeTruthy();
        expect(
          regexps.some((regexp) => regexp.test('/Users/aUser/dev/bit-example/node_modules/@react/package.json'))
        ).toBeTruthy();
      });
    });
  });
});
