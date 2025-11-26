import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

/**
 * This test verifies the fix for an issue where `bit install --add-missing-deps` doesn't work
 * when dependencies are imported in files with custom extensions that require env detectors.
 *
 * The issue was caused by a cascading cache problem:
 * 1. Components were first loaded without `loadSeedersAsAspects`, so env detectors weren't available
 * 2. This initial load cached component data (without proper dependency detection) across multiple cache layers
 * 3. Later when loading with seeders for `--add-missing-deps`, the cached data was used instead
 *
 * The fix ensures components are ALWAYS loaded with `loadSeedersAsAspects: true` from the first load.
 */
describe('add-missing-deps with custom detector', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'when a dependency is imported in a file with custom extension and env is external',
    () => {
      let npmCiRegistry: NpmCiRegistry;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.workspaceJsonc.setupDefault();
        npmCiRegistry = new NpmCiRegistry(helper);
        await npmCiRegistry.init();
        npmCiRegistry.configureCiInPackageJsonHarmony();

        // Create a simple detector for .custom files
        helper.fs.outputFile(
          'custom-detector/custom-detector.ts',
          `import { DependencyDetector } from '@teambit/dependency-resolver';
import esDetective from '@teambit/node.deps-detectors.detective-es6';

export const customDetector: DependencyDetector = {
  type: 'custom',
  isSupported: ({ ext }): boolean => {
    return ext === '.custom';
  },
  detect: (fileContent: string): string[] => {
    // Simple detection - just use ES6 detective to parse imports
    const deps = esDetective(fileContent);
    return Array.isArray(deps) ? deps : Object.keys(deps);
  },
};
`
        );
        helper.fs.outputFile('custom-detector/index.ts', `export { customDetector } from './custom-detector';`);
        helper.command.addComponent('custom-detector');
        helper.command.setEnv('custom-detector', 'teambit.harmony/aspect');

        // Create a base env that has the custom detector (like vue-base-env)
        helper.fs.outputFile(
          'base-env/base-env.bit-env.ts',
          `import { customDetector } from '${helper.general.getPackageNameByCompName('custom-detector')}';

export class BaseEnv {
  detectors() {
    return () => [customDetector];
  }
}

export default new BaseEnv();
`
        );
        helper.fs.outputFile('base-env/index.ts', `export { BaseEnv } from './base-env.bit-env';`);
        helper.command.addComponent('base-env');
        helper.command.setEnv('base-env', 'teambit.envs/env');

        // Create an extended env that extends the base env (like my-vue-env extends vue-base-env)
        helper.fs.outputFile(
          'extended-env/extended-env.bit-env.ts',
          `import { BaseEnv } from '${helper.general.getPackageNameByCompName('base-env')}';

export class ExtendedEnv extends BaseEnv {
  // Inherits detectors() from BaseEnv
}

export default new ExtendedEnv();
`
        );
        helper.fs.outputFile('extended-env/index.ts', `export { ExtendedEnv } from './extended-env.bit-env';`);
        helper.command.addComponent('extended-env');
        helper.command.setEnv('extended-env', 'teambit.envs/env');

        // Install detective, then install all dependencies, compile, tag and export envs
        helper.command.install('@teambit/node.deps-detectors.detective-es6');
        // Force snap/tag even with missing deps issue (which is the bug we're testing!)
        helper.command.tagAllComponents();
        helper.command.export();

        // Create a new workspace and set npm registry
        helper.scopeHelper.reInitWorkspace();
        npmCiRegistry.setResolver();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);

        // Create a component with a .custom file that imports a package
        helper.fixtures.populateComponents(1, false);
        helper.fs.outputFile('comp1/index.custom', `import lodash from 'lodash';`);
        helper.command.setEnv('comp1', `${helper.scopes.remote}/extended-env`);

        // Install to get the env as a package
        helper.command.install();
      });

      after(() => {
        npmCiRegistry.destroy();
      });

      it('should show lodash as missing in bit status', () => {
        helper.command.expectStatusToHaveIssue('MissingPackagesDependenciesOnFs');
      });

      it('should add the missing dependency after running bit install --add-missing-deps', () => {
        helper.command.install('--add-missing-deps');
        helper.command.expectStatusToNotHaveIssue('MissingPackagesDependenciesOnFs');
      });
    }
  );
});
