import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import { removeChalkCharacters } from '../../src/utils';

chai.use(require('chai-fs'));

describe('bit move command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('move a file', () => {
    const oldPath = path.join('bar', 'foo.js');
    const newPath = path.join('utils', 'foo.js');
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.runCmd(`bit move ${oldPath} ${newPath}`);
    });
    it('should move physically the file', () => {
      const localConsumerFiles = helper.fs.getConsumerFiles();
      expect(localConsumerFiles).to.include(newPath);
      expect(localConsumerFiles).not.to.include(oldPath);
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].files[0].relativePath).to.equal('utils/foo.js');
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].mainFile).to.equal('utils/foo.js');
    });
  });
  describe('rename a file', () => {
    const oldPath = path.join('bar', 'foo.js');
    const newPath = path.join('bar', 'foo2.js');
    let bitMap;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.runCmd(`bit move ${oldPath} ${newPath}`);
      bitMap = helper.bitMap.read();
    });
    it('should move physically the file', () => {
      const localConsumerFiles = helper.fs.getConsumerFiles();
      expect(localConsumerFiles).to.include(newPath);
      expect(localConsumerFiles).not.to.include(oldPath);
    });
    it('should update the name in bit.map', () => {
      const files = bitMap['bar/foo'].files;
      expect(files[0].name).to.equal('foo2.js');
    });
    it('should update the file path in bit.map', () => {
      const files = bitMap['bar/foo'].files;
      expect(files[0].relativePath).to.equal('bar/foo2.js');
    });
    it('should update the mainFile of bit.map', () => {
      expect(bitMap['bar/foo'].mainFile).to.equal('bar/foo2.js');
    });
  });
  // legacy test. new code only rootDir is changed.
  describe('move a directory', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo1.spec.js');
      helper.command.addComponent('bar', {
        i: 'bar/foo',
        t: path.normalize('bar/foo1.spec.js'),
        m: path.normalize('bar/foo1.js'),
      });
      helper.command.runCmd('bit move bar utils');
    });
    it('should move physically the directory', () => {
      const localConsumerFiles = helper.fs.getConsumerFiles(undefined, undefined, false);
      localConsumerFiles.forEach((file) => {
        expect(file.startsWith('utils')).to.be.true;
      });
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.bitMap.read();

      bitMap['bar/foo'].files.forEach((file) => {
        expect(file.relativePath.startsWith('utils')).to.be.true;
      });
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].mainFile).to.equal('utils/foo1.js');
    });
    it('should update the trackDir of bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].trackDir).to.equal('utils');
    });
  });
  describe('when the file was moved already', () => {
    const oldPath = path.join('bar', 'foo.js');
    const newPath = path.join('utils', 'foo.js');
    let filesBeforeMove;
    let filesAfterMove;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      fs.moveSync(path.join(helper.scopes.localPath, oldPath), path.join(helper.scopes.localPath, newPath));
      filesBeforeMove = helper.fs.getConsumerFiles(undefined, undefined, false);
      helper.command.runCmd(`bit move ${oldPath} ${newPath}`);
      filesAfterMove = helper.fs.getConsumerFiles(undefined, undefined, false);
    });
    it('should not physically move any file', () => {
      expect(filesBeforeMove).to.deep.equal(filesAfterMove);
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].files[0].relativePath).to.equal('utils/foo.js');
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].mainFile).to.equal('utils/foo.js');
    });
  });
  describe('when the source and destination files do not exist', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      try {
        helper.command.runCmd('bit move bar/non-exist-source.js utils/non-exist-dest.js');
      } catch (err) {
        output = err.message;
      }
    });
    it('should throw an error', () => {
      expect(output).to.have.string(
        'move bar/non-exist-source.js utils/non-exist-dest.js\nboth paths from (bar/non-exist-source.js) and to (utils/non-exist-dest.js) do not exist'
      );
    });
  });
  describe('when both source and destination files exist', () => {
    const fromPath = path.join('bar', 'foo.js');
    const toPath = path.join('utils', 'foo.js');
    let filesBeforeMove;
    let filesAfterMove;
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      fs.copySync(path.join(helper.scopes.localPath, fromPath), path.join(helper.scopes.localPath, toPath));
      filesBeforeMove = helper.fs.getConsumerFiles();
      try {
        helper.command.runCmd(`bit move ${fromPath} ${toPath}`);
      } catch (err) {
        output = err.message;
      }
      filesAfterMove = helper.fs.getConsumerFiles();
    });
    it('should throw an error', () => {
      const barFooPath = path.join('bar', 'foo.js');
      const utilsFooPath = path.join('utils', 'foo.js');
      expect(output).to.have.string(
        `unable to move because both paths from (${barFooPath}) and to (${utilsFooPath}) already exist`
      );
    });
    it('should not physically move any file', () => {
      expect(filesBeforeMove).to.deep.equal(filesAfterMove);
    });
  });
  describe('move a file after tag (as author)', () => {
    const oldPath = path.join('bar', 'foo.js');
    const newPath = path.join('utils', 'foo.js');
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.runCmd(`bit move ${oldPath} ${newPath}`);
    });
    it('should move physically the file', () => {
      const localConsumerFiles = helper.fs.getConsumerFiles();
      expect(localConsumerFiles).to.include(newPath);
      expect(localConsumerFiles).not.to.include(oldPath);
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo@0.0.1'].files[0].relativePath).to.equal('utils/foo.js');
    });
    it('should update the mainFile of bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo@0.0.1'].mainFile).to.equal('utils/foo.js');
    });
    it('should recognize the component as modified', () => {
      const output = helper.command.runCmd('bit status');
      expect(output.includes('modified components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
  });
  describe('when the destination starts with the source dir', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.runCmd('bit move bar bar2');
    });
    it('should not throw an error saying the path is not a directory', () => {
      expect(output).to.have.string('moved component');
    });
  });
  describe('when running from an inner directory', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.runCmd('bit move foo.js myfoo.js', path.join(helper.scopes.localPath, 'bar'));
    });
    it('should not throw an error saying the path does not exist', () => {
      expect(output).to.have.string('moved component');
    });
  });
  describe('move root directory after import', () => {
    const oldPath = path.join('components', 'bar');
    const newPath = path.join('components', 'utils');
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      helper.command.runCmd(`bit move ${oldPath} ${newPath}`);
    });
    it('should move physically the directory', () => {
      const localConsumerFiles = helper.fs.getConsumerFiles();
      localConsumerFiles.forEach((file) => {
        if (!file.startsWith('node_modules')) {
          expect(file.startsWith(newPath), `checking file: ${file}`).to.be.true;
        }
      });
    });
    it('should update the file path in bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`].rootDir).to.equal('components/utils/foo');
    });
    it('should not recognize the component as modified', () => {
      const output = helper.command.runCmd('bit status');
      expect(output.includes('modified components')).to.be.false;
    });
    it('should fix the links and be able to require the component with absolute syntax', () => {
      const appJS = `const barFoo = require('${helper.general.getRequireBitPath('bar', 'foo')}');
console.log(barFoo());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJS);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got foo');
    });
  });
  describe('move component files into one directory (--component flag)', () => {
    describe('when there is no trackDir nor rootDir', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js');
        helper.fs.outputFile('src/test/foo.spec.js');
        helper.command.addComponent('src/foo.js src/test/foo.spec.js', { i: 'foo', m: 'src/foo.js' });
        output = helper.command.moveComponent('foo', 'components/foo');
      });
      it('should output the file changes', () => {
        const outputClean = removeChalkCharacters(output);
        expect(outputClean).to.have.string('from src/foo.js to components/foo/foo.js');
        expect(outputClean).to.have.string('from src/test/foo.spec.js to components/foo/foo.spec.js');
      });
      it('should move the files to the specified dir', () => {
        const rootDir = path.join(helper.scopes.localPath, 'components/foo');
        expect(path.join(rootDir, 'foo.js')).to.be.a.file();
        expect(path.join(rootDir, 'foo.spec.js')).to.be.a.file();
      });
      it('should update bitmap with the changes', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap.foo;
        expect(componentMap.rootDir).to.equal('components/foo');
        const files = componentMap.files.map((f) => f.relativePath);
        expect(files).to.have.lengthOf(2);
        expect(files).to.deep.equal(['foo.js', 'foo.spec.js']);
        expect(componentMap.mainFile).to.equal('foo.js');
      });
    });
    describe('when there is no trackDir nor rootDir and running from an inner dir', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js');
        helper.fs.outputFile('src/test/foo.spec.js');
        helper.command.addComponent('src/foo.js src/test/foo.spec.js', { i: 'foo', m: 'src/foo.js' });
        helper.fs.createNewDirectoryInLocalWorkspace('components');
        output = helper.command.runCmd(
          'bit move --component foo foo',
          path.join(helper.scopes.localPath, 'components')
        );
      });
      it('should output the file changes', () => {
        const outputClean = removeChalkCharacters(output);
        expect(outputClean).to.have.string('from src/foo.js to components/foo/foo.js');
        expect(outputClean).to.have.string('from src/test/foo.spec.js to components/foo/foo.spec.js');
      });
      it('should move the files to the specified dir', () => {
        const rootDir = path.join(helper.scopes.localPath, 'components/foo');
        expect(path.join(rootDir, 'foo.js')).to.be.a.file();
        expect(path.join(rootDir, 'foo.spec.js')).to.be.a.file();
      });
      it('should update bitmap with the changes', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap.foo;
        expect(componentMap.rootDir).to.equal('components/foo');
        const files = componentMap.files.map((f) => f.relativePath);
        expect(files).to.have.lengthOf(2);
        expect(files).to.deep.equal(['foo.js', 'foo.spec.js']);
        expect(componentMap.mainFile).to.equal('foo.js');
      });
    });
    describe('when there is trackDir', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js');
        helper.command.addComponent('src', { i: 'foo' });
      });
      it('should throw an error saying it is not possible', () => {
        const cmd = () => helper.command.moveComponent('foo', 'components/foo');
        expect(cmd).to.throw('foo has already one directory (src) for all its files');
      });
    });
    describe('when there is rootDir other than "."', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js');
        helper.command.addComponent('src', { i: 'foo' });
      });
      it('should throw an error saying it is not possible', () => {
        const cmd = () => helper.command.moveComponent('foo', 'components/foo');
        expect(cmd).to.throw('foo has already one directory (src) for all its files');
      });
    });
    describe('when rootDir is "."', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('foo.js');
        helper.command.addComponent('foo.js', { i: 'foo' });
        output = helper.command.moveComponent('foo', 'components/foo');
      });
      it('should output the file changes', () => {
        const outputClean = removeChalkCharacters(output);
        expect(outputClean).to.have.string('from foo.js to components/foo/foo.js');
      });
      it('should move the files to the specified dir', () => {
        const rootDir = path.join(helper.scopes.localPath, 'components/foo');
        expect(path.join(rootDir, 'foo.js')).to.be.a.file();
      });
      it('should update bitmap with the changes', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap.foo;
        expect(componentMap.rootDir).to.equal('components/foo');
        const files = componentMap.files.map((f) => f.relativePath);
        expect(files).to.have.lengthOf(1);
        expect(files).to.deep.equal(['foo.js']);
        expect(componentMap.mainFile).to.equal('foo.js');
      });
    });
  });
});
