import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import { IssuesClasses } from '@teambit/component-issues';
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
      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.fixtures.populateComponents(3);
      helper.command.setEnv("'comp1, comp2, comp3'", envId);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.command.softRemoveOnLane(envName);
    });
    it('bit status should show an issue about the missing env', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.RemovedEnv.name);
    });
    it('bit envs should show the env as not loaded', () => {
      const envsOutput = helper.command.envs();
      expect(envsOutput).to.have.string('(not loaded)');
      expect(envsOutput).to.have.string(envName);
    });
  });
});
