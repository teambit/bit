import path from 'path';
import fs from 'fs-extra';
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
      helper.runCmd(`bit move ${oldPath} ${newPath}`);
    });
    it('should move physically the file', () => {
      const localConsumerFiles = helper.getConsumerFiles();
      expect(localConsumerFiles).to.include(newPath);
      expect(localConsumerFiles).not.to.include(oldPath);
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].files[0].relativePath).to.equal('utils/foo.js');
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].mainFile).to.equal('utils/foo.js');
    });
  });
  describe('move a directory', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo1.spec.js');
      helper.addComponentWithOptions('bar', {
        i: 'bar/foo',
        t: path.normalize('bar/foo1.spec.js'),
        m: path.normalize('bar/foo1.js')
      });
      helper.runCmd('bit move bar utils');
    });
    it('should move physically the directory', () => {
      const localConsumerFiles = helper.getConsumerFiles();
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
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].mainFile).to.equal('utils/foo1.js');
    });
  });
  describe('when the file was moved already', () => {
    const oldPath = path.join('bar', 'foo.js');
    const newPath = path.join('utils', 'foo.js');
    let filesBeforeMove;
    let filesAfterMove;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      fs.moveSync(path.join(helper.localScopePath, oldPath), path.join(helper.localScopePath, newPath));
      filesBeforeMove = helper.getConsumerFiles();
      helper.runCmd(`bit move ${oldPath} ${newPath}`);
      filesAfterMove = helper.getConsumerFiles();
    });
    it('should not physically move any file', () => {
      expect(filesBeforeMove).to.deep.equal(filesAfterMove);
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].files[0].relativePath).to.equal('utils/foo.js');
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].mainFile).to.equal('utils/foo.js');
    });
  });
  describe('when the source and destination files do not exist', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      try {
        helper.runCmd('bit move bar/non-exist-source.js utils/non-exist-dest.js');
      } catch (err) {
        output = err.message;
      }
    });
    it('should throw an error', () => {
      expect(output).to.have.string('Error');
    });
  });
  describe('when both source and destination files exist', () => {
    const fromPath = path.join('bar', 'foo.js');
    const toPath = path.join('utils', 'foo.js');
    let filesBeforeMove;
    let filesAfterMove;
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      fs.copySync(path.join(helper.localScopePath, fromPath), path.join(helper.localScopePath, toPath));
      filesBeforeMove = helper.getConsumerFiles();
      try {
        helper.runCmd(`bit move ${fromPath} ${toPath}`);
      } catch (err) {
        output = err.message;
      }
      filesAfterMove = helper.getConsumerFiles();
    });
    it('should throw an error', () => {
      expect(output).to.have.string('Error');
    });
    it('should not physically move any file', () => {
      expect(filesBeforeMove).to.deep.equal(filesAfterMove);
    });
  });
  describe('move a file after commit (as author)', () => {
    const oldPath = path.join('bar', 'foo.js');
    const newPath = path.join('utils', 'foo.js');
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.runCmd(`bit move ${oldPath} ${newPath}`);
    });
    it('should move physically the file', () => {
      const localConsumerFiles = helper.getConsumerFiles();
      expect(localConsumerFiles).to.include(newPath);
      expect(localConsumerFiles).not.to.include(oldPath);
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].files[0].relativePath).to.equal('utils/foo.js');
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].mainFile).to.equal('utils/foo.js');
    });
    it('should recognize the component as modified', () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('no modified components')).to.be.false;
      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
  });
  describe('move root directory after import', () => {
    const oldPath = path.join('components', 'bar');
    const newPath = path.join('components', 'utils');
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      helper.runCmd(`bit move ${oldPath} ${newPath}`);
    });
    it('should move physically the directory', () => {
      const localConsumerFiles = helper.getConsumerFiles();
      localConsumerFiles.forEach((file) => {
        expect(file.startsWith(newPath)).to.be.true;
      });
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap[`${helper.remoteScope}/bar/foo@1`].rootDir).to.equal('components/utils/foo');
    });
    it('should not recognize the component as modified', () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('no modified components')).to.be.true;
    });
  });
});
