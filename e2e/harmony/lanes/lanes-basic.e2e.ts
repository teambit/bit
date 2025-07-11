import chai, { expect } from 'chai';
import { LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import { LANE_KEY } from '@teambit/legacy.bit-map';
import { fixtures, Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes basic operations', function () {
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
      describe('importing the component', () => {
        before(() => {
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should import the component from main and not from the lane', () => {
          const fooContent = helper.fs.readFile('bar/foo/foo.js');
          expect(fooContent).to.have.string('console.log("v1")');
        });
      });
    });
  });

  describe('tagging on a lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagAllWithoutBuild();
    });
    it('bit status should show the component as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
    });
  });

  describe('main => lane => main => lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.createLane();
      helper.command.switchLocalLane('main');
      helper.command.switchLocalLane('dev');
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
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
      expect(output).to.have.string(
        `the remote-scope of dev has been changed from ${helper.scopes.remote} to my-remote`
      );
    });
    it('bit lane show should show the changed values', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`my-remote${LANE_REMOTE_DELIMITER}dev`);
    });
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

  describe('creating a new lane to a different scope than main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
    });
    it('should not throw even when --fork-lane-new-scope was not used', () => {
      expect(() => helper.command.createLane('dev', '--scope some-scope')).to.not.throw();
    });
  });

  describe('creating components on lanes, that do not exist on main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('should add "onLanesOnly" prop', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.onLanesOnly).to.be.true;
    });
  });
});
