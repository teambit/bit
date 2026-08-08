import fs from 'fs-extra';
import { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';

/**
 * `patchedDependencies` paths are configured relative to the workspace root. A capsule install
 * runs in the capsules directory instead, so the paths have to survive that change of root -
 * otherwise a workspace that installs fine fails to build.
 */
describe('patched dependencies', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a patch configured with a workspace-relative path', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      // the capsule only installs what the component depends on
      helper.fs.outputFile('comp1/index.js', `const isPositive = require('is-positive');\nmodule.exports = isPositive;\n`);
      helper.command.install('is-positive@1.0.0');
      // a patch's context lines are byte-exact, so build it from what was actually installed
      const indexPath = path.join(helper.scopes.localPath, 'node_modules/is-positive/index.js');
      const contents = fs.readFileSync(indexPath, 'utf8');
      const hasTrailingNewline = contents.endsWith('\n');
      const lines = (hasTrailingNewline ? contents.slice(0, -1) : contents).split('\n');
      helper.fs.outputFile(
        'patches/is-positive.patch',
        [
          'diff --git a/index.js b/index.js',
          '--- a/index.js',
          '+++ b/index.js',
          `@@ -1,${lines.length} +1,${lines.length + 1} @@`,
          ` ${lines[0]}`,
          '+// patched',
          ...lines.slice(1).map((line) => ` ${line}`),
          ...(hasTrailingNewline ? [''] : ['\\ No newline at end of file']),
        ].join('\n')
      );
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('patchedDependencies', {
        'is-positive@1.0.0': 'patches/is-positive.patch',
      });
      helper.command.install();
    });
    it('should apply the patch in the workspace', () => {
      const indexPath = path.join(helper.scopes.localPath, 'node_modules/is-positive/index.js');
      expect(fs.readFileSync(indexPath, 'utf8')).to.have.string('// patched');
    });
    it('should apply the patch in the capsule too', () => {
      helper.command.build();
      // the capsule install runs in the capsules root, where the dependencies of every capsule
      // are installed - the component capsule reaches them by walking up
      const capsulesRoot = path.dirname(helper.command.getCapsuleOfComponent('comp1'));
      const indexPath = path.join(capsulesRoot, 'node_modules/is-positive/index.js');
      expect(fs.readFileSync(indexPath, 'utf8')).to.have.string('// patched');
    });
  });
});
