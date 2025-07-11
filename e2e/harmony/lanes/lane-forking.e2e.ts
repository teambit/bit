import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane forking', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('multiple scopes - fork the lane and export to another scope', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-b', `--scope ${anotherRemote} --fork-lane-new-scope`);
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      // previously, it was errored here because the remote didn't have comp2, so it couldn't merge the lane.
      helper.command.export('--fork-lane-new-scope');
    });
    it('should be able to import the forked lane with no errors', () => {
      expect(() => helper.command.import(`${anotherRemote}/lane-b`)).to.not.throw();
    });
  });

  // eventually, this forked lane history is not connected to main.
  // lane-a continue snapping and then merged+squashed into main.
  // on main the "squash" prop points to a newer version from lane-a, which doesn't exist on lane-b.
  // on lane-b, getDivergeData compares its head to main, not to lane-a because they're different scopes.
  // as a result, although it traverses the "squash", it's unable to connect main to lane-b.
  // the missing history exists on lane-a only.

  // update: after PR: https://github.com/teambit/bit/pull/7822, the version-history is created during
  // export. as a result, the VersionHistory the client gets, has already the entire graph, with all the
  // connections.
  describe('multiple scopes - fork the lane, then original lane progresses and squashed to main', () => {
    let anotherRemote: string;
    let laneB: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane('lane-b', `--scope ${anotherRemote} --fork-lane-new-scope`);
      laneB = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(laneB);
      helper.command.import();
    });
    it('should not throw NoCommonSnap on bit status', () => {
      expect(() => helper.command.status()).not.to.throw();
    });
    // see the update in the `describe` section.
    it.skip('should show the component in the invalid component section', () => {
      const status = helper.command.statusJson();
      expect(status.invalidComponents).lengthOf(2);
      expect(status.invalidComponents[0].error.name).to.equal('NoCommonSnap');
    });
    it('should be able to export with no error', () => {
      expect(() => helper.command.export('--fork-lane-new-scope --all')).to.not.throw();
    });
  });

  describe('exporting a component on a lane when the staged snaps exist already on the remote (from another lane)', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild(); // snapA
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.export();
      const laneAFirstSnap = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapX1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapX2
      helper.command.export();

      // locally
      helper.scopeHelper.getClonedWorkspace(laneAFirstSnap);
      helper.command.mergeLane('lane-a'); // now lane-b has snapA + snapB + snapX1 (from lane-a) + snapX2 (the from lane-a)
      helper.command.import();
      // keep this to fetch from all lanes, because in the future, by default, only the current lane is fetched
      helper.command.fetchAllLanes();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('bit export should not throw', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
});
