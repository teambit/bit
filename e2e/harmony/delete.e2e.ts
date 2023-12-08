import { IssuesClasses } from '@teambit/component-issues';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

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
        helper.command.softRemoveOnLane('comp2');
        helper.command.install(helper.general.getPackageNameByCompName('comp2'));
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('bit status should not show RemovedDependencies issues', () => {
        helper.command.expectStatusToNotHaveIssue(IssuesClasses.RemovedDependencies.name);
      });
      it('bit snap should fail due to removedDependencies error', () => {
        expect(() => helper.command.snapAllComponentsWithoutBuild()).not.to.throw();
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
});
