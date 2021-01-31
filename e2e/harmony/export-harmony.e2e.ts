import chai, { expect } from 'chai';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';
import { ExportMissingVersions } from '../../src/scope/exceptions/export-missing-versions';

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
  describe('export to multiple scope with circular between the scopes', () => {
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
});
