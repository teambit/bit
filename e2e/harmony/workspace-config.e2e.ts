import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('workspace config (workspace.jsonc)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding a non-component key', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.addKeyVal('non-comp', {});
    });
    it('any command should throw a descriptive error', () => {
      expect(() => helper.command.status()).to.throw(
        `unable to parse the component-id "non-comp" from the workspace.jsonc file`
      );
    });
  });
  describe('adding a non-existing component to a variant', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.workspaceJsonc.addToVariant('*', 'teambit.harmony/non-exist', {});
    });
    it('any command should throw a ComponentNotFound error with specific suggestions for the workspace.jsonc file', () => {
      expect(() => helper.command.status()).to.throw(`your workspace.jsonc has this component-id set`);
    });
  });
  describe('comment preservation in workspace.jsonc', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();

      // Now manually add a workspace.jsonc with comments
      const workspaceJsoncWithComments = `{
  "$schema": "./workspace-jsonc-schema.json",
  // Default scope for all components in workspace.
  "teambit.workspace/workspace": {
    // This is the workspace name
    "name": "test-workspace",
    // This is the default scope
    "defaultScope": "old.scope"
  }
}`;
      helper.fs.outputFile('workspace.jsonc', workspaceJsoncWithComments);
    });
    describe('when changing defaultScope using workspace config API', () => {
      let workspaceConfigAfter: string;
      before(() => {
        helper.command.setScope('new.scope');
        workspaceConfigAfter = helper.fs.readFile('workspace.jsonc');
      });
      it('should preserve comments above the workspace aspect', () => {
        expect(workspaceConfigAfter).to.include('// Default scope for all components in workspace.');
      });
      it('should preserve comments inside the workspace aspect object', () => {
        expect(workspaceConfigAfter).to.include('// This is the workspace name');
        expect(workspaceConfigAfter).to.include('// This is the default scope');
      });
      it('should update the defaultScope value', () => {
        expect(workspaceConfigAfter).to.include('"defaultScope": "new.scope"');
      });
      it('should not lose any other properties', () => {
        expect(workspaceConfigAfter).to.include('"name": "test-workspace"');
      });
    });
  });
});
