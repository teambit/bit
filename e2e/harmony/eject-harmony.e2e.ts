import chai, { expect } from 'chai';
import path from 'path';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { successEjectMessage } from '../../src/cli/templates/eject-template';
import { DEFAULT_OWNER } from '../../src/e2e-helper/e2e-scopes';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('eject command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('import with dependencies as packages', () => {
    let npmCiRegistry: NpmCiRegistry;
    let scopeWithoutOwner: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.command.setFeatures(HARMONY_FEATURE);
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.removeRemoteScope();
      npmCiRegistry.setResolver();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('eject', () => {
      let ejectOutput: string;
      before(() => {
        ejectOutput = helper.command.ejectComponents('comp1');
      });
      it('should indicate that the eject was successful', () => {
        expect(ejectOutput).to.have.string(successEjectMessage);
      });
      it('should save the component in workspace.jsonc', () => {
        const workspaceJson = helper.bitJsonc.read();
        expect(workspaceJson['teambit.dependencies/dependency-resolver'].policy.dependencies).to.have.property(
          `@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`
        );
      });
      it('should have the component files as a package (in node_modules)', () => {
        const fileInPackage = path.join(`node_modules/@${DEFAULT_OWNER}`, `${scopeWithoutOwner}.comp1`, 'index.js');
        expect(path.join(helper.scopes.localPath, fileInPackage)).to.be.a.path();
      });
      // @todo: needs to make a decision what should be the default and whether should be a flag
      it.skip('should delete the original component files from the file-system', () => {
        expect(path.join(helper.scopes.localPath, 'comp1')).not.to.be.a.path();
      });
      it('should delete the component from bit.map', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.not.have.property('comp1');
      });
      it('bit status should show a clean state', () => {
        helper.command.expectStatusToBeClean();
      });
      it('should not delete the objects from the scope', () => {
        const listScope = helper.command.listLocalScopeParsed('--scope');
        const ids = listScope.map((l) => l.id);
        expect(ids).to.include(`${helper.scopes.remote}/comp1`);
      });
    });
  });
});
