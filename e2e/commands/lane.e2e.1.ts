import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { LANE_KEY } from '../../src/consumer/bit-map/bit-map';

chai.use(require('chai-fs'));

describe('bit lane command', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.createLane();
      output = helper.command.showLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string('* dev');
    });
  });
  describe('create a snap on master then on a new lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponents();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponents();
    });
    it('bit status should show the component only once as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.modifiedComponent).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(0);
    });
    describe('bit lane with --components flag', () => {
      let output: string;
      before(() => {
        output = helper.command.showLanes('--components');
      });
      it('should show all lanes and mark the current one', () => {
        expect(output).to.have.string('master');
        expect(output).to.have.string('* dev');
      });
    });
    describe('exporting the lane', () => {
      before(() => {
        helper.command.exportLane('dev');
      });
      it('should export components on that lane', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show a clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      describe('importing the lane', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importLane('dev');
        });
        it('should import components on that lane', () => {
          const list = helper.command.listLocalScopeParsed('--scope');
          expect(list).to.have.lengthOf(1);
        });
        it('bit status should show a clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
      });
      describe('importing the lane objects and switching to that lane', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importLane('dev --objects');
          helper.command.switchRemoteLane('dev');
        });
        it('should write the component to the filesystem with the same version as the lane', () => {
          const fileContent = helper.fs.readFile('components/bar/foo/foo.js');
          expect(fileContent).to.equal(fixtures.fooFixtureV2);
        });
        it('.bitmap should save the remote lane', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap[LANE_KEY]).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
        });
        it('bit lane should show the component in the checked out lane', () => {
          const lanes = helper.command.showLanesParsed();
          expect(lanes).to.have.property('dev');
          expect(lanes.dev).to.have.lengthOf(1);
          expect(lanes.dev[0].id.name).to.equal('bar/foo');
        });
        it('bit status should not show the component as pending updates', () => {
          const status = helper.command.statusJson();
          expect(status.outdatedComponents).to.have.lengthOf(0);
        });
        it('bit status should show clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('bit lane should show the checked out lane as the active one', () => {
          const lanes = helper.command.showLanes();
          expect(lanes).to.have.string('* dev');
          expect(lanes).to.not.have.string('* master');
        });
        describe('changing the component and running bit diff', () => {
          let diff;
          before(() => {
            helper.fs.outputFile('components/bar/foo/foo.js', fixtures.fooFixtureV3);
            diff = helper.command.diff();
          });
          it('should show the diff between the filesystem and the lane', () => {
            expect(diff).to.have.string("-module.exports = function foo() { return 'got foo v2'; }");
            expect(diff).to.have.string("+module.exports = function foo() { return 'got foo v3'; }");
          });
          it('should not show the diff between the filesystem and master', () => {
            expect(diff).to.not.have.string("-module.exports = function foo() { return 'got foo'; }");
          });
        });
        describe("snapping the component (so, it's an imported lane with local snaps)", () => {
          before(() => {
            helper.fs.outputFile('components/bar/foo/foo.js', fixtures.fooFixtureV3);
            helper.command.snapAllComponents();
          });
          it('bit status should show the component as staged', () => {
            const status = helper.command.statusJson();
            expect(status.stagedComponents).to.have.lengthOf(1);
          });
          it('bit status should show the staged hash', () => {
            const status = helper.command.status();
            const localSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
            expect(status).to.have.string(localSnap);
          });
        });
      });
    });
  });
  describe('create a snap on a new lane then tagged', () => {
    let lanes;
    let firstSnap;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.createLane();
      helper.command.snapAllComponents();
      firstSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagAllComponents();
      lanes = helper.command.showLanesParsed();
    });
    it('the new tag should not change the head of the lane', () => {
      expect(lanes.dev[0].id.name).to.equal('bar/foo');
      expect(lanes.dev[0].head).to.equal(firstSnap);
    });
    it('the tag should be saved globally, as master', () => {
      expect(lanes.master[0].id.name).to.equal('bar/foo');
      expect(lanes.master[0].head).to.equal('0.0.1');
    });
  });
  describe('merging lanes', () => {
    let authorScope;
    let importedScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponents();
      helper.command.exportLane('dev');
      authorScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('merging remote lane into master', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane('dev --objects');
        helper.command.merge(`${helper.scopes.remote} dev --lane`);
      });
      it('should save the files to the filesystem', () => {
        helper.fs.outputFile('app.js', fixtures.appPrintBarFoo);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('bit status should show clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      it('bit lane should show that all components are belong to master', () => {
        const lanes = helper.command.showLanesParsed();
        expect(lanes.master).to.have.lengthOf(3);
      });
    });
    describe('merging remote lane into master when components are not in workspace using --existing flag', () => {
      let mergeOutput;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane('dev --objects');
        mergeOutput = helper.command.merge(`${helper.scopes.remote} dev --lane --existing`);
      });
      it('should indicate that the components were not merge because they are not in the workspace', () => {
        expect(mergeOutput).to.have.string('the merge has been canceled on the following component(s)');
        expect(mergeOutput).to.have.string('is not in the workspace');
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
      it('bit lane should not show the components as if they belong to master', () => {
        const lanes = helper.command.showLanesParsed();
        expect(lanes.master).to.have.lengthOf(0);
      });
    });
    describe('importing a remote lane which is ahead of the local lane', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importLane('dev --objects');
        helper.command.switchRemoteLane('dev');
        importedScope = helper.scopeHelper.cloneLocalScope();

        helper.scopeHelper.getClonedLocalScope(authorScope);
        helper.fixtures.populateWorkspaceWithComponentsWithV2();
        helper.command.snapAllComponents();
        helper.command.exportLane('dev');

        helper.scopeHelper.getClonedLocalScope(importedScope);
        helper.command.importLane('dev --objects');
      });
      it('bit status should show all components as pending update', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(3);
      });
      describe('merging the remote lane', () => {
        let mergeOutput;
        before(() => {
          mergeOutput = helper.command.merge(`${helper.scopes.remote} dev --lane`);
        });
        it('should succeed', () => {
          expect(mergeOutput).to.have.string('successfully merged components');
        });
        it('should save the latest versions from the remote into the local', () => {
          helper.fs.outputFile('app.js', fixtures.appPrintBarFoo);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
        });
        it('bit status should show clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('bit lane should show that all components are belong to the local lane', () => {
          const lanes = helper.command.showLanesParsed();
          expect(lanes.dev).to.have.lengthOf(3);
        });
        it('bit lane --merged should not show the lane as it was not merged into master yet', () => {
          const merged = helper.command.showLanes('--merged');
          expect(merged).to.not.have.string('dev');
          expect(merged).to.have.string('None of the lanes is merged');
        });
        it('bit lane --unmerged should show the lane', () => {
          const merged = helper.command.showLanes('--not-merged');
          expect(merged).to.have.string('dev');
          expect(merged).to.not.have.string('All lanes are merged');
        });
      });
    });
  });
});
