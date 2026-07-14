import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

/**
 * Guards against the "exports.types points to source" regression in a *published* bit release.
 *
 * When a bit-core package (e.g. @teambit/application) is published with
 *   "exports": { ".": { "types": "./index.ts" } }
 * any consumer whose env type-checks it resolves bit's *source* (index.ts) instead of
 * dist/index.d.ts, so the build type-checks bit's own sources and fails with dual-identity and
 * version-skew errors (e.g. "has no exported member 'typeStr'"). This shipped in bit 2.0.10 and
 * broke clients; 2.0.11 fixed it (dist-pointing exports). Minimally reproduced by importing
 * @teambit/application into a component and running the TypescriptCompile task:
 *   2.0.10 -> TypescriptCompile fails    2.0.11 -> TypescriptCompile succeeds.
 *
 * RELEASED-BINARY ONLY: this builds a component that imports a bit-core aspect and resolves it from
 * the *installed* bit. Local dev binaries intentionally link bit-core packages to their source
 * (exports.types -> ./index.ts), so this build always fails locally for the same class of reason.
 * It is therefore gated to run only against a released binary: the `e2e_test_bbit` CI job sets
 * E2E_RELEASED_BINARY. Run it manually with:
 *   E2E_RELEASED_BINARY=1 npm run e2e-test --bit_bin=bbit
 */
const runAgainstReleasedBinary = !!process.env.E2E_RELEASED_BINARY;

// A bit-core aspect that carried the regression in 2.0.10; importing it forces its types to resolve.
const CORE_ASPECT_PKG = '@teambit/application';
// Any TS env that honors package `exports` reproduces it; react-env is the version verified against
// bbit 2.0.10 (fails) and 2.0.11 (passes).
const ENV = 'bitdev.react/react-env@6.0.20';

(runAgainstReleasedBinary ? describe : describe.skip)(
  'released binary: bit-core aspects type-check from dist, not source',
  function () {
    this.timeout(0);
    let helper: Helper;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      // Mirror a client workspace: resolve core aspects from the installed bit.
      helper.workspaceJsonc.addKeyValToWorkspace('resolveAspectsFromNodeModules', true);
      helper.workspaceJsonc.addKeyValToWorkspace('resolveEnvsFromRoots', true);
      helper.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.fs.outputFile(
        'comp1/index.ts',
        `import { ApplicationAspect } from '${CORE_ASPECT_PKG}';\n\n` +
          `export function comp1(): string {\n  return ApplicationAspect.id;\n}\n`
      );
      helper.command.addComponent('comp1');
      helper.command.setEnv('comp1', ENV);
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it(`bit build (TypescriptCompile) should not fail from type-checking ${CORE_ASPECT_PKG}`, () => {
      // On a binary that ships source-pointing exports, TypescriptCompile type-checks bit's own
      // source and the build throws (build() throws on a non-zero exit). On a correct binary it
      // succeeds. The `--tasks` filter isolates the compiler so unrelated env tasks don't add noise.
      const output = helper.command.build('comp1 --tasks teambit.compilation/compiler --ignore-issues="*"');
      expect(output).to.not.have.string('has failed');
      expect(output).to.not.have.string('error TS');
    });
  }
);
