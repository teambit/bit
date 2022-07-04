import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit move command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('move a directory', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo1.spec.js');
      helper.command.addComponent('bar', {
        i: 'bar/foo',
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
    it('should update the rootDir of bit.map', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].rootDir).to.equal('utils');
    });
  });
  describe('when the destination starts with the source dir', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      output = helper.command.runCmd('bit move bar bar2');
    });
    it('should not throw an error saying the path is not a directory', () => {
      expect(output).to.have.string('moved component');
    });
  });
  describe('move root directory after import', () => {
    const oldPath = path.join('components', 'bar');
    const newPath = path.join('components', 'utils');
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo', '--path components/bar');
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
    it('should not recognize the component as modified', () => {
      const output = helper.command.runCmd('bit status');
      expect(output.includes('modified components')).to.be.false;
    });
  });
});
