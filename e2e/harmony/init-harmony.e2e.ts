import chai, { expect } from 'chai';
import path from 'path';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('init command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
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
});
