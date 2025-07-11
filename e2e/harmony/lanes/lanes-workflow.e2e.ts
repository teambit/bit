import chai, { expect } from 'chai';
import { InvalidScopeName } from '@teambit/legacy-bit-id';
import { AUTO_SNAPPED_MSG } from '@teambit/legacy.constants';
import { NpmCiRegistry, supportNpmCiRegistryTesting, Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes workflow operations', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('exporting a lane to a different scope than the component scope', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const { scopePath } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.createLane('dev', `--scope ${scopePath}`);
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should export to the lane scope and not to the component scope', () => {
      const list = helper.command.listRemoteScopeParsed();
      expect(list).to.have.lengthOf(1);
    });
  });

  describe('branching out when a component is checked out to an older version', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.checkoutVersion('0.0.1', 'comp1');
      helper.command.createLane();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
    });
    it('should checkout to the head of the origin branch', () => {
      const comp1 = helper.command.catComponent('comp1');
      expect(comp1.head).to.equal('0.0.2');
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    // previously, the behavior was to checkout to the same version it had before
    it.skip('should checkout to the same version the origin branch had before the switch', () => {
      const showComp = helper.command.showComponent('comp1');
      expect(showComp).to.have.string('0.0.1');
    });
    // previously, the behavior was to checkout to the same version it had before
    it.skip('bit status should not show the component as modified only as pending update', () => {
      const status = helper.command.statusJson();
      expect(status.outdatedComponents).to.have.lengthOf(1);
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
  });

  describe('snap on lane, export, clear project, snap and export', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('should export with no errors about missing artifact files from the first snap', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('auto-snap when on a lane', () => {
    let snapOutput;
    let comp3Head;
    let comp2Head;
    let comp1Head;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.fs.outputFile('comp3/index.js', 'console.log("v2")');
      snapOutput = helper.command.snapAllComponentsWithoutBuild();
      comp3Head = helper.command.getHeadOfLane('dev', 'comp3');
      comp2Head = helper.command.getHeadOfLane('dev', 'comp2');
      comp1Head = helper.command.getHeadOfLane('dev', 'comp1');
    });
    it('should auto snap the dependencies and the nested dependencies', () => {
      expect(snapOutput).to.have.string(AUTO_SNAPPED_MSG);
      expect(snapOutput).to.have.string('comp2');
      expect(snapOutput).to.have.string('comp1');
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const comp2 = helper.command.catComponent(`comp2@${comp2Head}`, helper.scopes.remotePath);
      const comp3Dep = comp2.dependencies.find((dep) => dep.id.name === 'comp3');
      expect(comp3Dep.id.version).to.equal(comp3Head);
      const comp3FlattenedDep = comp2.flattenedDependencies.find((dep) => dep.name === 'comp3');
      expect(comp3FlattenedDep.version).to.equal(comp3Head);
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const comp1 = helper.command.catComponent(`comp1@${comp1Head}`, helper.scopes.remotePath);
      const comp2Dep = comp1.dependencies.find((dep) => dep.id.name === 'comp2');
      expect(comp2Dep.id.version).to.equal(comp2Head);
      const comp2FlattenedDep = comp1.flattenedDependencies.find((dep) => dep.name === 'comp2');
      expect(comp2FlattenedDep.version).to.equal(comp2Head);
      const comp3FlattenedDep = comp1.flattenedDependencies.find((dep) => dep.name === 'comp3');
      expect(comp3FlattenedDep.version).to.equal(comp3Head);
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(3);
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
  });

  (supportNpmCiRegistryTesting ? describe : describe.skip)('import with dependencies as packages', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      helper.command.install();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('switching to a new lane', () => {
      before(() => {
        helper.command.createLane('lane-b');
      });
      it('should not show the component as modified', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });

  describe('snapping and un-tagging on a lane', () => {
    let afterFirstSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      afterFirstSnap = helper.scopeHelper.cloneWorkspace();
      helper.command.resetAll();
    });
    it('bit lane show should not show the component as belong to the lane anymore', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(0);
    });
    // a previous bug kept the WorkspaceLane object as is with the previous, untagged version
    it('bit list should not show the currentVersion as the untagged version', () => {
      const list = helper.command.listParsed();
      expect(list[0].currentVersion).to.equal('N/A');
    });
    describe('switching to main', () => {
      before(() => {
        helper.command.switchLocalLane('main');
      });
      it('bit status should show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(1);
      });
    });
    describe('add another snap and then untag only the last snap', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstSnap);
        helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
        helper.command.reset('comp1', true);
      });
      it('should not show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(0);
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });
    describe('un-snap by specifying the component name', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstSnap);
      });
      // a previous bug was showing "unable to untag comp1, the component is not staged" error.
      it('should not throw an error', () => {
        expect(() => helper.command.reset('comp1')).to.not.throw();
      });
    });
  });

  describe('bit checkout to a previous snap', () => {
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      firstSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapComponentWithoutBuild('comp1');
      secondSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.checkoutVersion(firstSnap, 'comp1');
    });
    it('should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    it('bit list should show the scope-version as latest and workspace-version as the checked out one', () => {
      const list = helper.command.listParsed();
      const comp1 = list[0];
      expect(comp1.currentVersion).to.equal(firstSnap);
      expect(comp1.localVersion).to.equal(secondSnap);
    });
  });

  describe('head on the lane is not in the filesystem', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.fs.deletePath('.bit');
      helper.command.init();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).not.to.throw();
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

  describe('getting new components from the lane', () => {
    let firstWorkspaceAfterExport: string;
    let secondWorkspace: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const firstWorkspace = helper.scopeHelper.cloneWorkspace();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev');
      secondWorkspace = helper.scopeHelper.cloneWorkspace();
      helper.scopeHelper.getClonedWorkspace(firstWorkspace);
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      firstWorkspaceAfterExport = helper.scopeHelper.cloneWorkspace();
      helper.scopeHelper.getClonedWorkspace(secondWorkspace);
    });
    it('bit checkout with --workspace-only flag should not add the component and should suggest omitting --workspace-only flag', () => {
      const output = helper.command.checkoutHead('--skip-dependency-installation --workspace-only');
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
      expect(output).to.have.string('omit --workspace-only flag to add them');
    });
    it('bit checkout without --workspace-only flag should add the new components', () => {
      helper.command.checkoutHead('--skip-dependency-installation');
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });
    describe('when the new component is soft-removed', () => {
      let beforeCheckout: string;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(firstWorkspaceAfterExport);
        helper.command.softRemoveOnLane('comp2');
        helper.fs.writeFile('comp1/index.js', ''); // remove the comp2 dependency from the code
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
        helper.scopeHelper.getClonedWorkspace(secondWorkspace);
        helper.command.import();
        beforeCheckout = helper.scopeHelper.cloneWorkspace();
      });
      it('bit checkout with --workspace-only flag, should not suggest omitting it', () => {
        const output = helper.command.checkoutHead('--skip-dependency-installation');
        expect(output).to.not.have.string('omit --workspace-only flag to add them');
        expect(output).to.not.have.string('comp2');
      });
      it('bit checkout head should not add it', () => {
        helper.scopeHelper.getClonedWorkspace(beforeCheckout);
        helper.command.checkoutHead('--skip-dependency-installation');
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
    });
  });

  describe('exporting a component on a lane when the staged snaps exist already on the remote (from another lane)', function () {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild(); // snapA
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.export();
      const laneAFirstSnap = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapX1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapX2
      helper.command.export();

      // locally
      helper.scopeHelper.getClonedWorkspace(laneAFirstSnap);
      helper.command.mergeLane('lane-a'); // now lane-b has snapA + snapB + snapX1 (from lane-a) + snapX2 (the from lane-a)
      helper.command.import();
      // keep this to fetch from all lanes, because in the future, by default, only the current lane is fetched
      helper.command.fetchAllLanes();
    });
    it('bit export should not throw', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('change-scope', () => {
    describe('when the lane is exported', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });
      it('should block the rename', () => {
        expect(() => helper.command.changeLaneScope('new-scope')).to.throw(
          'changing lane scope-name is allowed for new lanes only'
        );
      });
    });
    describe('when the scope-name is invalid', () => {
      before(() => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
      });
      it('should throw InvalidScopeName error', () => {
        const err = new InvalidScopeName('invalid.scope.name');
        const cmd = () => helper.command.changeLaneScope('invalid.scope.name');
        helper.general.expectToThrow(cmd, err);
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

  describe('create comp on a lane then same on main', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.fetchLane(`${helper.scopes.remote}/dev`);
    });
    // previously, it was throwing "getHeadRegardlessOfLaneAsTagOrHash() failed finding a head for lyq5piak-remote/comp1"
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
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
