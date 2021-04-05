import chai, { expect } from 'chai';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { ExportMissingVersions } from '../../src/scope/exceptions/export-missing-versions';
import ServerIsBusy from '../../src/scope/exceptions/server-is-busy';

chai.use(require('chai-fs'));

describe('export functionality on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('export, re-init the remote scope, tag and export', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
    it('should enable un-tagging after a new tag', () => {
      // before it used to throw VersionNotFound
      helper.fixtures.populateComponents(1, undefined, '-v3');
      helper.command.tagAllWithoutBuild();
      expect(() => helper.command.untag('comp1')).not.to.throw();
    });
  });
  describe.skip('export to multiple scope with circular between the scopes', () => {
    let anotherRemote;
    let exportOutput;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fs.outputFile('bar1/foo1.js', `require('@${anotherRemote}/bar2');`);
      helper.fs.outputFile('bar2/foo2.js', `require('@${helper.scopes.remote}/bar1');`);
      helper.command.addComponent('bar1');
      helper.command.addComponent('bar2');
      helper.bitJsonc.addToVariant('bar2', 'defaultScope', anotherRemote);
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllComponents();
      exportOutput = helper.command.export();
    });
    it('should export them successfully with no errors', () => {
      expect(exportOutput).to.have.string('exported the following 2 component');
      const scope1 = helper.command.listRemoteScopeParsed();
      expect(scope1).to.have.lengthOf(1);
      const scope2 = helper.command.listRemoteScopeParsed(anotherRemote);
      expect(scope2).to.have.lengthOf(1);
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
  });

  /**
   * there is no good option to make the remote scope fails at the persist step. normally, if there
   * is any error, it stops at the validation step.
   * to be able to test these scenarios, we ran the previous test "(export to multiple scope with
   * circular between the scopes)", manually threw an error during the persist phase, and then tar
   * the remote scopes (tar -czf mjtjb8oh-remote2-bar2.tgz pending-objects/1611930408860).
   * this way, we could create tests using the extracted remote-scopes with the pending-objects
   * directories.
   */
  describe.skip('recover from persist-error during export', () => {
    let remote1Name: string;
    let remote2Name: string;
    let remote1Path: string;
    let remote2Path: string;
    let remote1Clone: string;
    let remote2Clone: string;
    let exportId: string;
    // extract the pending-objects to the two remotes
    before(() => {
      remote1Name = 'ovio1b1s-remote';
      remote2Name = 'mjtjb8oh-remote2';
      exportId = '1611930408860';
      remote1Path = helper.scopeHelper.getNewBareScopeWithSpecificName(remote1Name);
      remote2Path = helper.scopeHelper.getNewBareScopeWithSpecificName(remote2Name);
      helper.fixtures.extractCompressedFixture('objects/ovio1b1s-remote-bar1.tgz', remote1Path);
      helper.fixtures.extractCompressedFixture('objects/mjtjb8oh-remote2-bar2.tgz', remote2Path);
      helper.scopeHelper.addRemoteScope(remote1Path, remote2Path);
      helper.scopeHelper.addRemoteScope(remote2Path, remote1Path);
      remote1Clone = helper.scopeHelper.cloneScope(remote1Path);
      remote2Clone = helper.scopeHelper.cloneScope(remote2Path);
    });
    it('as an intermediate step, make sure the remotes scopes are empty', () => {
      const scope1 = helper.command.catScope(true, remote1Path);
      const scope2 = helper.command.catScope(true, remote2Path);
      expect(scope1).to.have.lengthOf(0);
      expect(scope2).to.have.lengthOf(0);
    });
    function expectRemotesToHaveTheComponents() {
      it('the remotes should now have the components', () => {
        const scope1 = helper.command.catScope(true, remote1Path);
        const scope2 = helper.command.catScope(true, remote2Path);
        expect(scope1).to.have.lengthOf.least(1); // can be two if fetched-missing-deps completed.
        expect(scope2).to.have.lengthOf.least(1);
      });
    }
    describe('when the failure happened on the same workspace', () => {
      let beforeExportClone;
      before(() => {
        // simulate the same workspace the persist failed.
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope(remote1Path);
        helper.scopeHelper.addRemoteScope(remote2Path);

        helper.fs.outputFile('bar1/foo1.js', `require('@${remote2Name}/bar2');`);
        helper.fs.outputFile('bar2/foo2.js', `require('@${remote1Name}/bar1');`);
        helper.command.addComponent('bar1');
        helper.command.addComponent('bar2');
        helper.bitJsonc.addToVariant('bar1', 'defaultScope', remote1Name);
        helper.bitJsonc.addToVariant('bar2', 'defaultScope', remote2Name);
        helper.command.linkAndRewire();
        helper.command.compile();
        helper.command.tagAllWithoutBuild();
        beforeExportClone = helper.scopeHelper.cloneLocalScope();
      });
      describe('running bit export --resume <export-id>', () => {
        let exportOutput: string;
        before(() => {
          exportOutput = helper.command.export(`--resume ${exportId}`);
        });
        it('should resume the export and complete it successfully', () => {
          expect(exportOutput).to.have.string('exported the following 2 component(s)');
          expect(exportOutput).to.have.string('ovio1b1s-remote/bar1');
          expect(exportOutput).to.have.string('mjtjb8oh-remote2/bar2');
        });
        it('bit status should be clean', () => {
          helper.command.expectStatusToBeClean();
        });
        expectRemotesToHaveTheComponents();
      });
      describe('running bit export without resume', () => {
        before(() => {
          helper.scopeHelper.getClonedScope(remote1Clone, remote1Path);
          helper.scopeHelper.getClonedScope(remote2Clone, remote2Path);
          helper.scopeHelper.getClonedLocalScope(beforeExportClone);
        });
        it('should throw ServerIsBusy error', () => {
          const err = new ServerIsBusy(2, exportId);
          const cmd = () => helper.command.export();
          helper.general.expectToThrow(cmd, err);
        });
      });
      describe('when one remote succeeded and one failed', () => {
        let exportOutput;
        before(() => {
          helper.scopeHelper.getClonedScope(remote1Clone, remote1Path);
          helper.scopeHelper.getClonedScope(remote2Clone, remote2Path);
          helper.scopeHelper.getClonedLocalScope(beforeExportClone);
          helper.command.resumeExport(exportId, [remote1Name]);
          exportOutput = helper.command.export(`--resume ${exportId}`);
        });
        it('should still be able to run export --resume to persist to other scopes', () => {
          expect(exportOutput).to.have.string('exported the following 1 component(s)');
          expect(exportOutput).to.have.string('mjtjb8oh-remote2/bar2');
        });
      });
    });
    describe('from different workspace, by running bit resume-export <export-id> <remotes...>', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.getClonedScope(remote1Clone, remote1Path);
        helper.scopeHelper.getClonedScope(remote2Clone, remote2Path);
        helper.scopeHelper.addRemoteScope(remote1Path);
        helper.scopeHelper.addRemoteScope(remote2Path);
      });
      describe('running it with the correct export-id and all the remotes', () => {
        let resumeExportOutput: string;
        before(() => {
          resumeExportOutput = helper.command.resumeExport(exportId, [remote1Name, remote2Name]);
        });
        it('should complete the export successfully', () => {
          expect(resumeExportOutput).to.have.string('the following components were persisted successfully');
          expect(resumeExportOutput).to.have.string('ovio1b1s-remote/bar1');
          expect(resumeExportOutput).to.have.string('mjtjb8oh-remote2/bar2');
        });
        expectRemotesToHaveTheComponents();
      });
      describe('running it with the correct export-id and only one remote', () => {
        let resumeExportOutput: string;
        before(() => {
          helper.scopeHelper.getClonedScope(remote1Clone, remote1Path);
          helper.scopeHelper.getClonedScope(remote2Clone, remote2Path);
          resumeExportOutput = helper.command.resumeExport(exportId, [remote1Name]);
        });
        it('should complete the export for that remote only', () => {
          expect(resumeExportOutput).to.have.string('the following components were persisted successfully');
          expect(resumeExportOutput).to.have.string('ovio1b1s-remote/bar1');
          expect(resumeExportOutput).to.not.have.string('mjtjb8oh-remote2/bar2');
        });
        it('only the first remote should have the component', () => {
          const scope1 = helper.command.catScope(true, remote1Path);
          const scope2 = helper.command.catScope(true, remote2Path);
          expect(scope1).to.have.lengthOf(1);
          expect(scope2).to.have.lengthOf(0);
        });
      });
      describe('running it with a non-exist export-id', () => {
        it('should indicate that no components were persisted', () => {
          const output = helper.command.resumeExport('1234', [remote1Name]);
          expect(output).to.have.string('no components were left to persist for this export-id');
        });
      });
    });
  });
});
