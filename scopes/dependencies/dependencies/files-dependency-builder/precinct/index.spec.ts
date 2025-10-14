import type { DependencyDetector } from '@teambit/dependency-resolver';

const assert = require('assert');
const path = require('path');
const rewire = require('rewire');
const sinon = require('sinon');

const fixtures = '../fixtures/precinct';
const fixturesFullPath = path.resolve(__dirname, fixtures);

const precinctNonWired = rewire('./');
const precinct = precinctNonWired.default;

describe('node-precinct', () => {
  describe('paperwork', () => {
    // todo: currently it doesn't work because we set it with bit-no-check
    it.skip('returns the dependencies for the given filepath', async () => {
      assert.ok(Object.keys(await precinct.paperwork(`${fixturesFullPath}/es6.js`)).length);
      assert.ok(Object.keys(await precinct.paperwork(`${fixturesFullPath}/styles.scss`)).length);
      // todo: uncomment the next line and typescript.ts file once we have a way to ignore some component files from compiling/parsing altogether
      // assert.ok(Object.keys(await precinct.paperwork(`${fixturesFullPath}/typescript.ts`)).length);
      assert.ok(Object.keys(await precinct.paperwork(`${fixturesFullPath}/styles.css`)).length);
    });

    it('throws if the file cannot be found', async () => {
      await assert.rejects(async () => {
        await precinct.paperwork('foo');
      });
    });

    it('filters out core modules if options.includeCore is false', async () => {
      const deps = await precinct.paperwork(`${fixturesFullPath}/coreModules.js`, {
        includeCore: false,
      });

      assert(!deps.length);
    });

    // todo: currently it doesn't work because we set it with bit-no-check
    it.skip('does not filter out core modules by default', async () => {
      const deps = await precinct.paperwork(`${fixturesFullPath}/coreModules.js`);
      assert(Object.keys(deps).length);
    });

    // todo: currently it doesn't work because we set it with bit-no-check
    it.skip('supports passing detective configuration', async () => {
      const config = {
        amd: {
          skipLazyLoaded: true,
        },
      };

      const deps = await precinct.paperwork(`${fixturesFullPath}/amd.js`, {
        includeCore: false,
        amd: config.amd,
      });
      assert.deepEqual(deps, ['./a', './b']);
    });

    it('supports passing env detectors', async () => {
      const detector: DependencyDetector = {
        detect: (fileContent: string) => {
          return fileContent.indexOf('foo') === -1 ? [] : ['foo'];
        },
        isSupported: ({ ext }) => {
          return ext === '.foo';
        },
        type: 'foo',
      };
      const result = await precinct.paperwork(`${fixturesFullPath}/foo.foo`, {
        envDetectors: [detector],
      });
      assert.deepEqual(result, []);

      const result2 = await precinct.paperwork(`${fixturesFullPath}/bar.foo`, {
        envDetectors: [detector],
      });
      assert.deepEqual(result2, ['foo']);
    });

    describe('when given detective configuration', () => {
      // This test case doesn't fit the current implementation of precinct.
      it.skip('still does not filter out core module by default', async () => {
        const stub = sinon.stub().returns([]);
        const revert = precinctNonWired.__set__('precinct', stub);

        await precinct.paperwork(`${fixturesFullPath}/amd.js`, {
          amd: {
            skipLazyLoaded: true,
          },
        });

        assert.equal(stub.args[0][1].includeCore, true);
        revert();
      });
    });

    it('supports .astro files', async () => {
      const deps = await precinct.paperwork(`${fixturesFullPath}/astro.astro`);
      assert.deepEqual(deps, ['./Default.astro', './Named.astro', './ReExported.astro']);
    });
  });
});
