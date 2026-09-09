import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import { ExportMissingVersions } from '@teambit/legacy.scope';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('export functionality on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('export, re-init the remote scope, tag and export', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitRemoteScope();
      helper.fixtures.populateComponents(1, undefined, '-v2');
      helper.command.tagAllWithoutBuild();
    });
    it('should throw ExportMissingVersions error on export', () => {
      const err = new ExportMissingVersions(`${helper.scopes.remote}/comp1`, ['0.0.1']);
      const cmd = () => helper.command.export();
      helper.general.expectToThrow(cmd, err);
    });
    it('should enable exporting with --all-versions flag', () => {
      expect(() => helper.command.export('--all-versions')).not.to.throw();
    });
  });
  describe('export, tag and export', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.fixtures.populateComponents(1, undefined, '-v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    it('should not delete the first version', () => {
      expect(() => helper.command.catComponent('comp1@0.0.1')).not.to.throw();
    });
    it('should update the VersionHistory on the remote', () => {
      const versionHistory = helper.command.catVersionHistory(
        `${helper.scopes.remote}/comp1`,
        helper.scopes.remotePath
      );
      expect(versionHistory).to.have.property('versions');
      expect(versionHistory.versions).to.have.lengthOf(2);
    });
    it('should enable un-tagging after a new tag', () => {
      // before it used to throw VersionNotFound
      helper.fixtures.populateComponents(1, undefined, '-v3');
      helper.command.tagAllWithoutBuild();
      expect(() => helper.command.reset('comp1')).not.to.throw();
    });
  });
  // in this test, VersionHistory never got built (coz there was not any import).
  describe('when version history is out of date', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.mergeLane('lane-b', '-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    // previously, it was throwing:
    // component stg9sr19-remote/comp1 missing data. parent 96679459f6975660d88b921bb15b4864e0440896 of version d405d26392dbfcaaf8a0f69d640122a5a0256c26 was not found.
    it('bit export should not throw about missing data', () => {
      expect(() => helper.command.export()).not.to.throw();
    });
  });
});
