import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../../src/e2e-helper/e2e-helper';
import { Extensions } from '../../../src/constants';

chai.use(require('chai-fs'));

describe('bit lane command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('remove components when on a lane', () => {
    let beforeRemoval: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.fixtures.populateComponents(undefined, undefined, ' v2');
      helper.command.snapAllComponentsWithoutBuild();
      beforeRemoval = helper.scopeHelper.cloneLocalScope();
    });
    it('as an intermediate step, make sure the snapped components are part of the lane', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(3);
    });
    // --from-lane is disabled for now until we see a real use case for it
    describe.skip('removing a component that has no dependents with --from-lane', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent('comp1', '--from-lane');
      });
      it('should indicate that the component was removed from the lane', () => {
        expect(output).to.have.string('lane');
        expect(output).to.have.string('successfully removed components');
      });
      it('should remove the component from the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(2);
        lane.components.forEach((c) => expect(c.id.name).to.not.have.string('comp1'));
      });
      it('should not remove the component from .bitmap', () => {
        const head = helper.command.getHead('comp1');
        helper.bitMap.expectToHaveId('comp1', head, helper.scopes.remote);
      });
      it('should not delete the files from the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'comp1/index.js')).to.be.a.file();
      });
    });
    describe('removing a component that has no dependents', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeRemoval);
        helper.command.removeComponent('comp1');
      });
      it('should remove the component from .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.not.have.property('comp1');
      });
      it('should delete the files from the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'comp1')).to.not.be.a.path();
      });
    });
  });
  // --from-lane is disabled for now until we see a real use case for it
  describe.skip('remove a new component when on a lane with --from-lane flag', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.removeComponent('comp1', '--from-lane');
    });
    it('should remove the component from the .bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp1');
    });
  });
  // --from-lane is disabled for now until we see a real use case for it
  describe.skip('remove a non-lane component when on a lane with --from-lane flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.removeComponent('comp1', '--from-lane');
    });
    it('should remove the component from the .bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp1');
    });
  });
  describe('soft remove on lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.softRemoveOnLane('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    describe('merge a lane with removed component to main', () => {
      let mergeOutput: string;
      before(() => {
        helper.command.switchLocalLane('main');
        mergeOutput = helper.command.mergeLane('dev', '--verbose');
      });
      it('should not merge the removed component', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
        expect(list[0].id).to.not.have.string('comp2');
      });
      it('should explain why it was not merged if --verbose was used', () => {
        expect(mergeOutput).to.have.string('has been removed');
      });
    });
    describe('importing the lane to a new workspace', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane('dev');
      });
      it('should not bring the removed components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
        expect(list[0].id).to.not.have.string('comp2');
      });
    });
    describe('forking the lane and exporting', () => {
      let exportOutput: string;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane('dev');
        helper.command.createLane('dev2');
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        exportOutput = helper.command.export();
      });
      it('should not export the soft-removed', () => {
        expect(exportOutput).to.not.have.string('comp2');
        expect(exportOutput).to.have.string('comp1');
      });
    });
  });
  describe('remove a new component on a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.removeComponent('comp1');
    });
    it('should remove from the lane object as well', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(1);
      expect(lane.components[0].id).to.not.include('comp1');
    });
    // previously, it was throwing: "Error: unable to merge lane dev, the component 87ql0ef4-remote/comp1 was not found"
    // because the component was not removed from the lane-object.
    it('bit export should not throw', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('delete main component when on a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
    });
    it('should throw an error suggesting to switch to main or using --update-main flag', () => {
      expect(() => helper.command.softRemoveOnLane('comp2')).to.throw('unable to delete');
    });
    describe('using --update-main flag', () => {
      before(() => {
        helper.command.softRemoveOnLane('comp2', '--update-main');
      });
      it('should remove the component from the workspace', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
        expect(list[0].id).to.not.have.string('comp2');
      });
    });
  });
  describe('soft remove on lane when a forked lane is merging this lane', () => {
    let beforeRemoveScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeRemoveScope = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.softRemoveOnLane('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(beforeRemoveScope);
    });
    it('bit status --lanes should show updates from lane-a', () => {
      const status = helper.command.statusJson(undefined, '--lanes');
      expect(status.updatesFromForked).to.have.lengthOf(2);
    });
    describe('merge the original lane', () => {
      let output;
      before(() => {
        helper.command.fetchAllLanes();
        output = helper.command.mergeLane('lane-a', '-x');
      });
      it('should indicate that the component was removed', () => {
        expect(output).to.have.string('the following 1 component(s) have been removed');
      });
      it('should remove the soft-removed component from .bitmap', () => {
        const list = helper.command.list();
        expect(list).to.not.have.string('comp2');
      });
      it('should remove the component files from the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'comp2')).to.not.be.a.path();
      });
      it('should leave the component on the lane and update it according to lane-a to make it soft-removed in lane-b as well', () => {
        const laneComps = helper.command.catLane('lane-b');
        const comps = laneComps.components.map((c) => c.id.name);
        expect(comps).to.include('comp2');
      });
      it('bit show should show the component as removed', () => {
        const removeData = helper.command.showAspectConfig('comp2', Extensions.remove);
        expect(removeData.config.removed).to.be.true;
      });
      it('bit status should show the component as staged', () => {
        const status = helper.command.statusJson();
        const staged = status.stagedComponents.map((c) => c.id);
        expect(staged).to.include(`${helper.scopes.remote}/comp2`);
      });
      describe('abort the lane-merge', () => {
        let abortOutput: string;
        before(() => {
          abortOutput = helper.command.mergeAbortLane('-x');
        });
        it('should indicate that a component has been added', () => {
          expect(abortOutput).to.have.string('have been added');
        });
        it('should add the previously removed component', () => {
          expect(path.join(helper.scopes.localPath, 'comp2')).to.be.a.directory();
        });
      });
    });
  });
  describe('soft remove on lane when a forked lane changed it (diverged) and is now merging this lane', () => {
    let beforeRemoveScope: string;
    let beforeMerge: string;
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeRemoveScope = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.softRemoveOnLane('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(beforeRemoveScope);
      helper.command.snapComponentWithoutBuild('comp2', '--unmodified');
      helper.command.fetchAllLanes();
      beforeMerge = helper.scopeHelper.cloneLocalScope();
    });
    describe('when merging with auto-snap', () => {
      before(() => {
        output = helper.command.mergeLane('lane-a', '-x');
      });
      it('should indicate that the component was removed', () => {
        expect(output).to.have.string('the following 1 component(s) have been removed');
      });
      it('should remove the soft-removed component from .bitmap', () => {
        const list = helper.command.list();
        expect(list).to.not.have.string('comp2');
      });
      it('should remove the component files from the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'comp2')).to.not.be.a.path();
      });
      it('should leave the component on the lane and update it according to lane-a to make it soft-removed in lane-b as well', () => {
        const laneComps = helper.command.catLane('lane-b');
        const comps = laneComps.components.map((c) => c.id.name);
        expect(comps).to.include('comp2');
      });
      it('bit show should show the component as removed', () => {
        const removeData = helper.command.showAspectConfig('comp2', Extensions.remove);
        expect(removeData.config.removed).to.be.true;
      });
      it('bit status should show the component as staged', () => {
        const status = helper.command.statusJson();
        const staged = status.stagedComponents.map((c) => c.id);
        expect(staged).to.include(`${helper.scopes.remote}/comp2`);
      });
    });
    describe('when merging with --no-snap', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeMerge);
        output = helper.command.mergeLane('lane-a', '-x --no-snap');
      });
      it('bit status should not show the component as soft-removed from remote', () => {
        const status = helper.command.statusJson();
        expect(status.remotelySoftRemoved).to.have.lengthOf(0);
      });
      it('should not remove the component from the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'comp2')).to.be.a.directory();
      });
      describe('snapping the components', () => {
        let snapOutput: string;
        before(() => {
          snapOutput = helper.command.snapAllComponentsWithoutBuild();
        });
        it('should indicate that components were removed', () => {
          expect(snapOutput).to.have.string('removed components');
        });
        it('should remove the soft-removed component from .bitmap', () => {
          const list = helper.command.list();
          expect(list).to.not.have.string('comp2');
        });
        it('should remove the component files from the filesystem', () => {
          expect(path.join(helper.scopes.localPath, 'comp2')).to.not.be.a.path();
        });
        it('should leave the component on the lane and update it according to lane-a to make it soft-removed in lane-b as well', () => {
          const laneComps = helper.command.catLane('lane-b');
          const comps = laneComps.components.map((c) => c.id.name);
          expect(comps).to.include('comp2');
        });
        it('bit show should show the component as removed', () => {
          const removeData = helper.command.showAspectConfig('comp2', Extensions.remove);
          expect(removeData.config.removed).to.be.true;
        });
        it('bit status should show the component as staged', () => {
          const status = helper.command.statusJson();
          const staged = status.stagedComponents.map((c) => c.id);
          expect(staged).to.include(`${helper.scopes.remote}/comp2`);
        });
      });
    });
  });
  describe('soft remove on lane when a forked lane does not have this comp and is merging this lane', () => {
    let laneBws: string;
    let output: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      laneBws = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.softRemoveOnLane('bar/foo');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(laneBws);
      output = helper.command.mergeLane('lane-a', '-x --verbose');
    });
    it('should show why the component was not merged when using --verbose flag', () => {
      expect(output).to.have.string('component has been removed');
    });
    it('should not bring the marked-removed component to the workspace', () => {
      const list = helper.command.list();
      expect(list).to.not.have.string('bar');
    });
    it('should not bring the marked-removed component to the lane', () => {
      const laneComps = helper.command.catLane('lane-b');
      const comps = laneComps.components.map((c) => c.id.name);
      expect(comps).to.not.include('bar/foo');
    });
  });
  describe('soft remove on lane when another user of the same lane is checking out head', () => {
    let beforeRemoveScope: string;
    let output: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeRemoveScope = helper.scopeHelper.cloneLocalScope();
      helper.command.softRemoveOnLane('comp2');
      helper.fs.outputFile('comp1/index.js', '');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(beforeRemoveScope);
      helper.command.import();
      output = helper.command.checkoutHead('-x');
    });
    it('should indicate that the component was removed', () => {
      expect(output).to.have.string('the following 1 component(s) have been removed');
    });
    it('should remove the soft-removed component from .bitmap', () => {
      const list = helper.command.list();
      expect(list).to.not.have.string('comp2');
    });
    it('should remove the component files from the filesystem', () => {
      expect(path.join(helper.scopes.localPath, 'comp2')).to.not.be.a.path();
    });
  });
  describe('exporting a lane after snapping and then removing a component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.removeComponent('comp1');
      helper.command.export();
    });
    // previously in older bit versions, it used to leave the removed-component with the snapped version in the lane-object.
    // the export was pushing this object to the remote, and then when importing, the snapped-version was missing.
    it('should be able to import the lane with no errors', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      expect(() => helper.command.importLane('dev')).to.not.throw();
    });
  });
  describe('soft remove on lane-a, then re-creating the component on lane-b', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.softRemoveOnLane('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-b');
    });
    it('the forked lane should not include the soft-removed components', () => {
      // don't use this `const lane = helper.command.showOneLaneParsed('lane-b');` as it filters out removed-components already.
      // cat-lane shows the real object.
      const lane = helper.command.catLane('lane-b');
      expect(lane.components).to.have.lengthOf(1);
    });
  });
  describe('remove on lane with --update-main then merge to main', () => {
    let localWs: string;
    let remoteScope: string;
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.softRemoveOnLane('comp1', '--update-main');
      helper.command.snapAllComponentsWithoutBuild();
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      localWs = helper.scopeHelper.cloneLocalScope();
      remoteScope = helper.scopeHelper.cloneRemoteScope();
    });
    describe('merge from the workspace', () => {
      before(() => {
        helper.command.switchLocalLane('main', '-x');
        helper.command.mergeLane('dev', '-x');
      });
      it('should be marked as removed on main', () => {
        const removeData = helper.command.showAspectConfig('comp1', Extensions.remove);
        expect(removeData.config.removed).to.be.true;
      });
      it('bit status should show the component as staged', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
      it('bitmap should not have the component', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.not.have.property('comp1');
      });
      describe('export and import the component to a new workspace', () => {
        before(() => {
          helper.command.export();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('comp1', '-x');
        });
        it('should show the component as removed', () => {
          const removeData = helper.command.showAspectConfig('comp1', Extensions.remove);
          expect(removeData.config.removed).to.be.true;
        });
      });
    });
    describe('merge from scope', () => {
      let bareMerge;
      let mergeOutput: string;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localWs);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
        mergeOutput = helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`);
      });
      it('should indicate in the output the new head, not the only one', () => {
        expect(mergeOutput).to.have.string(headOnLane);
        expect(mergeOutput).to.not.have.string('0.0.1');
      });
      it('should merge successfully to main', () => {
        const headOnMain = helper.command.getHead('comp1', bareMerge.scopePath);
        expect(headOnMain).to.equal(headOnLane);
      });
      it('should be marked as removed on main', () => {
        const removeData = helper.command.showAspectConfig(
          `${helper.scopes.remote}/comp1`,
          Extensions.remove,
          bareMerge.scopePath
        );
        expect(removeData.config.removed).to.be.true;
      });
    });
  });
  describe('remove on lane with --update-main then merge to another lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.softRemoveOnLane('comp1', '--update-main');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.command.mergeLane('lane-a', '-x');
    });
    it('should bring the removed component into the other lane', () => {
      const laneComps = helper.command.catLane('lane-b');
      const comps = laneComps.components.map((c) => c.id.name);
      expect(comps).to.include('comp1');
    });
    it('should be marked with removed on main', () => {
      const removeData = helper.command.showAspectConfig(`${helper.scopes.remote}/comp1`, Extensions.remove);
      expect(removeData.config.removeOnMain).to.be.true;
    });
  });
  describe('delete on a lane then merging the deleted component from main', () => {
    let onMain: string;
    let onLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      onMain = helper.scopeHelper.cloneLocalScope();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.softRemoveOnLane('comp1');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      onLane = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.getClonedLocalScope(onMain);
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(onLane);
      helper.command.mergeLane('main', '-x');
    });
    it('should not merge the deleted component although main is ahead', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
    });
  });
});
