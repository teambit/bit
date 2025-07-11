import chai, { expect } from 'chai';
import { LANE_KEY } from '@teambit/legacy.bit-map';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane export operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('exporting the lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
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
        helper.command.importComponent('bar/foo');
      });
      it('should not set the onLaneOnly to true as it exists also on main', () => {
        const bitmap = helper.bitMap.read();
        const bitmapEntry = bitmap['bar/foo'];
        expect(bitmapEntry).to.not.have.property('onLanesOnly');
      });
    });
  });

  describe('exporting a lane to a different scope than the component scope', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const { scopePath, scopeName } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.createLane('dev');
      helper.command.changeLaneScope(scopeName);
      helper.fs.outputFile('comp1/comp1.spec.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit import in a new workspace should not throw an error', () => {
      expect(() => helper.command.importComponent('comp1')).not.to.throw();
    });
  });

  describe('snap on lane, export, clear project, snap and export', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope({ disablePreview: false });
      // Do not add "disablePreview()" here. It's important to generate the preview here.
      // this is the file that exists on the first snap but not on the second.
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponents();
      helper.command.exportLane();
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.import();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.workspaceJsonc.disablePreview();
      helper.command.snapAllComponents();
    });
    it('should export with no errors about missing artifact files from the first snap', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('tag on main, export, create lane and snap', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the correct staged versions', () => {
      // before it was a bug that "versions" part of the staged-component was empty
      // another bug was that it had all versions included exported.
      const status = helper.command.status('--verbose');
      const hash = helper.command.getHeadOfLane('dev', 'comp1');
      expect(status).to.have.string(`versions: ${hash} ...`);
    });
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
      expect(status).to.not.have.string('import-pending');
    });
  });

  describe('export when previous versions have deleted dependencies', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.removeComponentFromRemote(`${helper.scopes.remote}/comp3`, '--force');
      helper.command.removeComponent('comp3', '--force');
      helper.fs.outputFile('comp2/index.js', ''); // remove the dependency from the code
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('should not throw ComponentNotFound on export', () => {
      expect(() => helper.command.export()).to.not.throw();
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

  describe('export interrupted, reset, snap then import', () => {
    let beforeExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');

      beforeExport = helper.scopeHelper.cloneWorkspace();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(beforeExport);
      helper.command.resetAll();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      // previously, this import wasn't writing the .bit/refs files and as a result, it wasn't shown as merge-pending
      helper.command.import();
    });
    it('bit status should show the components as merge-pending', () => {
      const status = helper.command.statusJson();
      expect(status.mergePendingComponents).to.have.lengthOf(1);
    });
    it('bit export should fail', () => {
      expect(() => helper.command.export()).to.throw();
    });
    it('reset, checkout-head and re-snap should fix it and make it possible to export', () => {
      helper.command.resetAll();
      helper.command.checkoutHead('-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      expect(() => helper.command.export()).to.not.throw();
    });
  });
});
