import fs from 'fs-extra';
import { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';

/**
 * `enableGlobalVirtualStore` moves the dependency directories out of the workspace's
 * `node_modules/.pnpm` and into a directory shared by every workspace on the machine. Everything a
 * workspace does has to keep working from there - the deps still have to resolve, and the envs still
 * have to find the core aspects they require without declaring them.
 */
describe('installing with the global virtual store', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a workspace with a component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('enableGlobalVirtualStore', true);
      helper.fixtures.populateComponents(1);
      helper.command.install('is-positive@1.0.0');
    });
    it('should not create the dependency directories inside the workspace', () => {
      const virtualStoreDir = path.join(helper.scopes.localPath, 'node_modules/.pnpm');
      const dirs = fs.readdirSync(virtualStoreDir).filter((dir) => dir !== 'lock.yaml' && dir !== 'node_modules');
      expect(dirs).to.deep.eq([]);
    });
    it('should link the dependency from the global virtual store', () => {
      const depPath = path.join(helper.scopes.localPath, 'node_modules/is-positive');
      expect(fs.realpathSync(depPath)).to.match(/[\\/]bit-links[\\/]/);
    });
    it('should still record the installed dependencies in the current lockfile', () => {
      expect(helper.fs.getVirtualStoreDirNames()).to.include('is-positive@1.0.0');
    });
    it('should load the component without issues', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues).to.have.lengthOf(0);
    });
    it('should compile the component into its package directory', () => {
      helper.command.compile();
      expect(
        path.join(helper.scopes.localPath, 'node_modules', `@${helper.scopes.remote}/comp1/dist/index.js`)
      ).to.be.a.path();
    });
  });
  describe('patched dependencies', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('enableGlobalVirtualStore', true);
      helper.command.install('is-positive@1.0.0');
      // a patch's context lines are byte-exact, so build it from what was actually installed
      const indexPath = path.join(helper.scopes.localPath, 'node_modules/is-positive/index.js');
      const context = fs.readFileSync(indexPath, 'utf8').split('\n');
      helper.fs.outputFile(
        'patches/is-positive.patch',
        [
          'diff --git a/index.js b/index.js',
          '--- a/index.js',
          '+++ b/index.js',
          `@@ -1,${context.length - 1} +1,${context.length} @@`,
          ` ${context[0]}`,
          '+// patched',
          ...context.slice(1, -1).map((line) => ` ${line}`),
          '',
        ].join('\n')
      );
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('patchedDependencies', {
        'is-positive@1.0.0': 'patches/is-positive.patch',
      });
      helper.command.install();
    });
    it('should apply the patch to the copy in the global virtual store', () => {
      const indexPath = path.join(helper.scopes.localPath, 'node_modules/is-positive/index.js');
      expect(fs.readFileSync(indexPath, 'utf8')).to.include('// patched');
    });
  });
});
