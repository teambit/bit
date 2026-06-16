import chai, { expect } from 'chai';
import path from 'path';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { specFileFailingFixture } from '../jest-fixtures';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('merge lanes - edge cases and special scenarios (part 2)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('naming conflict introduced during the merge', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fs.outputFile('comp1-foo/index.ts');
      helper.command.addComponent('comp1-foo', '--id comp1/foo');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('lane-a');
    });
    it('should merge without error by prefix "_1" to the dir-name', () => {
      expect(() => helper.command.mergeLane(`${helper.scopes.remote}/lane-b`, '-x')).to.not.throw();
      const dir = path.join(helper.scopes.localPath, helper.scopes.remote, 'comp1_1');
      expect(dir).to.be.a.directory();
    });
  });

  // the idea here is that main-head doesn't exist in lane-b history.
  // the history between main and lane-b is connected through the "squashed" property of HEAD^1 (main head minus one),
  // which is equal to HEAD-LANE-B^1.
  describe('merge lane-a to main with squashing then from main to lane-b which forked from lane-a', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('lane-b', '-x');
    });
    // previously it was throwing the "unrelated" error
    it('bit-lane-merge should not throw', () => {
      expect(() => helper.command.mergeLane('main', '-x --no-auto-snap')).to.not.throw();
    });
  });

  describe('renaming files from uppercase to lowercase', () => {
    let afterExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.fs.outputFile('comp1/Foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-b');
      helper.fs.deletePath('comp1/Foo.js');
      helper.fs.outputFile('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      afterExport = helper.scopeHelper.cloneWorkspace();
    });
    describe('merging', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane('lane-a', '-x');
        helper.command.mergeLane('lane-b', '-x');
      });
      it('should get the rename from the other lane', () => {
        const file = path.join(helper.scopes.remote, 'comp1/foo.js');
        helper.fs.expectFileToExist(file);
      });
    });
    describe('switching', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterExport);
        helper.command.switchLocalLane('lane-a', '-x');
      });
      it('should remove the file from the current lane and write the file according to the switch-to lane', () => {
        helper.fs.expectFileToExist('comp1/Foo.js');
      });
    });
  });

  describe('multiple files, some are not changes', () => {
    let switchOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      switchOutput = helper.command.switchLocalLane('lane-a', '-x');
    });
    it('expect to have all files as unchanged, not updated', () => {
      expect(switchOutput).to.not.have.string('updated');
    });
    describe('merge the lane', () => {
      let mergeOutput: string;
      before(() => {
        mergeOutput = helper.command.mergeLane('lane-b', '-x');
      });
      it('expect to have all files as unchanged, not updated', () => {
        expect(mergeOutput).to.not.have.string('updated');
      });
    });
  });

  describe('merging from main when main is ahead so then a snap of an existing tag is in .bitmap', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('main', '-x');
    });
    it('bit status should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    it('the dependency should use the tag not the snap', () => {
      const dep = helper.command.getCompDepsIdsFromData('comp1');
      expect(dep[0]).to.equal(`${helper.scopes.remote}/comp2@0.0.2`);
    });
    describe('snapping the dependent', () => {
      before(() => {
        helper.command.snapComponentWithoutBuild('comp1');
      });
      it('should save the dependency with tag, not snap', () => {
        const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
        expect(comp1.dependencies[0].id.version).to.equal('0.0.2');
        expect(comp1.flattenedDependencies[0].version).to.equal('0.0.2');
        const depResolver = comp1.extensions.find((e) => e.name === Extensions.dependencyResolver);
        const dep = depResolver.data.dependencies.find((d) => d.id.includes('comp2'));
        expect(dep.version).to.equal('0.0.2');
      });
    });
  });

  describe('when a file exists in local and others but not in base', () => {
    let mainWs: string;
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      mainWs = helper.scopeHelper.cloneWorkspace();

      helper.command.createLane();
      helper.fs.outputFile('comp1/foo.js', 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(mainWs);
      helper.fs.outputFile('comp1/foo.js', 'on-main');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      mergeOutput = helper.command.mergeLane('dev', '-x --no-squash --auto-merge-resolve=manual');
    });
    // previously in this case, it was marking it as "overridden" and was leaving the content as it was in the filesystem.
    it('should write the file with the conflicts', () => {
      expect(mergeOutput).to.include('CONFLICT');
      const foo = helper.fs.readFile('comp1/foo.js');
      expect(foo).to.include('<<<<<<<');
    });
  });

  describe('merging lane with a component newly introduced where it was a package before', () => {
    let laneAWs: string;
    let comp2PkgName: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      laneAWs = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.export();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      comp2PkgName = helper.general.getPackageNameByCompName('comp2', false);
      helper.scopeHelper.getClonedWorkspace(laneAWs);
      helper.npm.addFakeNpmPackage(comp2PkgName, '0.0.1');
      helper.workspaceJsonc.addPolicyToDependencyResolver({ dependencies: { [comp2PkgName]: '0.0.1' } });
    });
    it('should remove the package from workspace.jsonc', () => {
      helper.command.mergeLane('lane-b', '-x');
      const policy = helper.workspaceJsonc.getPolicyFromDependencyResolver();
      expect(policy.dependencies).to.not.have.property(comp2PkgName);
    });
  });

  describe('bit lane merge-move command', () => {
    let oldSnapComp1: string;
    let snapComp2: string;
    let newSnapComp1: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, true, 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(3, true, 'on-main');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '-x --manual');
      helper.fixtures.populateComponents(3, true, 'fixed-conflicts');
      oldSnapComp1 = helper.command.getHeadOfLane('dev', 'comp1');
      snapComp2 = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.snapComponentWithoutBuild('comp1');
      newSnapComp1 = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.mergeMoveLane('new-lane');
    });
    it('should create a new lane', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('new-lane');
    });
    it('the new lane should have the new local snaps created on the original lane', () => {
      const lane = helper.command.catLane('new-lane');
      expect(lane.components).to.have.lengthOf(3);
      const comp1 = lane.components.find((c) => c.id.name === 'comp1');
      expect(comp1.head).to.equal(newSnapComp1);
    });
    it('the new lane should have the same components as the original lane', () => {
      const lane = helper.command.catLane('new-lane');
      const comp2 = lane.components.find((c) => c.id.name === 'comp2');
      expect(comp2.head).to.equal(snapComp2);
    });
    it('the filesystem should stay the same', () => {
      const comp1 = helper.fs.readFile(`comp1/index.js`);
      expect(comp1).to.have.string('fixed-conflicts');
      const comp2 = helper.fs.readFile(`comp2/index.js`);
      expect(comp2).to.have.string('fixed-conflicts');
    });
    it('the original lane should be reverted to the before-merge state', () => {
      const lane = helper.command.catLane('dev');
      const comp1 = lane.components.find((c) => c.id.name === 'comp1');
      expect(comp1.head).to.equal(oldSnapComp1);
    });
  });

  describe('--no-snap vs --no-auto-snap', () => {
    let beforeMerge: string;
    let snapLaneA: string;
    let snapLaneB: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      snapLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, undefined, 'from-lane-b');
      helper.command.snapAllComponentsWithoutBuild();
      snapLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      beforeMerge = helper.scopeHelper.cloneWorkspace();
    });
    describe('with --no-auto-snap', () => {
      before(() => {
        helper.command.mergeLane('lane-b', '--no-auto-snap -x');
      });
      it('should update current lane according to the merged one', () => {
        const snap = helper.command.getHeadOfLane('lane-a', 'comp1');
        expect(snap).to.equal(snapLaneB);
      });
      it('should not leave the components as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(0);
      });
    });
    describe('with --no-snap', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        helper.command.mergeLane('lane-b', '--no-snap -x');
      });
      it('should not update current lane according to the merged one', () => {
        const snap = helper.command.getHeadOfLane('lane-a', 'comp1');
        expect(snap).to.not.equal(snapLaneB);
        expect(snap).to.equal(snapLaneA);
      });
      it('should leave the components as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(1);
      });
      describe('after snapping', () => {
        before(() => {
          helper.command.snapAllComponentsWithoutBuild();
        });
        it('should save two parents, from the current lane and from the merged lane', () => {
          const versionObj = helper.command.catComponent('comp1@latest');
          expect(versionObj.parents).to.have.lengthOf(2);
          expect(versionObj.parents[0]).to.equal(snapLaneA);
          expect(versionObj.parents[1]).to.equal(snapLaneB);
        });
      });
    });
  });

  describe('merging from lane with --no-snap when there is no base-snap', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
    });
    it('should not throw an error', () => {
      expect(() => helper.command.mergeLane('main', '--no-snap -x')).to.not.throw();
    });
  });

  describe('merge with --detach-head', () => {
    let commonSnap: string;
    let headOnMain: string;
    let firstSnapOnLane: string;
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild('--ver 1.0.0');
      commonSnap = helper.command.getHead('comp1');
      helper.command.tagAllWithoutBuild('--unmodified --ver 2.0.0');
      helper.command.export();
      headOnMain = helper.command.getHead('comp1');
      helper.command.checkoutVersion('1.0.0', "'**' -x");
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      firstSnapOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('dev', '--detach-head -x');
    });
    after(() => {
      helper.command.resetFeatures();
    });
    it('should not change the head', () => {
      const head = helper.command.getHead('comp1');
      expect(head).to.equal(headOnMain);
      expect(head).to.not.equal(headOnLane);
    });
    it('should save the detached head', () => {
      const comp = helper.command.catComponent('comp1');
      expect(comp.detachedHeads.current).to.equal(headOnLane);
    });
    it('should continue the history from the common snap, not from the head', () => {
      const laneHeadVer = helper.command.catObject(headOnLane, true);
      expect(laneHeadVer.parents).to.have.lengthOf(1);
      expect(laneHeadVer.parents[0]).to.equal(commonSnap);
      expect(laneHeadVer.parents[0]).to.not.equal(headOnMain);
    });
    it('should squash successfully', () => {
      const laneHeadVer = helper.command.catObject(headOnLane, true);
      expect(laneHeadVer.squashed.previousParents[0]).to.equal(firstSnapOnLane);
    });
  });

  describe('merge with --build --loose', () => {
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // Create divergent histories to trigger snap-merge
      helper.command.createLane('dev');
      // Add failing test to existing component
      helper.fs.outputFile('comp1/comp1.spec.ts', specFileFailingFixture());
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // Switch to main and create conflicting change
      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild('--unmodified'); // This creates divergent history

      beforeMerge = helper.scopeHelper.cloneWorkspace();
    });
    describe('without --loose flag', () => {
      it('should fail when merging with --build due to test failures', () => {
        const output = helper.command.mergeLane('dev', '--build --no-squash');
        expect(output).to.have.string('Total Snapped: 0');
      });
    });
    describe('with --loose flag', () => {
      let mergeOutput: string;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        mergeOutput = helper.command.mergeLane('dev', '--build --loose --no-squash');
      });
      it('should succeed despite test failures', () => {
        expect(mergeOutput).to.have.string('Total Snapped: 1');
      });
      it('should indicate that the test failed', () => {
        expect(mergeOutput).to.include('task "teambit.defender/tester:JestTest" has failed');
      });
    });
  });
});
