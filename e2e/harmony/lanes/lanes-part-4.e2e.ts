import chai, { expect } from 'chai';
import { LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import { removeChalkCharacters } from '@teambit/legacy.utils';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane command part 4', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('untag on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      output = helper.command.resetAll();
    });
    it('should untag successfully', () => {
      expect(output).to.have.string('1 component(s) were reset');
    });
    it('should change the component to be new', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });
  describe('default tracking data', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.createLane();
    });
    it('should set the remote-scope to the default-scope and remote-name to the local-lane', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`${helper.scopes.remote}${LANE_REMOTE_DELIMITER}dev`);
    });
  });
  describe('change tracking data', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.command.createLane();
      output = helper.command.changeLaneScope('my-remote');
    });
    it('should output the changes', () => {
      expect(removeChalkCharacters(output)).to.have.string(
        `the remote-scope of dev has been changed from ${helper.scopes.remote} to my-remote`
      );
    });
    it('bit lane show should show the changed values', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`my-remote${LANE_REMOTE_DELIMITER}dev`);
    });
  });
  describe('multiple scopes', () => {
    let anotherRemote: string;
    let anotherRemotePath: string;
    let localScope: string;
    let remoteScope: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      anotherRemotePath = scopePath;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v1");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v1");');
      helper.command.addComponent('bar1');
      helper.workspaceJsonc.addToVariant('bar2', 'defaultScope', anotherRemote);
      helper.command.addComponent('bar2');
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.command.createLane();
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v2");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v2");');
      helper.command.snapAllComponents();

      localScope = helper.scopeHelper.cloneWorkspace();
      remoteScope = helper.scopeHelper.cloneRemoteScope();
    });
    // previously, it was showing an error about missing versions.
    describe('exporting the lane to the remote', () => {
      it('should not throw an error', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
      // previously, it would remove the staged-config only when the component-scope was the same as the lane-scope or when the comp is new
      it('should remove the content of the staged-config', () => {
        const stagedConfig = helper.general.getStagedConfig(`${helper.scopes.remote}/dev`);
        expect(stagedConfig).to.have.lengthOf(0);
      });
      // previously, it was changing the scope-name of bar2 to the first remote.
      it('the components scope should not be changed on the remote', () => {
        const catRemote = helper.command.catScope(false, helper.scopes.remotePath);
        const bar2 = catRemote.find((c) => c.name === 'bar2');
        expect(bar2.scope).to.equal(anotherRemote);
      });
    });
    describe('when artifacts from older versions are missing locally', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        // delete an artifact
        const artifacts = helper.command.getArtifacts(`${anotherRemote}/bar2@0.0.1`);
        const pkgArtifacts = artifacts.find((a) => a.generatedBy === 'teambit.pkg/pkg');
        const artifactFileHash = pkgArtifacts.files[0].file;
        const hashPath = helper.general.getHashPathOfObject(artifactFileHash);
        helper.fs.deleteObject(hashPath);
      });
      // previously, throwing an error "unable to find an artifact object file".
      it('should not throw an error', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
    describe('importing the lane', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.export();
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(anotherRemotePath); // needed to fetch the head from the original scope.
        // previously, it was throwing an error while trying to fetch these two components, each from its own scope.
        helper.command.switchRemoteLane('dev');
      });
      // previous error was trying to get the Ref of the remote-scope according to the component-scope
      // resulting in zero data from the ref file and assuming all versions are staged
      it('should not show the component as staged', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
});
