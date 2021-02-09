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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.init('--reset-new');
    });
    it('should change the .bitmap entries as if they are new', () => {
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(bitMap).to.have.property('comp1');
      expect(bitMap).not.to.have.property(`${helper.scopes.remote}/comp1@0.0.1`);
      const compMap = bitMap.comp1;
      expect(compMap.exported).to.be.false;
    });
    it('should remove all objects from the scope', () => {
      const objectsPath = path.join(helper.scopes.localPath, '.bit/objects');
      expect(objectsPath).to.be.a.directory().and.empty;
    });
  });
});
