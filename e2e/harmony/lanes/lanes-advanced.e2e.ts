import chai, { expect } from 'chai';
import { InvalidScopeName } from '@teambit/legacy-bit-id';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes advanced', function () {
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
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
      helper.command.renameLane('new-dev');
    });
    it('should successfully rename the lane and update .bitmap file', () => {
      const currentLane = helper.command.showOneLaneParsed('new-dev');
      expect(currentLane.name).to.equal('new-dev');
    });
    it('should export successfully under the new name', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
    describe('making changes to components and export', () => {
      before(() => {
        helper.fixtures.populateComponents(1, undefined, 'version2');
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });
      it('should successfully update the lane under the new name', () => {
        const lanesList = helper.command.listRemoteLanesParsed();
        const newLane = lanesList.lanes.find((lane) => lane.name === 'new-dev');
        expect(newLane).to.exist;
        expect(newLane.components).to.have.lengthOf(1);
      });
    });
  });
  describe('export on main then on a lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should export both main and lane versions successfully', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(1);
      expect(remoteLanes.lanes[0].name).to.equal('dev');
    });
    describe('importing the component from main', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp1');
      });
      it('should import the tagged version from main', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp1.version).to.equal('0.0.1');
      });
    });
  });
  describe('deleting the local scope after exporting a lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.import();
    });
    it('should be able to import the lane and work normally', () => {
      expect(() => helper.command.status()).to.not.throw();
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });
  describe('change-scope', () => {
    describe('when the lane is exported', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.createLane();
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
        const { scopeName } = helper.scopeHelper.getNewBareScope();
        helper.command.changeLaneScope(scopeName);
      });
      it('should change the scope successfully', () => {
        const currentLane = helper.command.showOneLaneParsed('dev');
        expect(currentLane.scope).to.not.equal(helper.scopes.remote);
      });
    });
    describe('when the scope-name is invalid', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(1);
        helper.command.createLane();
        helper.command.snapAllComponentsWithoutBuild();
      });
      it('should throw InvalidScopeName error', () => {
        const changeScopeFn = () => helper.command.changeLaneScope('Invalid-Scope');
        expect(changeScopeFn).to.throw(InvalidScopeName.name);
      });
    });
  });
  describe('checking out to a different version from main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild(); // 0.0.1
      helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.2
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.importComponent('comp1@0.0.1', '--save-in-lane'); // now the lane has it as 0.0.1
      helper.command.export();

      helper.command.checkoutVersion('0.0.2', 'comp1', '-x');

      // deleting the local scope
      helper.command.init('--reset-scope');

      helper.command.import();
    });
    it('bit import should bring the version in the bitmap', () => {
      expect(() => helper.command.catComponent(`${helper.scopes.remote}/comp1@0.0.2`)).to.not.throw();
    });
    it('bit status should not throw ComponentsPendingImport', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
  });
  describe('creating components on lanes, that do not exist on main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should create and export the lane successfully', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(1);
      expect(remoteLanes.lanes[0].components).to.have.lengthOf(1);
    });
    describe('switching to main', () => {
      before(() => {
        helper.command.switchLocalLane('main');
      });
      it('should not show the component in main', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(0);
      });
      it('should not have the component files in main', () => {
        expect(() => helper.fs.readFile('comp1/index.js')).to.throw();
      });
    });
  });
  describe('import from one lane to another directly', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false, 'lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'lane-b');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.import(`${helper.scopes.remote}/comp1:lane-a`);
    });
    it('should import the component from lane-a version', () => {
      const fileContent = helper.fs.readFile('comp1/index.js');
      expect(fileContent).to.have.string('lane-a');
      expect(fileContent).to.not.have.string('lane-b');
    });
    it('should update the component on the current lane', () => {
      const lane = helper.command.showOneLaneParsed('lane-b');
      expect(lane.components).to.have.lengthOf(1);
    });
  });
});
