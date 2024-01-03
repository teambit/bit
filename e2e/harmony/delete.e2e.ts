import path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('bit delete command', function () {
  let helper: Helper;
  let npmCiRegistry: NpmCiRegistry;
  let output: string;
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
      before(async () => {
        helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
        helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      it('bit snap should not fail due to removedDependencies error', () => {
        expect(() => helper.command.snapAllComponentsWithoutBuild()).not.to.throw();
      });
      it('bit snap output should be relevant for lanes when --lane command used', () => {
        expect(output).to.not.have.string('will mark the component as deleted');
      });
    }
  );
  describe('import a scope with deleted components', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.softRemoveComponent('comp1');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.softRemoveComponent('comp1');

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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      beforeUpdates = helper.scopeHelper.cloneLocalScope();

      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(beforeUpdates);

      helper.command.softRemoveComponent('comp1');
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeUpdates = helper.scopeHelper.cloneLocalScope();

      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(beforeUpdates);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');

      helper.command.softRemoveComponent('comp1');
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
});
