import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { InvalidScopeName } from '@teambit/legacy-bit-id';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('bit lane management', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('rename an exported lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.renameLane('new-lane');
    });
    it('should rename the lane locally', () => {
      const lanes = helper.command.listLanes();
      expect(lanes).to.have.string('new-lane');
      expect(lanes).to.not.have.string('dev');
    });
    it('should change the current lane', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('new-lane');
    });
    it('should not change the remote lane name before export', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(1);
      expect(remoteLanes.lanes[0].name).to.equal('dev');
    });
    it('should change the remote lane name after export', () => {
      helper.command.export();
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(1);
      expect(remoteLanes.lanes[0].name).to.equal('new-lane');
    });
  });

  describe('change-scope', () => {
    describe('when the lane is exported', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });
      it('should block the rename', () => {
        expect(() => helper.command.changeLaneScope('new-scope')).to.throw(
          'changing lane scope-name is allowed for new lanes only'
        );
      });
    });
    describe('when the scope-name is invalid', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
      });
      it('should throw InvalidScopeName error', () => {
        const err = new InvalidScopeName('invalid.scope.name');
        const cmd = () => helper.command.changeLaneScope('invalid.scope.name');
        helper.general.expectToThrow(cmd, err);
      });
    });
    // regression: "bit status" used to throw "TargetHeadNotFound" after forking an imported lane and
    // changing its scope. once forked to a different scope, the divergence fell back to comparing against
    // the component's main-head. since the component lives on a different scope than the lane, its main-head
    // Version object isn't fetched by "bit lane import", so the comparison crashed.
    describe('on a forked lane whose components have a main-head that was not fetched', () => {
      let anotherRemotePath: string;
      let anotherRemoteName: string;
      let compId: string;
      before(() => {
        // the component (bar1) lives on "anotherRemote", the lane lives on the default remote scope.
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
        anotherRemotePath = scopePath;
        anotherRemoteName = scopeName;
        helper.scopeHelper.addRemoteScope(scopePath);
        helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
        compId = `${scopeName}/bar1`;
        helper.fs.outputFile('bar1/index.js', 'console.log("v1");');
        helper.command.add('bar1', `--scope ${scopeName}`);
        // main-head (M1) on "anotherRemote"
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
        // lane-head (L1) on the default remote lane
        helper.command.createLane('lane-a');
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();
        // advance main (M2) so its head diverges from the lane-head and won't be in the lane history
        helper.command.switchLocalLane('main', '-x');
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();

        // consumer: import the lane (the component's main-head, on anotherRemote, is not part of the lane history).
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(anotherRemotePath);
        helper.command.importLane('lane-a', '-x');
        // reproduce the real-world corrupted state: the component's main-head is recorded as the component head,
        // but it is absent from the VersionHistory object (it lives on the component's own scope, on a branch not
        // reachable from the lane). additionally there is no remote main-ref for that scope, so the divergence
        // falls back to the main-head and can't find it in the VersionHistory.
        const mainHead = helper.command.getHead(compId);
        const vhHash = helper.command.catVersionHistory(compId).hash;
        const mainHeadPath = helper.general.getHashPathOfObject(mainHead);
        const vhPath = helper.general.getHashPathOfObject(vhHash);
        const removeFromAllScopes = (objPath: string) => {
          helper.fs.deleteObject(objPath);
          fs.removeSync(path.join(anotherRemotePath, 'objects', objPath));
          fs.removeSync(path.join(helper.scopes.remotePath, 'objects', objPath));
        };
        // drop the VersionHistory object so it's rebuilt locally (from Version objects that lack the main-head),
        // and drop the main-head Version object everywhere so "bit status" can't re-fetch and re-add it.
        removeFromAllScopes(vhPath);
        removeFromAllScopes(mainHeadPath);
        // remove the remote main-ref of the component's scope, so divergence reaches the (missing) main-head.
        fs.removeSync(path.join(helper.scopes.localPath, '.bit/refs/remotes', anotherRemoteName, 'main'));
        helper.command.createLane('forked-lane');
        helper.command.changeLaneScope('another-scope');
      });
      it('bit status should not throw', () => {
        expect(() => helper.command.status()).to.not.throw();
      });
      it('should show the lane component as staged (all snaps to be re-exported to the new scope)', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });
  });

  describe('bit lane with --details flag', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
      output = helper.command.listLanes('--details');
    });
    it('should show all lanes and mark the current one', () => {
      expect(output).to.have.string(`current lane - ${helper.scopes.remote}/dev`);
    });
  });
});
