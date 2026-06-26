import chai, { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('merge lanes - edge cases and special scenarios', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('merge a diverged lane into main with --tag', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.mergeLane('dev', '--no-squash --tag');
    });
    it('should merge-tag instead of merge-snap', () => {
      const cmp = helper.command.catComponent('comp1');
      expect(cmp.versions).to.have.property('0.0.3');
      expect(cmp.versions['0.0.3']).to.equal(cmp.head);
    });
    it('expect head to have two parents', () => {
      const headVer = helper.command.catComponent('comp1@latest');
      expect(headVer.parents).to.have.lengthOf(2);
    });
  });

  describe('auto-snap during merge when the snap is failing', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.switchLocalLane('main');
      helper.command.tagAllWithoutBuild('--unmodified');
      // this will fail the build
      helper.command.dependenciesSet('comp1', 'non-exist-pkg@123.123.123');
      helper.command.mergeLane('dev', '--no-squash --ignore-config-changes --build');
    });
    // previous bug was writing the .bitmap at the end with the failed version
    it('should not change the .bitmap with the failed-snap version', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal('0.0.2');
    });
  });

  describe('merge lane with comp-1 to an empty lane with .bitmap has the component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main');
      helper.command.createLane('dev2');
      helper.command.mergeLane('dev');
    });
    it('should merge', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });

  describe('merge from main when a component head is a tag on main and was not changed on lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('dev', '-x');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '-x');
    });
    // previously, it was throwing an error
    // id o5kaxkjd-remote/comp1@0.0.1 exists in flattenedEdges but not in flattened of o5kaxkjd-remote/comp1@6f820556b472253cd08331b20e704fe74217fd31
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
  });

  describe('conflict when the same file exist in base, deleted on the lane and modified on main', () => {
    const conflictedFilePath = 'comp1/foo.js';
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);

      helper.fs.outputFile(conflictedFilePath);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.fs.deletePath(conflictedFilePath);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.fs.outputFile(conflictedFilePath, 'console.log("hello")');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      beforeMerge = helper.scopeHelper.cloneWorkspace();
    });
    describe('when the lane is merged to main, so currently on the FS the file exits', () => {
      before(() => {
        helper.command.mergeLane('dev', '--no-squash --no-auto-snap -x');
      });
      // previously the file was removed
      it('should not remove the file', () => {
        expect(path.join(helper.scopes.localPath, conflictedFilePath)).to.be.a.file();
      });
    });
    describe('when main is merged to the lane, so currently on the FS the file is removed', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        helper.command.switchLocalLane('dev', '-x');
        helper.command.mergeLane('main', '--no-auto-snap -x');
      });
      // previously it was in "remain-deleted" state and the file was not created
      it('should add the file', () => {
        expect(path.join(helper.scopes.localPath, conflictedFilePath)).to.be.a.file();
      });
    });
  });

  describe('merging from a lane to main when it changed Version object with squashed property and then re-imported it', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild(
        `"${helper.scopes.remote}/comp1, ${helper.scopes.remote}/comp2"`,
        '--unmodified'
      );
      helper.command.snapComponentWithoutBuild(
        `"${helper.scopes.remote}/comp1, ${helper.scopes.remote}/comp2"`,
        '--unmodified'
      );
      helper.command.snapComponentWithoutBuild(
        `"${helper.scopes.remote}/comp1, ${helper.scopes.remote}/comp2"`,
        '--unmodified'
      );
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.mergeLane(`${helper.scopes.remote}/dev`, `-x`);
      const head = helper.command.getHead(`${helper.scopes.remote}/comp1`);
      // because comp3 is missing, this will re-fetch comp1 with all its dependencies, which could potentially override the version objects
      helper.command.import(`${helper.scopes.remote}/comp1@${head} --objects --fetch-deps`);
    });
    it('should not override the squashed property', () => {
      const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp).to.have.property('squashed');
      expect(comp.modified).to.have.lengthOf(1);
    });
    it('bit export should not throw', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('merging from a lane to main when it has a long history which does not exist locally', () => {
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp3');
      beforeMerge = helper.scopeHelper.cloneWorkspace();
    });
    describe('merging one component', () => {
      // previously it was throwing VersionNotFound
      it('should not throw', () => {
        expect(() =>
          helper.command.mergeLane(`${helper.scopes.remote}/dev`, `${helper.scopes.remote}/comp3 --no-squash -x`)
        ).to.not.throw();
      });
    });
    describe('merging the entire lane', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        helper.command.mergeLane(`${helper.scopes.remote}/dev`, `--no-squash -x`);
      });
      // previously it was throwing VersionNotFound
      it('bit export should not throw', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
  });

  describe('merge introduces a new component to a lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('lane-b', '-x');
      helper.command.export();
    });
    // previous bug was ignoring the new component on the remote during export because the snap was already on the remote.
    // as a result, the lane-object on the remote didn't have this comp2 component.
    it('should update the remote lane with the newly merged component', () => {
      const lane = helper.command.catLane('lane-a', helper.scopes.remotePath);
      expect(lane.components).to.have.lengthOf(2);
    });
  });

  describe('merge from main when on a forked-new-lane from another scope', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      const anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);

      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const mainWs = helper.scopeHelper.cloneWorkspace();

      helper.workspaceJsonc.addDefaultScope(anotherRemote);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane('lane-b');
      const laneBWs = helper.scopeHelper.cloneWorkspace();

      helper.scopeHelper.getClonedWorkspace(mainWs);
      helper.command.mergeLane(`${anotherRemote}/lane-a`, '-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(laneBWs);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.mergeLane(`main ${helper.scopes.remote}/comp1`, '-x');
    });
    it('should not throw ComponentNotFound on export', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('merge an out-of-date component from another lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const mainScope = helper.scopeHelper.cloneWorkspace();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(mainScope);
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`, '-x');

      // @todo: fix. currently, it throws an error about missing version
      helper.command.importComponent('comp1', '--all-history --objects');
    });
    it('should not show the component as pending-merge', () => {
      const status = helper.command.statusJson();
      expect(status.mergePendingComponents).to.have.lengthOf(0);
    });
  });

  describe('merge from one lane to another with --squash', () => {
    let previousSnapLaneB: string;
    let headLaneB: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // should not be part of the history
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      previousSnapLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('lane-b', '--squash -x');
    });
    it('bit log should not include previous versions from lane-b', () => {
      const log = helper.command.log('comp1');
      expect(log).to.not.have.string(previousSnapLaneB);
    });
    it('Version object should include the squash data', () => {
      const headVersion = helper.command.catComponent(`${helper.scopes.remote}/comp1@${headLaneB}`);
      expect(headVersion).to.have.property('squashed');
      expect(headVersion.squashed).to.have.property('laneId');
      expect(headVersion.squashed.laneId.name).to.equal('lane-b');
      expect(headVersion.squashed.previousParents).to.have.lengthOf(1);
      expect(headVersion.squashed.previousParents[0]).to.equal(previousSnapLaneB);
    });
  });

  describe('merge from one lane to another with --squash when it has history in main', () => {
    let mainHead: string;
    let previousSnapLaneA: string;
    let headLaneB: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      mainHead = helper.command.getHead('comp1');
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // should not be part of the history
      previousSnapLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`, '--squash -x');
      headLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
    });
    // previously it was throwing NoCommonSnap error
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
    it('Version object should have the main head as the parent', () => {
      const headVersion = helper.command.catComponent(`${helper.scopes.remote}/comp1@${headLaneB}`);
      expect(headVersion.parents).to.have.lengthOf(1);
      expect(headVersion.parents[0]).to.equal(mainHead);
      expect(headVersion.squashed.laneId.name).to.equal('lane-a');
      expect(headVersion.squashed.previousParents).to.have.lengthOf(1);
      expect(headVersion.squashed.previousParents[0]).to.equal(previousSnapLaneA);
    });
    it('Version object should include the squash data', () => {
      const headVersion = helper.command.catComponent(`${helper.scopes.remote}/comp1@${headLaneB}`);
      expect(headVersion).to.have.property('squashed');
      expect(headVersion.squashed).to.have.property('laneId');
      expect(headVersion.squashed.laneId.name).to.equal('lane-a');
      expect(headVersion.squashed.previousParents).to.have.lengthOf(1);
      expect(headVersion.squashed.previousParents[0]).to.equal(previousSnapLaneA);
    });
  });

  describe('when a file was deleted on the other lane but exist current and on the base', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fs.deletePath('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      mergeOutput = helper.command.mergeLane('lane-a', '-x --no-auto-snap');
    });
    it('should indicate that this file was removed in the output', () => {
      expect(mergeOutput).to.have.string('removed foo.js');
    });
    it('should remove this file from the filesystem ', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/foo.js')).to.not.be.a.path();
    });
  });

  describe('when a file was deleted on the other lane but exist current and on the base and both lanes are diverged', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fs.deletePath('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      mergeOutput = helper.command.mergeLane('lane-a', '-x --no-auto-snap --no-squash');
    });
    it('should indicate that this file was removed in the output', () => {
      expect(mergeOutput).to.have.string('removed foo.js');
    });
    it('should remove this file from the filesystem ', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/foo.js')).to.not.be.a.path();
    });
  });
});
