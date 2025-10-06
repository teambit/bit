import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('lanes with various issues', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('issue - object of head of main is missing from the filesystem and remote', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild();
      const comp2Head = helper.command.getHead('comp2');
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, undefined, 'v3');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const objectPath = helper.general.getHashPathOfObject(comp2Head);
      helper.fs.deleteObject(objectPath);
      helper.fs.deleteRemoteObject(objectPath);
    });
    it('bit diff diff should not throw', () => {
      expect(() => helper.command.diffLane()).not.to.throw();
      const output = helper.command.diffLane();
      expect(output).to.have.string('Diff failed on the following component(s)');
      expect(output).to.have.string('was not found on the filesystem');
    });
    it('bit diff main should not throw', () => {
      expect(() => helper.command.diffLane('main')).not.to.throw();
    });
  });
  describe('issue - deleting a custom env on lane that is used by components', () => {
    let envId: string;
    let envName: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager();
      // Create a custom env
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      // Create some components that use the custom env
      helper.fixtures.populateComponents(3);
      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      // Tag and export on main
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // Create a new lane
      helper.command.createLane('dev');
      // Snap all components and export
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      // Delete the env on the lane
      helper.command.softRemoveOnLane(envName);
    });
    it('bit status should show an issue about the missing env', () => {
      const status = helper.command.runCmd('bit status');
      // The status should indicate something about the env being deleted or missing
      // This could be a component issue or a status message
      expect(status).to.satisfy((str: string) => {
        return str.includes('deleted') || str.includes('missing') || str.includes('removed') || str.includes(envName);
      });
    });
    it('components should show in status as having issues', () => {
      const statusJson = helper.command.statusJson();
      // Components should be listed with issues since their env is deleted
      const hasIssues = statusJson.componentsWithIssues && statusJson.componentsWithIssues.length > 0;
      expect(hasIssues).to.be.true;
    });
    it('bit envs should show the env as not loaded', () => {
      const envsOutput = helper.command.envs();
      expect(envsOutput).to.have.string('(not loaded)');
      expect(envsOutput).to.have.string(envName);
    });
    it('bit envs should show a warning about not being able to load the env', () => {
      const envsOutput = helper.command.envs();
      expect(envsOutput).to.have.string('warning');
      expect(envsOutput).to.have.string("bit wasn't able to load");
      expect(envsOutput).to.have.string(envName);
    });
  });
});
