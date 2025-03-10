import chai, { expect } from 'chai';
import path from 'path';
import { Helper, DEFAULT_OWNER, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('eject components with dependencies after export', () => {
    let npmCiRegistry: NpmCiRegistry;
    let scopeWithoutOwner: string;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      scopeWithoutOwner = helper.scopes.remoteWithoutOwner;
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.removeRemoteScope();
      npmCiRegistry.setResolver();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('eject with the default options', () => {
      let ejectOutput: string;
      before(() => {
        ejectOutput = helper.command.ejectFromLane('comp1');
      });
      it('should indicate that the eject was successful', () => {
        expect(ejectOutput).to.have.string('successfully ejected');
      });
      it('should save the component in workspace.jsonc', () => {
        const workspaceJson = helper.workspaceJsonc.read();
        expect(workspaceJson['teambit.dependencies/dependency-resolver'].policy.dependencies).to.have.property(
          `@${DEFAULT_OWNER}/${scopeWithoutOwner}.comp1`
        );
      });
      it('should mark the component as deleted on the lane', () => {
        const status = helper.command.statusJson();
        expect(status.locallySoftRemoved).to.have.lengthOf(1);
      });
      it('should have the component files as a package (in node_modules)', () => {
        const fileInPackage = path.join(`node_modules/@${DEFAULT_OWNER}`, `${scopeWithoutOwner}.comp1`, 'index.js');
        expect(path.join(helper.scopes.localPath, fileInPackage)).to.be.a.path();
      });
      it('should delete the original component files from the file-system', () => {
        expect(path.join(helper.scopes.localPath, 'comp1')).not.to.be.a.path();
      });
      it('bit status should show no issues', () => {
        helper.command.expectStatusToNotHaveIssues();
      });
      it('should not delete the objects from the scope', () => {
        const listScope = helper.command.listLocalScopeParsed('--scope');
        const ids = listScope.map((l) => l.id);
        expect(ids).to.include(`${helper.scopes.remote}/comp1`);
      });
    });
  });
  describe('eject when there is no main version', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should throw an error saying it has no main version', () => {
      const error = helper.general.runWithTryCatch('bit lane eject comp1');
      expect(error).to.have.string('it has no main version');
    });
  });
});
