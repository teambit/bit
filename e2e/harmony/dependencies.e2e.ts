import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

describe('dependencies', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('importing component without dependencies', () => {
    let npmCiRegistry: NpmCiRegistry;
    let beforeImport: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.setResolver();
      beforeImport = helper.scopeHelper.cloneLocalScope();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper = new Helper();
    });
    describe('import without --fetch-deps', () => {
      before(() => {
        helper.command.importComponent('comp1');
      });
      it('should bring only the imported component, not its dependencies', () => {
        const scope = helper.command.catScope();
        expect(scope).to.have.lengthOf(1);
      });
      it('bit status should not bring the dependencies during find-cycle process', () => {
        helper.command.status();
        const scope = helper.command.catScope();
        expect(scope).to.have.lengthOf(1);
      });
    });
    describe('import with --fetch-deps', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeImport);
        helper.command.importComponent('comp1', '--fetch-deps');
      });
      it('should bring not only the imported component, but also its dependencies', () => {
        const scope = helper.command.catScope();
        expect(scope).to.have.lengthOf(3);
      });
    });
  });
});
