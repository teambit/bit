import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import Helper, { FileStatusWithoutChalk } from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const barFooV1 = "module.exports = function foo() { return 'got foo'; };";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
const barFooV3 = "module.exports = function foo() { return 'got foo v3'; };";
const barFooV4 = "module.exports = function foo() { return 'got foo v4'; };";
const successOutput = 'successfully merged components';

describe('bit merge command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  before(() => {
    helper.scopeHelper.reInitLocalScope();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('for non existing component', () => {
    it('show an error saying the component was not found', () => {
      const mergeFunc = () => helper.command.runCmd('bit merge 1.0.0 utils/non-exist');
      const error = new MissingBitMapComponent('utils/non-exist');
      helper.general.expectToThrow(mergeFunc, error);
    });
  });
  describe('after the component was created', () => {
    before(() => {
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFooAsDir();
    });
    it('before tagging it should show an error saying the component was not tagged yet', () => {
      // @todo: create a new Exception ComponentHasNoVersion
      const output = helper.general.runWithTryCatch('bit merge 1.0.0 bar/foo');
      expect(output).to.have.string("component bar/foo doesn't have any version yet");
    });
    describe('after the component was tagged', () => {
      before(() => {
        helper.command.tagAllWithoutBuild('--ver 0.0.5');
      });
      describe('using a non-exist version', () => {
        it('should show an error saying the version does not exist', () => {
          const output = helper.general.runWithTryCatch('bit merge 1.0.0 bar/foo');
          expect(output).to.have.string("component bar/foo doesn't have version 1.0.0");
        });
      });
      describe('and component was modified', () => {
        before(() => {
          helper.fixtures.createComponentBarFoo(barFooV2);
        });
        it('should show an error saying the component already uses that version', () => {
          const output = helper.general.runWithTryCatch('bit merge 0.0.5 bar/foo');
          expect(output).to.have.string('component bar/foo is already at version 0.0.5');
        });
      });
    });
  });
  describe('component with conflicts', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(barFooV2);
      helper.fixtures.tagComponentBarFoo();
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      before(() => {
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
      });
      it('should indicate that the file has conflicts', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.manual);
      });
      it('should rewrite the file with the conflict with the conflicts segments', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.have.string('<<<<<<<');
        expect(fileContent).to.have.string('>>>>>>>');
        expect(fileContent).to.have.string('=======');
      });
      it('should label the conflicts segments according to the versions', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.have.string('<<<<<<< 0.0.2'); // current-change
        expect(fileContent).to.have.string('>>>>>>> 0.0.1'); // incoming-change
      });
      it('should not change bitmap version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].version).to.equal('0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using theirs strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the merged version', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should not update bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].version).to.equal('0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--ours');
      });
      it('should indicate that the merge was successful', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should indicate that the file was not changed', () => {
        expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
      });
      it('should leave the file intact', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV2);
      });
      it('should not update bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].version).to.equal('0.0.2');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('when there are files currently on the filesystem which are not on the specified version', () => {
      let scopeWithAddedFile;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('bar', 'foo2.js');
        helper.command.addComponent('bar', { i: 'bar/foo' });
        scopeWithAddedFile = helper.scopeHelper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
      describe('using theirs strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--ours');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
    });
    describe('when there are files on the specified version which are not currently on the filesystem', () => {
      let scopeWithRemovedFile;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('bar', 'foo2.js');
        helper.command.addComponent('bar', { i: 'bar/foo' });
        helper.command.tagAllWithoutBuild(); // 0.0.3
        fs.removeSync(path.join(helper.scopes.localPath, 'bar/foo2.js'));
        // remove the symlink from node_modules. otherwise, Windows on Circle fails with ENOENT when running "helper.scopeHelper.cloneLocalScope()"
        fs.removeSync(path.join(helper.scopes.localPath, 'node_modules', '@my-scope', 'bar.foo', 'foo2.js'));
        helper.fixtures.createComponentBarFoo(barFooV4); // change also foo.js so it'll have conflict
        helper.command.tagAllWithoutBuild(); // 0.0.4 without bar/foo2.js
        scopeWithRemovedFile = helper.scopeHelper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.command.mergeVersion('0.0.3', 'bar/foo', '--manual');
        });
        it('should indicate that the file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('foo2.js');
        });
        it('should add the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
      describe('using theirs strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithRemovedFile);
          output = helper.command.mergeVersion('0.0.3', 'bar/foo', '--theirs');
        });
        it('should indicate that the file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('foo2.js');
        });
        it('should add the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithRemovedFile);
          output = helper.command.mergeVersion('0.0.3', 'bar/foo', '--ours');
        });
        it('should not add the deleted file', () => {
          expect(output).to.not.have.string(FileStatusWithoutChalk.added);
          expect(output).to.not.have.string('foo2.js');
        });
        it('should not add the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.not.be.a.path();
        });
      });
    });
  });
  describe('modified component with conflicts', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(barFooV2);
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(barFooV3);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      let fileContent;
      before(() => {
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
        fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
      });
      it('should indicate that the file has conflicts', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.manual);
      });
      it('should rewrite the file with the conflict with the conflicts segments', () => {
        expect(fileContent).to.have.string('<<<<<<<');
        expect(fileContent).to.have.string('>>>>>>>');
        expect(fileContent).to.have.string('=======');
      });
      it('should label the conflicts segments according to the versions', () => {
        expect(fileContent).to.have.string('<<<<<<< 0.0.2'); // current-change
        expect(fileContent).to.have.string('>>>>>>> 0.0.1'); // incoming-change
      });
      it('should contain the content of the current modified file and the merged file', () => {
        expect(fileContent).to.have.string(barFooV1);
        expect(fileContent).to.have.string(barFooV3);
      });
      it('should not change bitmap version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].version).to.equal('0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using theirs strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the merged version', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--ours');
      });
      it('should indicate that the version was merged', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should indicate that the file was not changed', () => {
        expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
      });
      it('should leave the file intact', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV3);
      });
      it('should not change bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].version).to.equal('0.0.2');
      });
      it('should still show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
  describe('modified component without conflict', () => {
    describe('when the modified file is the same as the specified version', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo(barFooV1);
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.tagComponentBarFoo();
        helper.fixtures.createComponentBarFoo(barFooV2);
        helper.fixtures.tagComponentBarFoo();
        helper.fixtures.createComponentBarFoo(barFooV1);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo');
      });
      it('should indicate that the version is merged', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should not change the file content', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should not change bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].version).to.equal('0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
});
