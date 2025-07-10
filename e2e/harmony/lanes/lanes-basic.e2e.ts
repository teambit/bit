import chai, { expect } from 'chai';
import { LANE_KEY } from '@teambit/legacy.bit-map';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes basic', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.command.createLane();
      output = helper.command.listLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string(`current lane - my-scope/dev`);
      expect(output).to.have.string('main');
    });
  });
  describe('create a snap on main then on a new lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the component only once as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.modifiedComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(0);
    });
    it('bit log should show both snaps', () => {
      const log = helper.command.log('bar/foo');
      const mainSnap = helper.command.getHead('bar/foo');
      const devSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
      expect(log).to.have.string(mainSnap);
      expect(log).to.have.string(devSnap);
    });
    it('bit log --parents should show the parents', () => {
      const log = helper.command.log('bar/foo', '--parents');
      const mainSnap = helper.command.getHeadShort('bar/foo');
      expect(log).to.have.string(`Parent(s): ${mainSnap}`);
    });
    describe('bit lane with --details flag', () => {
      let output: string;
      before(() => {
        output = helper.command.listLanes('--details');
      });
      it('should show all lanes and mark the current one', () => {
        expect(output).to.have.string(`current lane - ${helper.scopes.remote}/dev`);
      });
    });
    describe('exporting the lane', () => {
      before(() => {
        helper.command.exportLane();
      });
      it('should export components on that lane', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show a clean state', () => {
        helper.command.expectStatusToBeClean();
      });
      it('should change .bitmap to have the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY].id).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
      });
      it('bit lane --remote should show the exported lane', () => {
        const remoteLanes = helper.command.listRemoteLanesParsed();
        expect(remoteLanes.lanes).to.have.lengthOf(1);
        expect(remoteLanes.lanes[0].name).to.equal('dev');
      });
      describe('bit lane diff on the scope', () => {
        let diffOutput: string;
        before(() => {
          diffOutput = helper.command.diffLane('dev', true);
        });
        it('should show the diff correctly', () => {
          expect(diffOutput).to.have.string('--- foo.js (main)');
          expect(diffOutput).to.have.string('+++ foo.js (dev)');

          expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
          expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
        });
      });
      describe('importing the component', () => {
        before(() => {
          helper.command.importComponent('bar/foo');
        });
        it('should not set the onLaneOnly to true as it exists also on main', () => {
          const bitmap = helper.bitMap.read();
          const bitmapEntry = bitmap['bar/foo'];
          expect(bitmapEntry).to.not.have.property('onLanesOnly');
        });
      });
    });
    describe('bit lane diff on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane();
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {toLane - default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {toLane - non default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        helper.command.switchLocalLane('main');
        helper.command.createLane('stage');
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
        helper.command.snapAllComponents();

        diffOutput = helper.command.diffLane('dev');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (dev)');
        expect(diffOutput).to.have.string('+++ foo.js (stage)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo v2'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v3'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {fromLane} {toLane} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main dev');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
  });
  describe('tagging on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.createLane();
      helper.command.snapAllComponents();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      output = helper.general.runWithTryCatch('bit tag bar/foo');
    });
    it('should block the tag and suggest to switch to main and merge the changes', () => {
      expect(output).to.have.string(
        'unable to tag when checked out to a lane, please switch to main, merge the lane and then tag again'
      );
    });
  });

  describe('main => lane => main => lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
    });
    // previously it errored with "error: version "latest" of component comp1 was not found."
    it('should be able to switch back to the lane with no error', () => {
      expect(() => helper.command.switchLocalLane('dev')).to.not.throw();
    });
  });
});
