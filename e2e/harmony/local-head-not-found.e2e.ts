import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import chaiFs from 'chai-fs';

chai.use(chaiFs);

describe('local head Version object is missing from scope', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('head ref points to a missing snap while bitmap is pinned to a valid older version', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // snap a new version locally so the head points to something that's not on the remote.
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      const compAfterSnap = helper.command.catComponent(`${helper.scopes.remote}/comp1`);
      const headHash = compAfterSnap.head as string;

      // pin the bitmap back to 0.0.1 so component-loading stays valid while the
      // modelComponent's head still points to the snap we're about to delete.
      helper.command.checkoutVersion('0.0.1', 'comp1');

      // delete the snap's Version object and the VersionHistory so the head is not
      // recoverable from either the objects store or the VersionHistory.
      helper.fs.deleteObject(helper.general.getHashPathOfObject(headHash));
      const versionHistoryHash = sha1(`${helper.scopes.remote}/comp1:VersionHistory`);
      helper.fs.deleteObject(helper.general.getHashPathOfObject(versionHistoryHash));
    });
    it('bit status should surface LocalHeadNotFound with actionable "bit import --objects" instead of the raw graph error', () => {
      const output = helper.general.runWithTryCatch('bit status');
      expect(output).to.not.include('does not exist on graph');
      expect(output).to.match(/bit import .*--objects/);
    });
    it('bit checkout head should fail early with LocalHeadNotFound (not a later ComponentNotFound) and suggest "bit import --objects"', () => {
      const output = helper.general.runWithTryCatch('bit checkout head');
      expect(output).to.not.include('does not exist on graph');
      expect(output).to.not.include('ComponentNotFound');
      expect(output).to.match(/bit import .*--objects/);
    });
  });
});
