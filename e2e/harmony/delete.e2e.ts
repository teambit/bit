import path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit delete command', function () {
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  /**
   * comp1 -> comp2 -> comp3
   * deleting comp2 and comp3, now comp1 has a missing dependency, installing comp2 as a package from main.
   * all should be fine now. however, when snapping, it used to check for issues also the deleted components.
   * this makes sure that deleted components are not part of issues-checking for both: bit snap and bit status.
   */
  (supportNpmCiRegistryTesting ? describe : describe.skip)(
    'deleting two components which are dependency of each other then installing the missing dep',
    () => {
      let output: string;
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fixtures.populateComponents(3);
        npmCiRegistry = new NpmCiRegistry(helper);
        npmCiRegistry.configureCiInPackageJsonHarmony();
        await npmCiRegistry.init();
        helper.command.tagAllComponents();
        helper.command.export();
        helper.command.createLane();
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();
        helper.command.softRemoveOnLane('comp3');
        output = helper.command.softRemoveOnLane('comp2');
        helper.command.install(helper.general.getPackageNameByCompName('comp2'));
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('bit status should not show RemovedDependencies issues', () => {
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.RemovedDependencies.name);
      });
      it('bit snap should not fail due to removedDependencies error, also it should save the correct dep version', () => {
        expect(() => helper.command.snapAllComponentsWithoutBuild()).not.to.throw();

        const catComp1 = helper.command.catComponent('comp1@latest');
        expect(catComp1.dependencies[0].id.name).to.equal('comp2');
        expect(catComp1.dependencies[0].id.version).to.equal('0.0.1');
      });
      it('bit snap output should be relevant for lanes when --lane command used', () => {
        expect(output).to.not.have.string('will mark the component as deleted');
      });
    }
  );
  describe('import a scope with deleted components', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.deleteComponent('comp1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('*', '-x');
    });
    it('should not include deleted components', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });
    describe('importing the deleted component explicitly', () => {
      before(() => {
        helper.command.importComponent('comp1', '-x');
      });
      it('should import successfully', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(3);
      });
    });
  });
  describe('bit checkout reset after local delete', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.deleteComponent('comp1');

      // make sure it's deleted
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);

      helper.command.checkoutReset('--all');
    });
    it('should bring the component back', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(3);
    });
  });
  describe('bit checkout head after local delete', () => {
    let beforeUpdates: string;
    let checkoutOutput: string;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      beforeUpdates = helper.scopeHelper.cloneWorkspace();

      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(beforeUpdates);

      helper.command.deleteComponent('comp1');
      // make sure it's deleted
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);

      checkoutOutput = helper.command.checkoutHead('-x');
    });
    it('should checkout also the deleted component same as it checks out any other modified component', () => {
      expect(checkoutOutput).to.have.string('successfully switched 3 components');
    });
    it('should write the deleted component files to the filesystem', () => {
      const comp1Dir = path.join(helper.scopes.localPath, 'comp1');
      expect(comp1Dir).to.be.a.directory();
    });
    it('bit status should still show the component as deleted', () => {
      const status = helper.command.statusJson();
      expect(status.locallySoftRemoved).to.have.lengthOf(1);
    });
  });
  describe('deleted component that is also diverged (merge pending)', () => {
    let beforeUpdates: string;
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeUpdates = helper.scopeHelper.cloneWorkspace();

      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(beforeUpdates);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');

      helper.command.deleteComponent('comp1');
      // make sure it's deleted
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);

      helper.command.import();
    });
    describe('bit checkout head', () => {
      let checkoutOutput: string;
      before(() => {
        checkoutOutput = helper.general.runWithTryCatch('bit checkout head comp1');
      });
      it('should block the checkout as any other diverged component', () => {
        expect(checkoutOutput).to.have.string('comp1');
        expect(checkoutOutput).to.have.string('component is merge-pending and cannot be checked out');
      });
    });
    describe('bit status', () => {
      it('should show the component as both, deleted and merge-pending', () => {
        const status = helper.command.statusJson();
        expect(status.locallySoftRemoved).to.have.lengthOf(1);
        expect(status.mergePendingComponents).to.have.lengthOf(3);
      });
    });
    describe('bit reset', () => {
      before(() => {
        helper.command.reset('comp1');
      });
      it('should reset the component successfully', () => {
        const status = helper.command.statusJson();
        expect(status.mergePendingComponents).to.have.lengthOf(2);
        expect(status.locallySoftRemoved).to.have.lengthOf(1);
      });
    });
  });
  describe('delete specific snaps', () => {
    let firstSnapHash: string;
    let secondSnapHash: string;
    let beforeDeleting: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      firstSnapHash = helper.command.getHead('comp2');

      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      secondSnapHash = helper.command.getHead('comp2');
      beforeDeleting = helper.scopeHelper.cloneWorkspace();
      helper.command.deleteComponent('comp2', `--snaps "${firstSnapHash}"`);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should not show the current snap as deleted', () => {
      const deletionData = helper.command.showComponentParsedHarmonyByTitle('comp2', 'removed');
      expect(deletionData.removed).to.be.false;
      expect(deletionData.snaps).to.include(firstSnapHash);
    });
    it('should show the specific snap as deleted in bit log', () => {
      const log = helper.command.logParsed('comp2');
      const deletedSnap = log.find((l) => l.hash === firstSnapHash);
      expect(deletedSnap.deleted).to.be.true;

      const notDeletedSnap = log.find((l) => l.hash === secondSnapHash);
      expect(notDeletedSnap.deleted).to.be.false;
    });
    it('bit list should show the component, because it is not deleted in head', () => {
      const list = helper.command.listParsed();
      const comp2 = list.find((c) => c.id === `${helper.scopes.remote}/comp2`);
      expect(comp2).to.be.ok;
    });
    it('recovering the component should remove the snaps data', () => {
      helper.command.recover('comp2');

      const deletionData = helper.command.showComponentParsedHarmonyByTitle('comp2', 'removed');
      expect(deletionData.removed).to.be.false;
      expect(deletionData).to.not.have.property('snaps');
    });
    describe('multiple snaps deletion', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeDeleting);

        // Delete both snaps using comma-separated list
        helper.command.deleteComponent('comp2', `--snaps "${firstSnapHash},${secondSnapHash}"`);
        helper.command.snapAllComponentsWithoutBuild();
      });
      it('should mark multiple snaps as deleted', () => {
        const log = helper.command.logParsed('comp2');
        const firstSnap = log.find((l) => l.hash === firstSnapHash);
        const secondSnap = log.find((l) => l.hash === secondSnapHash);

        expect(firstSnap.deleted).to.be.true;
        expect(secondSnap.deleted).to.be.true;
      });
    });
    describe('importing deleted snaps', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
      });
      it('should show deleted status for the specific snap when imported', () => {
        const output = helper.command.importComponent(`comp2@${firstSnapHash}`, '-x --override');
        expect(output).to.have.string('deleted');
      });
      it('should not show deleted status for non-deleted snaps', () => {
        const output = helper.command.importComponent(`comp2@${secondSnapHash}`, '-x --override');
        expect(output).to.not.have.string('deleted');
      });
    });
  });
  describe('delete previous versions', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.tagAllWithoutBuild();
      helper.command.deleteComponent('comp2', '--range 0.0.1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    it('should not show the current version as deleted', () => {
      const deletionData = helper.command.showComponentParsedHarmonyByTitle('comp2', 'removed');
      expect(deletionData.removed).to.be.false;
      expect(deletionData.range).to.equal('0.0.1');
    });
    it('should show the previous version as deleted', () => {
      const deletionData = helper.command.showComponentParsedHarmonyByTitle('comp2@0.0.1', 'removed');
      expect(deletionData.removed).to.be.true;
      expect(deletionData.range).to.equal('0.0.1');
    });
    it('bit log should show only 0.0.1 as deleted', () => {
      const log = helper.command.logParsed('comp2');
      const logOf0_0_1 = log.find((l) => l.tag === '0.0.1');
      expect(logOf0_0_1.deleted).to.be.true;
      const logOf0_0_2 = log.find((l) => l.tag === '0.0.2');
      expect(logOf0_0_2.deleted).to.be.false;
    });
    it('bit list should show the component, because it is not deleted in head', () => {
      const list = helper.command.listParsed();
      const comp2 = list.find((c) => c.id === `${helper.scopes.remote}/comp2`);
      expect(comp2).to.be.ok;
    });
    it('recovering the component should remove the range data', () => {
      helper.command.recover('comp2');

      const deletionData = helper.command.showComponentParsedHarmonyByTitle('comp2@0.0.1', 'removed');
      expect(deletionData.removed).to.be.false;
      expect(deletionData).to.not.have.property('range');
    });
    describe('importing the component', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
      });
      it('import the latest version should not show the deleted message', () => {
        const output = helper.command.importComponent('comp2', '-x');
        expect(output).to.not.have.string('deleted');
      });
      it('import the previous version should show the deleted message', () => {
        const output = helper.command.importComponent('comp2@0.0.1', '-x --override');
        expect(output).to.have.string('deleted');
      });
    });
  });
  describe('deleting with --range when it overlaps the current version', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.deleteComponent('comp1', '--range "<1.0.0"');
      helper.command.tagAllWithoutBuild();
    });
    it('should show the component as deleted', () => {
      const deletionData = helper.command.showComponentParsedHarmonyByTitle('comp1', 'removed');
      expect(deletionData.removed).to.be.true;
      expect(deletionData.range).to.equal('<1.0.0');
    });
    it('when the range is outside the current version it should not show as deleted', () => {
      helper.command.tagAllWithoutBuild('--ver 2.0.0 --unmodified');
      const deletionData = helper.command.showComponentParsedHarmonyByTitle('comp1', 'removed');
      expect(deletionData.removed).to.be.false;
    });
  });
  describe('reset after delete on lane', () => {
    let output: string;
    let bitmapEntryBefore: Record<string, any>;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.createLane();
      helper.command.snapAllComponents();
      helper.command.export();

      helper.command.softRemoveOnLane('comp1');
      const bitmap = helper.bitMap.read();
      bitmapEntryBefore = bitmap.comp1;
      helper.command.snapAllComponents('--unmodified');
      output = helper.command.resetAll();
    });
    it('should reset the deleted component', () => {
      expect(output).to.have.string('2 component(s) were reset');
    });
    it('should revert the .bitmap entry of the deleted component as it was before', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1).to.deep.equal(bitmapEntryBefore);
    });
  });
  describe('deleting component then creating a new one with the same name', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
    });
    it('should throw a descriptive error', () => {
      const err = helper.general.runWithTryCatch('bit export');
      expect(err).to.include('were marked as deleted on the remote scope');
    });
  });
  describe('delete and then remove', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.deleteComponent('comp1');
      helper.command.tagAllWithoutBuild();
      helper.command.importComponent('comp1', '-x');
      helper.command.removeComponent('comp1');
    });
    // previously, it was throwing "error: component "012240bb-remote/comp1@0.0.2" was not found"
    // because the entry was still in ".bit/staged-config/main.json".
    it('bit status should not throw an error', () => {
      expect(() => helper.command.status()).not.to.throw();
    });
  });
});
