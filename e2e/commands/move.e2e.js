import path from 'path';
import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit move command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('move a file', () => {
    const oldPath = path.join('bar', 'foo.js');
    const newPath = path.join('utils', 'foo.js');
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.runCmd('bit move bar/foo bar/foo.js utils/foo.js');
    });
    it('should move physically the file', () => {
      const localConsumerFiles = helper.getConsumerJSFiles();
      expect(localConsumerFiles).to.include(newPath);
      expect(localConsumerFiles).not.to.include(oldPath);
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].files[0].relativePath).to.equal(newPath);
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].mainFile).to.equal(newPath);
    });
  });
  describe('move a directory', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo1.spec.js');
      helper.addComponentWithOptions('bar', { i: 'bar/foo', t: 'bar/foo1.spec.js', m: 'bar/foo1.js' });
      helper.runCmd('bit move bar/foo bar utils');
    });
    it('should move physically the directory', () => {
      const localConsumerFiles = helper.getConsumerJSFiles();
      localConsumerFiles.forEach((file) => {
        expect(file.startsWith('utils')).to.be.true;
      });
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.readBitMap();

      bitMap['bar/foo'].files.forEach((file) => {
        expect(file.relativePath.startsWith('utils')).to.be.true;
      });
    });
    it('should update the mainFile of bit.map', () => {
      const newPath = path.join('utils', 'foo1.js');
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].mainFile).to.equal(newPath);
    });
  });
});
