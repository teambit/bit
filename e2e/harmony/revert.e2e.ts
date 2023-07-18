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
    let beforeRevert: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.tagAllWithoutBuild();
      beforeRevert = helper.scopeHelper.cloneLocalScope();
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
    describe('when the component is modified', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeRevert);
        helper.fixtures.populateComponents(1, false, 'v3');
        helper.command.revert('comp1', '0.0.1', '-x');
      });
      it('should still change the code to the specified version', () => {
        const content = helper.fs.readFile('comp1/index.js');
        expect(content).to.not.have.string('v2');
        expect(content).to.not.have.string('v3');
      });
    });
  });
  describe('revert from lane to main', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.revert('"**"', 'main');
    });
    it('should change the code according to main', () => {
      const content1 = helper.fs.readFile('comp1/index.js');
      const content2 = helper.fs.readFile('comp2/index.js');
      expect(content1).to.not.have.string('v2');
      expect(content2).to.not.have.string('v2');
    });
    it('should keep the versions intact', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.not.equal('0.0.1');
      expect(bitmap.comp2.version).to.not.equal('0.0.1');
    });
  });
});
