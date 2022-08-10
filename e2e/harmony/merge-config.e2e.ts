import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe.only('merge config scenarios', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('diverge with different component versions', () => {
    let npmCiRegistry: NpmCiRegistry;
    let beforeDiverge: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      beforeDiverge = helper.scopeHelper.cloneLocalScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(3, undefined, 'on-lane');
      helper.command.deprecateComponent('comp1');
      helper.command.snapAllComponents();
      helper.command.export();
      helper.command.publish('"**"');

      helper.scopeHelper.getClonedLocalScope(beforeDiverge);
      helper.fixtures.populateComponents(3, undefined, 'v2');
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      npmCiRegistry.setResolver();
      helper.command.importComponent('comp1');
      helper.command.switchRemoteLane('dev', undefined, false);
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    it('should not show the component as modified', () => {
      expect(helper.command.statusComponentIsModified('comp1')).to.be.false;
    });
    it('should be able to install the correct versions after deleting node-modules', () => {
      helper.fs.deletePath('node_modules');
      expect(() => helper.command.install()).not.to.throw('No matching version found');
    });
    describe('merge from main to the lane', () => {
      before(() => {
        helper.command.mergeLane('main', '--manual');
      });
      // previous bug, showed only comp1 as componentsDuringMergeState, but the rest, because they're not in the
      // workspace, it didn't merge them correctly.
      it('bit status should show all components as componentsDuringMergeState and not in pendingUpdatesFromMain', () => {
        const status = helper.command.statusJson();
        expect(status.componentsDuringMergeState).to.have.lengthOf(3);
        expect(status.pendingUpdatesFromMain).to.have.lengthOf(0);
      });
    });
  });
});
