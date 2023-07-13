import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit revert command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic revert', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.tagAllWithoutBuild();
      helper.command.revert('comp1', '0.0.1', '-x');
    });
    it('should change the code to the specified version', () => {
      const content = helper.fs.readFile('comp1/index.js');
      expect(content).to.not.have.string('v2');
    });
    it('should keep the version in .bitmap intact', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal('0.0.2');
    });
  });
});
