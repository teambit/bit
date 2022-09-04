import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('init command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('init --reset-new', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.init('--reset-new');
    });
    it('should change the .bitmap entries as if they are new', () => {
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(bitMap).to.have.property('comp1');
      expect(bitMap.comp1.version).to.equal('');
      expect(bitMap.comp1.scope).to.equal('');
    });
    it('should remove all objects from the scope', () => {
      const objectsPath = path.join(helper.scopes.localPath, '.bit/objects');
      expect(objectsPath).to.be.a.directory().and.empty;
    });
  });
  // previously, it would consider the ".git" directory as the scope-path
  describe('delete "objects" dir from the scope after initiating with git', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony({ initGit: true });
      helper.scopeHelper.reInitRemoteScope();
      helper.scopeHelper.addRemoteScope();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.fs.deletePath('.git/bit/objects');
    });
    it('should show a descriptive error', () => {
      expect(() => helper.command.status()).to.throw(`scope not found at`);
    });
    it('bit init should fix it', () => {
      helper.command.init();
      helper.general.runWithTryCatch('bit status'); // first run could throw about rebuilding index.json
      expect(() => helper.command.status()).to.not.throw();
    });
  });
  describe('when workspace.jsonc exist, but not .bitmap nor .bit', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.deletePath('.bit');
      helper.fs.deletePath('.bitmap');
    });
    // previously, it was throwing command-not-found
    it('should show a descriptive error', () => {
      expect(() => helper.command.install()).to.throw(`fatal: unable to load the workspace`);
    });
  });
});
