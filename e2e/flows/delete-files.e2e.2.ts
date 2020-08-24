import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('delete files from a component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('after adding it', () => {
    let statusOutput;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'baz.js');
      helper.command.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.fs.deletePath('bar/baz.js');
      statusOutput = helper.command.runCmd('bit status');
    });
    it('bit status should not throw an error and should show it as a new component', () => {
      expect(statusOutput.includes('new components')).to.be.true;
      expect(statusOutput.includes('bar/foo')).to.be.true;
    });
  });
  describe('when tagging it', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'baz.js');
      helper.command.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.fs.deletePath('bar/baz.js');
      helper.command.tagComponent('bar/foo');
    });
    it('should delete the file from bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo@0.0.1'].files.length).to.equal(1);
    });
  });
  describe('tag and then delete a file', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'baz.js');
      helper.command.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.command.tagComponent('bar/foo');
      helper.fs.deletePath('bar/baz.js');
    });
    it('bit status should show the component as modified', () => {
      const output = helper.command.runCmd('bit status');
      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
  });
  describe('adding a file, tagging it, deleting it and then tagging again', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'baz.js');
      helper.command.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.command.tagComponent('bar/foo');
      helper.fs.deletePath('bar/baz.js');
      helper.command.tagComponent('bar/foo');
    });
    it('should delete the file from bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo@0.0.2'].files.length).to.equal(1);
    });
    it('should not show the deleted file in bit show command', () => {
      const output = helper.command.showComponent('bar/foo');
      expect(output).to.have.string('bar/foo.js');
      expect(output).not.to.have.string('bar/baz.js');
    });
  });
});
