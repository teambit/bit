import chai, { expect } from 'chai';
import { IMPORT_PENDING_MSG } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes import and export operations', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('export on main then on a lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // simulate cloning the project and coping scope.json to be checked out to the lane
      const scopeJson = helper.scopeJson.read();
      helper.fs.deletePath('.bit');
      helper.command.init();
      helper.scopeJson.write(scopeJson);

      helper.command.import();
    });
    it('bit status should not complain about outdated objects', () => {
      const status = helper.command.status();
      expect(status).to.not.have.string(IMPORT_PENDING_MSG);
    });
  });

  describe('deleting the local scope after exporting a lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
      helper.fs.deletePath('.bit');
      helper.command.init();
      helper.scopeHelper.addRemoteScope();
    });
    it('should re-create scope.json with checkout to the lane specified in the .bitmap file', () => {
      helper.command.expectCurrentLaneToBe('dev');
    });
    // previously, it used to throw "component X has no versions and the head is empty"
    it('bit import should not throw an error', () => {
      expect(() => helper.command.import()).to.not.throw();
    });
  });

  describe('some components are on a lane some are not', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit list should not show components from the lanes', () => {
      const list = helper.command.listRemoteScopeParsed();
      expect(list).to.have.lengthOf(1);
    });
    it('bit import should not throw', () => {
      expect(() => helper.command.importComponent('*')).to.not.throw();
    });
  });

  describe('export on lane with tiny cache', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.runCmd('bit config set cache.max.objects 1');
    });
    after(() => {
      helper.command.runCmd('bit config del cache.max.objects');
    });
    // previously, it was throwing "HeadNotFound"/"ComponentNotFound" when there were many objects in the cache
    it('should not throw', () => {
      expect(() => helper.command.export()).not.to.throw();
    });
  });

  describe('export multiple snaps on lane when the remote has it already', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      // the second snap is mandatory, don't skip it.
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    // previously, it was throwing ParentNotFound
    it('bit export should not throw ParentNotFound', () => {
      expect(() => helper.command.export()).not.to.throw();
    });
  });

  describe('import from one lane to another directly', () => {
    let headOnLaneB: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'from-lane-b');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.switchLocalLane('lane-a', '-x');
      helper.fixtures.populateComponents(1, false, 'from-lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should block the import', () => {
      expect(() => helper.command.importComponent(`comp1@${headOnLaneB}`)).to.throw(
        `unable to import the following component(s) as they belong to other lane(s)`
      );
    });
  });

  describe('import from a lane to main', () => {
    let headOnLaneA: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
    });
    it('should block the import', () => {
      expect(() => helper.command.importComponent(`comp1@${headOnLaneA}`)).to.throw(
        `unable to import the following component(s) as they belong to other lane(s)`
      );
    });
  });

  describe('import from one lane to another directly when current lane does not have the component', () => {
    let headOnLaneA: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
    });
    it('should block the import', () => {
      expect(() => helper.command.importComponent(`comp1@${headOnLaneA}`)).to.throw(
        `unable to import the following component(s) as they belong to other lane(s)`
      );
    });
  });

  describe('import from one lane to another directly when current lane does have the component', () => {
    let headOnLaneA: string;
    let headOnLaneB: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const laneAWs = helper.scopeHelper.cloneWorkspace();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`, '-x');
      helper.command.export();
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      const laneBWs = helper.scopeHelper.cloneWorkspace();
      helper.scopeHelper.getClonedWorkspace(laneAWs);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.scopeHelper.getClonedWorkspace(laneBWs);
    });
    // previously, it was quietly importing the component from the current lane and ignores the provided version.
    it('should not bring that snap', () => {
      const output = helper.command.importComponent(`comp1@${headOnLaneA}`, '--override');
      expect(output).to.have.string('Missing Components');
    });
    it('should not not change .bitmap', () => {
      const bitMap = helper.bitMap.read();
      const bitMapVer = bitMap.comp1.version;
      expect(bitMapVer).to.equal(headOnLaneB);
    });
  });
});
