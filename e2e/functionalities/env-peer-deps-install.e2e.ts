import chai, { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

/**
 * This test verifies that env peer dependencies (e.g., react, react-dom, @types/react)
 * are properly installed during normal `bit install`, so that type checking and
 * building work correctly for newly created components.
 *
 * Before the fix (PR #10215), `bit create react` followed by `bit install` would
 * not install all env peer deps, causing TypeScript errors in the IDE and during
 * `bit check-types` due to missing type definitions (e.g., @types/react).
 *
 * The fix ensures `includeAllEnvPeers` defaults to true for normal installs,
 * only filtering them when using the external package manager path
 * (writeDependenciesToPackageJson).
 */
describe.only('env peer dependencies should be installed for created components', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('bit create react and then check-types and tag', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.create('react', 'button');
    });

    it('should install env peer deps like @types/react in node_modules', () => {
      expect(path.join(helper.scopes.localPath, 'node_modules/@types/react')).to.be.a.directory();
    });

    it('bit check-types should pass without errors', () => {
      const output = helper.general.runWithTryCatch('bit check-types');
      expect(output).to.not.have.string('error TS');
    });
  });
});
