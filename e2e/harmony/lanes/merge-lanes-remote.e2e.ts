import chai, { expect } from 'chai';
import path from 'path';
import { DEFAULT_LANE } from '@teambit/lane-id';
import { statusWorkspaceIsCleanMsg } from '@teambit/legacy.constants';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('merge lanes - remote lane operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('export a local lane into a remote scope', () => {
    let authorScope;
    let importedScope;
    let appOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      appOutput = helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
      authorScope = helper.scopeHelper.cloneWorkspace();
    });

    describe('merging remote lane into main', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.mergeLane(`${helper.scopes.remote}/dev`);
      });
      it('should save the files to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal(appOutput);
      });
      it('bit status should show the components as staged', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(3);
      });
      it('bit lane should show that all components are belong to main', () => {
        const lanes = helper.command.listLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(3);
      });
      describe('exporting the components to the remote', () => {
        let exportOutput: string;
        before(() => {
          exportOutput = helper.command.export();
        });
        it('should indicate that the components were exported successfully', () => {
          expect(exportOutput).to.not.have.string('nothing to export');
        });
        it('the remote should have the updated component objects', () => {
          const comp1Id = `${helper.scopes.remote}/comp1`;
          const comp1 = helper.command.catComponent(comp1Id);
          const remoteComp1 = helper.command.catComponent(comp1Id, helper.scopes.remotePath);
          expect(remoteComp1).to.have.property('head');
          expect(remoteComp1.head).to.equal(comp1.head);
        });
      });
    });

    describe('merging remote lane into main when components are not in workspace using --workspace flag', () => {
      let mergeOutput;
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        mergeOutput = helper.command.mergeLane(`${helper.scopes.remote}/dev`, `--workspace --verbose`);
      });
      it('should indicate that the components were not merge because they are not in the workspace', () => {
        expect(mergeOutput).to.have.string('merge skipped for the following component(s)');
        expect(mergeOutput).to.have.string('not in the workspace');
      });
      it('bitmap should not save any component', () => {
        const bitMap = helper.bitMap.readComponentsMapOnly();
        expect(Object.keys(bitMap)).to.have.lengthOf(0);
      });
      it('should not save the files to the filesystem', () => {
        expect(path.join(helper.scopes.localPath, 'components/bar/foo')).to.not.be.a.path();
      });
      it('bit status should show clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit lane should not show the components as if they belong to main', () => {
        const lanes = helper.command.listLanesParsed();
        const defaultLane = lanes.lanes.find((lane) => lane.name === DEFAULT_LANE);
        expect(defaultLane.components).to.have.lengthOf(0);
      });
    });

    // in this case, the lane dev has v1 and v2 on the remote, but only v1 locally.
    // previously, it was needed `bit lane merge` to get v2 locally.
    // currently, it's done by `bit import` and then `bit checkout head`.
    describe('importing a remote lane which is ahead of the local lane', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');
        importedScope = helper.scopeHelper.cloneWorkspace();
        helper.scopeHelper.getClonedWorkspace(authorScope);
        helper.fixtures.populateComponents(undefined, undefined, ' v2');
        helper.command.snapAllComponents();
        helper.command.exportLane();

        helper.scopeHelper.getClonedWorkspace(importedScope);
        helper.command.fetchRemoteLane('dev');
      });
      it('bit status should show all components as pending update', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(3);
      });
      describe('merging the remote lane', () => {
        before(() => {
          helper.command.checkoutHead();
        });
        it('should save the latest versions from the remote into the local', () => {
          helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('comp1 v2 and comp2 v2 and comp3 v2');
        });
        it('bit status should show clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('bit lane should show that all components are belong to the local lane', () => {
          const lane = helper.command.showOneLaneParsed('dev');
          expect(lane.components).to.have.lengthOf(3);
        });
        it('bit lane --merged should not show the lane as it was not merged into main yet', () => {
          const merged = helper.command.listLanes('--merged');
          expect(merged).to.not.have.string('dev');
          expect(merged).to.have.string('None of the lanes is merged');
        });
        it('bit lane --unmerged should show the lane', () => {
          const merged = helper.command.listLanes('--not-merged');
          expect(merged).to.have.string('dev');
          expect(merged).to.not.have.string('All lanes are merged');
        });
      });
    });

    describe('creating a new lane with the same name on a different workspace', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.command.createLane('dev');
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.snapAllComponentsWithoutBuild();
      });
      it('should not merge the two lanes on the remote, instead, it should throw', () => {
        expect(() => helper.command.export()).to.throw('unable to merge');
      });
    });
  });
});
