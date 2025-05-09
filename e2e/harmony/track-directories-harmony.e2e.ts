import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { AddingIndividualFiles } from '@teambit/tracker';
import { Helper } from '@teambit/legacy.e2e-helper';

// track directories functionality = add/rename files to rootDir.
describe('track directories functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('add a directory as authored', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.createFile('utils/bar', 'foo.js');
      helper.command.addComponent('utils/bar', { i: 'utils/bar' });
      localScope = helper.scopeHelper.cloneWorkspace();
    });
    it('should add the directory as rootDir in bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('utils/bar');
      expect(bitMap['utils/bar'].rootDir).to.equal('utils/bar');
      expect(bitMap['utils/bar']).to.not.have.property('trackDir'); // this functionality had been removed
    });
    describe('creating another file in the same directory', () => {
      let statusOutput;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.fs.createFile('utils/bar', 'foo2.js');
        statusOutput = helper.command.runCmd('bit status');
      });
      it('bit status should still show the component as new', () => {
        expect(statusOutput).to.have.string('new components');
      });
      it('should add the new file', () => {
        const files = helper.command.getComponentFiles('utils/bar');
        expect(files).to.include('foo.js');
        expect(files).to.include('foo2.js');
      });
      describe('rename a non-main file', () => {
        before(() => {
          const currentFile = path.join(helper.scopes.localPath, 'utils/bar/foo2.js');
          const newFile = path.join(helper.scopes.localPath, 'utils/bar/foo3.js');
          fs.moveSync(currentFile, newFile);
          statusOutput = helper.command.runCmd('bit status');
        });
        it('should update the renamed file', () => {
          const files = helper.command.getComponentFiles('utils/bar');
          expect(files).include('foo.js');
          expect(files).not.include('foo2.js');
          expect(files).include('foo3.js');
          expect(files).to.have.lengthOf(2);
        });
      });
    });
    describe('creating another file in the same directory and running bit-status from an inner directory', () => {
      let statusOutput;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.fs.createFile('utils/bar', 'foo2.js');
        statusOutput = helper.command.runCmd('bit status', path.join(helper.scopes.localPath, 'utils'));
      });
      it('bit status should still show the component as new', () => {
        expect(statusOutput).to.have.string('new components');
      });
      it('bit status should update bitmap and add the new file', () => {
        const files = helper.command.getComponentFiles('utils/bar');
        expect(files).include('foo.js');
        expect(files).include('foo2.js');
      });
    });
    describe('rename the file which is a main file', () => {
      let statusOutput;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        const currentFile = path.join(helper.scopes.localPath, 'utils/bar/foo.js');
        const newFile = path.join(helper.scopes.localPath, 'utils/bar/foo2.js');
        fs.moveSync(currentFile, newFile);
        statusOutput = helper.command.runCmd('bit status');
      });
      it('bit status should indicate the missing of the mainFile', () => {
        expect(statusOutput).to.have.string('main-file was removed');
      });
    });
    describe('tagging the component', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.command.tagAllComponents();
      });
      it('should save the files with relativePaths relative to the rootDir', () => {
        const output = helper.command.catComponent('utils/bar@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(output.files[0].relativePath).to.equal('foo.js');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(output.mainFile).to.equal('foo.js');
      });
      describe('then adding a new file to the directory', () => {
        let statusOutput;
        before(() => {
          helper.fs.createFile('utils/bar', 'foo2.js');
          statusOutput = helper.command.runCmd('bit status');
        });
        it('bit status should show the component as modified', () => {
          expect(statusOutput).to.have.string('modified components');
        });
        it('bit status should update bitmap and add the new file', () => {
          const files = helper.command.getComponentFiles('utils/bar@0.0.1');
          expect(files).include('foo.js');
          expect(files).include('foo2.js');
        });
      });
    });
    describe('adding a file outside of that directory', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.fs.createFile('utils', 'a.js');
      });
      it('should throw an error', () => {
        const addFunc = () => helper.command.addComponent('utils/a.js', { i: 'utils/bar' });
        const error = new AddingIndividualFiles(path.normalize('utils/a.js'));
        helper.general.expectToThrow(addFunc, error);
      });
    });
    describe('adding a parent directory', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.fs.outputFile('utils/qux/qux.js');
        output = helper.command.addComponent('utils --id utils/bar');
      });
      it('should add the files in that directory successfully', () => {
        expect(output).to.have.string('added qux/qux.js');
      });
      it('should change the rootDir to the newly added dir', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('utils/bar');
        expect(bitMap['utils/bar'].rootDir).equal('utils');
        expect(bitMap['utils/bar']).to.not.have.property('trackDir');
      });
      it('should change the files according to the new rootDir', () => {
        const files = helper.command.getComponentFiles('utils/bar');
        expect(files).to.include(path.join('bar', 'foo.js'));
        expect(files).to.not.include('foo.js');
      });
    });
    describe('importing the component', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(localScope);
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.command.tagAllComponents();
        helper.command.export();
        helper.command.importComponent('utils/bar');
      });
      it('should not change the rootDir', () => {
        const bitMap = helper.bitMap.read();
        helper.bitMap.expectToHaveId('utils/bar', '0.0.1', helper.scopes.remote);
        expect(bitMap['utils/bar'].rootDir).to.equal('utils/bar');
      });
    });
  });
  describe('add multiple directories', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.createFile('utils/foo', 'index.js');
      helper.fs.createFile('utils/bar', 'index.js');
      helper.fs.createFile('utils/baz', 'index.js');
      helper.command.addComponent('utils/*', { n: 'utils' });
    });
    it('should add rootDir property for each one of the directories', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['utils/foo']).to.have.property('rootDir');
      expect(bitMap['utils/foo'].rootDir).to.equal('utils/foo');

      expect(bitMap['utils/bar']).to.have.property('rootDir');
      expect(bitMap['utils/bar'].rootDir).to.equal('utils/bar');

      expect(bitMap['utils/baz']).to.have.property('rootDir');
      expect(bitMap['utils/baz'].rootDir).to.equal('utils/baz');
    });
  });
  describe('adding files to sub-directories', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.outputFile('bar/foo.ts');
      helper.command.addComponent('bar');
      helper.fs.outputFile('bar/baz/index.ts');
      helper.command.status(); // this adds the last file to .bitmap
      helper.fs.outputFile('bar/baz/baz.ts');
      helper.command.status(); // this should add the last file
    });
    it('the files on the sub-dir should be auto-tracked', () => {
      const files = helper.command.getComponentFiles('bar');
      expect(files).to.include(path.join('baz', 'baz.ts'));
    });
  });
});
