import { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

describe('delete files from a component', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('after adding it', () => {
    let statusOutput;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.createFile('bar', 'baz.js');
      helper.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.deleteFile('bar/baz.js');
      statusOutput = helper.runCmd('bit status');
    });
    it('bit status should not throw an error and should show it as a new component', () => {
      expect(statusOutput.includes('new components')).to.be.true;
      expect(statusOutput.includes('bar/foo')).to.be.true;
    });
  });
  describe('when committing it', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.createFile('bar', 'baz.js');
      helper.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.deleteFile('bar/baz.js');
      helper.commitComponent('bar/foo');
    });
    it('should delete the file from bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].files.length).to.equal(1);
    });
  });
  describe('commit and then delete a file', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.createFile('bar', 'baz.js');
      helper.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.commitComponent('bar/foo');
      helper.deleteFile('bar/baz.js');
    });
    it('bit status should show the component as modified', () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('no new components')).to.be.true;
      expect(output.includes('no modified components')).to.be.false;
      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
  });
  describe('adding a file, committing it, deleting it and then committing again', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.createFile('bar', 'baz.js');
      helper.addComponent('bar -i bar/foo -m bar/foo.js');
      helper.commitComponent('bar/foo');
      helper.deleteFile('bar/baz.js');
      helper.commitComponent('bar/foo');
    });
    it('should delete the file from bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].files.length).to.equal(1);
    });
    it('should not show the deleted file in bit show command', () => {
      const output = helper.showComponent('bar/foo');
      expect(output).to.have.string(path.join('bar', 'foo.js'));
      expect(output).not.to.have.string(path.join('bar','baz.js'));
    });
  });
});
