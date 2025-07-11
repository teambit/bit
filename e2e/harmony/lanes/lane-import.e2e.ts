import chai, { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane import operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  (supportNpmCiRegistryTesting ? describe : describe.skip)('import with dependencies as packages', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      npmCiRegistry.setResolver();
      helper.command.importComponent('comp1');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('switching to a new lane', () => {
      before(() => {
        helper.command.createLane();
      });
      it('should not show all components are staged', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });

  describe('update components from remote lane', () => {
    let afterFirstExport: string;
    let remoteAfterSecondExport: string;
    let beforeSecondExport: string;
    let remoteBeforeSecondExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      afterFirstExport = helper.scopeHelper.cloneWorkspace();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      beforeSecondExport = helper.scopeHelper.cloneWorkspace();
      remoteBeforeSecondExport = helper.scopeHelper.cloneRemoteScope();
      helper.command.export();
      remoteAfterSecondExport = helper.scopeHelper.cloneRemoteScope();
    });
    describe('running "bit import" when the local is behind', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstExport);
        helper.command.import();
      });
      it('bit import should not only bring the components but also merge the lane object', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.equal(headOnRemoteLane);
      });
      it('bit status should show the components as pending-updates', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(1);
      });
      it('bit checkout head --all should update them all to the head version', () => {
        helper.command.checkoutHead('--all');
        helper.command.expectStatusToBeClean();
      });
    });
    describe('running "bit import" when the remote is behind', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeSecondExport);
        helper.scopeHelper.getClonedRemoteScope(remoteBeforeSecondExport);
        helper.command.import();
      });
      it('bit import should not change the heads with the older snaps', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.not.equal(headOnRemoteLane);
      });
      it('bit status should still show the components as staged', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });
    describe('running "bit import" when the remote and the local have diverged', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(afterFirstExport);
        // it's imported, otherwise the auto-import brings the second snap from the remote
        helper.scopeHelper.getClonedRemoteScope(remoteBeforeSecondExport);
        helper.fixtures.populateComponents(1, undefined, 'v3');
        helper.command.snapAllComponentsWithoutBuild();
        helper.scopeHelper.getClonedRemoteScope(remoteAfterSecondExport);
        helper.command.import();
      });
      it('bit import should not change the heads with the older snaps', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.not.equal(headOnRemoteLane);
      });
      it('bit status should show the components as pending-merge', () => {
        const status = helper.command.statusJson();
        expect(status.mergePendingComponents).to.have.lengthOf(1);
      });
      it('bit merge with no args should merge them', () => {
        const output = helper.command.merge(`--manual`);
        expect(output).to.have.string('successfully merged');
        expect(output).to.have.string('CONFLICT');
      });
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
});
