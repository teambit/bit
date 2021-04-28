import chai, { expect } from 'chai';
import path from 'path';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('remove components on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('remove new component without --delete-files flag', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.removeComponent('comp1');
    });
    it('should remove the component from .bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp1');
    });
    it('should not delete the directory from the filesystem', () => {
      expect(path.join(helper.scopes.localPath, 'comp1')).to.be.a.directory();
    });
    it('should delete the directory from the node_modules', () => {
      expect(path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}`, 'comp1')).to.not.be.a.path();
    });
  });
  describe('remove new component with --delete-files flag', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.removeComponent('comp1', '--delete-files');
    });
    it('should remove the component from .bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp1');
    });
    it('should delete the directory from the filesystem', () => {
      expect(path.join(helper.scopes.localPath, 'comp1')).to.not.be.a.path();
    });
    it('should delete the directory from the node_modules', () => {
      expect(path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}`, 'comp1')).to.not.be.a.path();
    });
  });
});
