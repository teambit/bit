import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('delete files from a component', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
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
  describe('tag and then delete a file', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('bar', 'baz.js');
      helper.command.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.command.tagWithoutBuild('bar/foo');
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
      helper.command.tagWithoutBuild('bar/foo');
      helper.fs.deletePath('bar/baz.js');
      helper.command.tagWithoutBuild('bar/foo');
    });
    it('should not show the deleted file in bit show command', () => {
      const output = helper.command.showComponent('bar/foo');
      expect(output).to.have.string('foo.js');
      expect(output).not.to.have.string('baz.js');
    });
  });
});
