import { expect } from 'chai';
import * as path from 'path';
import fs from 'fs-extra';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

//  track directories functionality = add/rename files to rootDir or trackDir
describe('track directories functionality', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('add a directory as authored', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils/bar', 'foo.js');
      helper.command.addComponent('utils/bar', { i: 'utils/bar' });
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    it('should add the directory as trackDir in bitmap file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('utils/bar');
      expect(bitMap['utils/bar'].trackDir).to.equal('utils/bar');
    });
    describe('creating another file in the same directory', () => {
      let statusOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('utils/bar', 'foo2.js');
        statusOutput = helper.command.runCmd('bit status');
      });
      it('bit status should still show the component as new', () => {
        expect(statusOutput).to.have.string('new components');
      });
      it('bit status should update bitmap and add the new file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('utils/bar');
        const files = bitMap['utils/bar'].files;
        expect(files).to.deep.include({ relativePath: 'utils/bar/foo.js', test: false, name: 'foo.js' });
        expect(files).to.deep.include({ relativePath: 'utils/bar/foo2.js', test: false, name: 'foo2.js' });
      });
      describe('rename a non-main file', () => {
        before(() => {
          const currentFile = path.join(helper.scopes.localPath, 'utils/bar/foo2.js');
          const newFile = path.join(helper.scopes.localPath, 'utils/bar/foo3.js');
          fs.moveSync(currentFile, newFile);
          statusOutput = helper.command.runCmd('bit status');
        });
        it('should rename the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('utils/bar');
          const files = bitMap['utils/bar'].files;
          expect(files).to.deep.include({ relativePath: 'utils/bar/foo.js', test: false, name: 'foo.js' });
          expect(files).to.not.deep.include({ relativePath: 'utils/bar/foo2.js', test: false, name: 'foo2.js' });
          expect(files).to.deep.include({ relativePath: 'utils/bar/foo3.js', test: false, name: 'foo3.js' });
          expect(files).to.have.lengthOf(2);
        });
      });
    });
    describe('creating another file in the same directory and running bit-status from an inner directory', () => {
      let statusOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('utils/bar', 'foo2.js');
        statusOutput = helper.command.runCmd('bit status', path.join(helper.scopes.localPath, 'utils'));
      });
      it('bit status should still show the component as new', () => {
        expect(statusOutput).to.have.string('new components');
      });
      it('bit status should update bitmap and add the new file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('utils/bar');
        const files = bitMap['utils/bar'].files;
        expect(files).to.deep.include({ relativePath: 'utils/bar/foo.js', test: false, name: 'foo.js' });
        expect(files).to.deep.include({ relativePath: 'utils/bar/foo2.js', test: false, name: 'foo2.js' });
      });
    });
    describe('rename the file which is a main file', () => {
      let statusOutput;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        const currentFile = path.join(helper.scopes.localPath, 'utils/bar/foo.js');
        const newFile = path.join(helper.scopes.localPath, 'utils/bar/foo2.js');
        fs.moveSync(currentFile, newFile);
        statusOutput = helper.command.runCmd('bit status');
      });
      it('bit status should indicate the missing of the mainFile', () => {
        expect(statusOutput).to.have.string('main-file was removed');
      });
      it('should not rename the file in bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('utils/bar');
        expect(bitMap['utils/bar'].files[0].relativePath).to.equal('utils/bar/foo.js');
      });
    });
    describe('tagging the component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.tagAllComponents();
      });
      it('should save the files with relativePaths relative to consumer root', () => {
        const output = helper.command.catComponent('utils/bar@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(output.files[0].relativePath).to.equal('utils/bar/foo.js');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(output.mainFile).to.equal('utils/bar/foo.js');
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
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('utils/bar@0.0.1');
          const files = bitMap['utils/bar@0.0.1'].files;
          expect(files).to.deep.include({ relativePath: 'utils/bar/foo.js', test: false, name: 'foo.js' });
          expect(files).to.deep.include({ relativePath: 'utils/bar/foo2.js', test: false, name: 'foo2.js' });
        });
      });
    });
    describe('adding a file outside of that directory', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('utils', 'a.js');
        output = helper.command.addComponent('utils/a.js --id utils/bar');
      });
      it('should add the file successfully', () => {
        expect(output).to.have.string('added utils/a.js');
      });
      it('should remove the trackDir property from bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('utils/bar');
        expect(bitMap['utils/bar']).to.not.have.property('trackDir');
      });
    });
    describe('importing the component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.addRemoteScope();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.command.importComponent('utils/bar');
      });
      it('should not remove the trackDir property from bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/bar@0.0.1`);
        expect(bitMap[`${helper.scopes.remote}/utils/bar@0.0.1`]).to.have.property('trackDir');
      });
    });
  });
  describe('add multiple directories', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('utils/foo', 'index.js');
      helper.fs.createFile('utils/bar', 'index.js');
      helper.fs.createFile('utils/baz', 'index.js');
      helper.command.addComponent('utils/*', { n: 'utils' });
    });
    it('should add trackDir property for each one of the directories', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['utils/foo']).to.have.property('trackDir');
      expect(bitMap['utils/foo'].trackDir).to.equal('utils/foo');

      expect(bitMap['utils/bar']).to.have.property('trackDir');
      expect(bitMap['utils/bar'].trackDir).to.equal('utils/bar');

      expect(bitMap['utils/baz']).to.have.property('trackDir');
      expect(bitMap['utils/baz'].trackDir).to.equal('utils/baz');
    });
  });
  describe('add directory with tests', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('utils/bar', 'foo.js');
      helper.fs.createFile('utils/bar', 'foo.spec.js');
      helper.command.addComponent('utils/bar', { t: 'utils/bar/foo.spec.js', i: 'utils/bar' });
      helper.fs.createFile('utils/bar', 'foo2.js');
      helper.command.runCmd('bit status');
    });
    it('should track the directories without changing the test files', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['utils/bar']).to.have.property('trackDir');
      expect(bitMap['utils/bar'].files).to.deep.include({
        relativePath: 'utils/bar/foo.spec.js',
        test: true,
        name: 'foo.spec.js'
      });
      expect(bitMap['utils/bar'].files).to.deep.include({
        relativePath: 'utils/bar/foo2.js',
        test: false,
        name: 'foo2.js'
      });
    });
  });
  describe('add a directory with exclude', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('utils/bar', 'foo.js');
      helper.fs.createFile('utils/bar', 'foo2.js');
      helper.command.addComponent('utils/bar', { e: 'utils/bar/foo2.js', m: 'foo.js', i: 'utils/bar' });
      helper.command.runCmd('bit status');
    });
    it('should not add the trackDir property', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('utils/bar');
      expect(bitMap['utils/bar']).to.not.have.property('trackDir');
    });
    it('should not add the excluded file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['utils/bar'].files[0].relativePath).to.equal('utils/bar/foo.js');
      expect(bitMap['utils/bar'].files).to.have.lengthOf(1);
    });
  });
  describe('import a component with dependencies', () => {
    let barFooId;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      barFooId = `${helper.scopes.remote}/bar/foo@0.0.1`;
    });
    it('should not add trackDir field', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(barFooId);
      expect(bitMap[barFooId]).to.not.have.property('trackDir');
    });
    describe('adding a new file to the rootDir', () => {
      let statusOutput;
      let bitMap;
      let files;
      before(() => {
        helper.fs.createFile('components/bar/foo', 'foo2.js');
        statusOutput = helper.command.runCmd('bit status');
        bitMap = helper.bitMap.read();
        files = bitMap[barFooId].files;
      });
      it('bit status should show the component as modified', () => {
        expect(statusOutput).to.have.string('modified components');
        expect(statusOutput).to.have.string('bar/foo');
      });
      it('should track the file in bitMap', () => {
        expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
        expect(files).to.deep.include({ relativePath: 'foo2.js', test: false, name: 'foo2.js' });
      });
      it('should not track the link files', () => {
        files.forEach(file => {
          expect(file.name).to.not.equal('is-string.js');
        });
      });
      it('should not track gitignore files', () => {
        files.forEach(file => {
          expect(file.name).to.not.equal('package.json');
          expect(file.name).to.not.equal('package-lock.json');
        });
      });
      describe('tagging the component', () => {
        before(() => {
          helper.command.tagAllComponents();
          statusOutput = helper.command.runCmd('bit status');
        });
        it('bit status should show the component as staged and not as modified', () => {
          expect(statusOutput).to.have.string('staged components');
        });
        it('should save both files to the model', () => {
          const barFoo = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(barFoo.files[0].name).to.equal('foo.js');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(barFoo.files[1].name).to.equal('foo2.js');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(barFoo.files).to.have.lengthOf(2);
        });
      });
    });
  });
});
