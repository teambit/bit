import { expect } from 'chai';
import * as path from 'path';
import fs from 'fs-extra';
import Helper from '../../src/e2e-helper/e2e-helper';
import { FailedLoadForTag } from '../../src/consumer/component/exceptions/failed-load-for-tag';

describe('reduce-path functionality (eliminate the original shared-dir among component files and its dependencies)', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with old-functionality (reduced on import) re-import after the author changed the originally-shared-dir', () => {
    let localConsumerFiles;
    before(() => {
      // Author creates a component in bar/foo.js
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooLegacy();
      helper.command.tagAllComponentsLegacy();
      helper.command.exportAllComponents();
      const authorScope = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      // Imported user gets the component without the "bar" directory as it is an originallySharedDir
      helper.command.importComponent('bar/foo');
      const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
      expect(fs.existsSync(path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'foo.js'))).to.be.true;
      helper.fs.createFile(path.join('components', 'bar', 'foo'), 'foo.js', barFooV2); // update component
      helper.command.tagAllComponentsLegacy();
      helper.command.exportAllComponents();
      const importedScope = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.getClonedLocalScope(authorScope);
      helper.command.importComponent('bar/foo');
      // Authored user updates the component with the recent changes done by Imported user
      const authorLocation = path.join(helper.scopes.localPath, 'bar', 'foo.js');
      expect(fs.existsSync(authorLocation)).to.be.true;
      expect(fs.readFileSync(authorLocation).toString()).to.equal(barFooV2);
      helper.fs.createFile('', 'foo2.js');
      helper.command.addComponentLegacy('foo2.js', { i: 'bar/foo' });
      helper.command.tagAllComponentsLegacy();
      helper.command.exportAllComponents();
      helper.scopeHelper.getClonedLocalScope(importedScope);
      // Imported user update the component with the recent changes done by Authored user
      helper.command.importComponent('bar/foo');
      localConsumerFiles = helper.fs.getConsumerFiles();
    });
    it('should save only the latest copy of the component and delete the old one', () => {
      expect(localConsumerFiles).to.include(path.join('components', 'bar', 'foo', 'bar', 'foo.js'));
      expect(localConsumerFiles).to.include(path.join('components', 'bar', 'foo', 'foo2.js'));
      // this makes sure that the older copy of the component is gone
      expect(localConsumerFiles).not.to.include(path.join('components', 'bar', 'foo', 'foo.js'));
    });
  });
  describe('with new functionality (save added path as rootDir, no reduce on import)', () => {
    describe('when rootDir is not the same as the sharedDir', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.outputFile('src/bar/foo.js');
        helper.command.addComponent('src', { i: 'comp' });
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp');
      });
      it('should not strip the shared dir', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap[`${helper.scopes.remote}/comp@0.0.1`];
        expect(componentMap.rootDir).to.equal('components/comp');
        expect(componentMap.mainFile).to.equal('bar/foo.js');
      });
    });
  });
  describe('moving from old-functionality to the new one', () => {
    describe('when there is trackDir and not relative paths', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js');
        helper.command.addComponentLegacy('src', { i: 'foo' });
        output = helper.command.tagAllComponentsNew();
      });
      it('should tag successfully without errors', () => {
        expect(output).to.have.string('1 component(s) tagged');
      });
      it('should replace trackDir by rootDir', () => {
        const bitMap = helper.bitMap.read();
        const componentMap = bitMap['foo@0.0.1'];
        expect(componentMap).to.not.have.property('trackDir');
        expect(componentMap).to.have.property('rootDir');
        expect(componentMap.rootDir).to.equal('src');
        expect(componentMap.files[0].relativePath).to.equal('foo.js');
      });
    });
    describe('when there is trackDir and relative paths', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo/foo.js', 'require("../bar/bar");');
        helper.fs.outputFile('src/bar/bar.js');
        helper.command.addComponentLegacy('src/foo', { i: 'foo' });
        helper.command.addComponentLegacy('src/bar', { i: 'bar' });
      });
      it('should throw an error when --allow-relative-paths was not used', () => {
        const cmd = () => helper.command.tagAllComponentsNew();
        const error = new FailedLoadForTag(['foo'], []);
        helper.general.expectToThrow(cmd, error);
      });
      describe('when using --allow-relative-paths', () => {
        let output;
        before(() => {
          output = helper.command.tagAllComponents();
        });
        it('should succeed', () => {
          expect(output).to.have.string('2 component(s) tagged');
        });
        it('should remove the trackDir and add rootDir of "." instead', () => {
          const bitMap = helper.bitMap.read();
          const componentMap = bitMap['foo@0.0.1'];
          expect(componentMap).to.not.have.property('trackDir');
          expect(componentMap).to.have.property('rootDir');
          expect(componentMap.rootDir).to.equal('.');
        });
      });
    });
    describe('when there is no trackDir and no relative paths', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('foo.js');
        helper.command.addComponentLegacy('foo.js');
      });
      it('should throw an error when --allow-files was not used', () => {
        const cmd = () => helper.command.tagAllComponentsNew();
        const error = new FailedLoadForTag([], ['foo']);
        helper.general.expectToThrow(cmd, error);
      });
      describe('when using --allow-files', () => {
        let output;
        before(() => {
          output = helper.command.tagAllComponents();
        });
        it('should succeed', () => {
          expect(output).to.have.string('1 component(s) tagged');
        });
        it('should remove the trackDir and add rootDir of "." instead', () => {
          const bitMap = helper.bitMap.read();
          const componentMap = bitMap['foo@0.0.1'];
          expect(componentMap).to.not.have.property('trackDir');
          expect(componentMap).to.have.property('rootDir');
          expect(componentMap.rootDir).to.equal('.');
        });
      });
    });
    describe('when there is no trackDir and relative paths are used', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.outputFile('src/foo.js', 'require("./bar");');
        helper.fs.outputFile('src/bar.js');
        helper.command.addComponentLegacy('src/foo.js', { i: 'foo' });
        helper.command.addComponentLegacy('src/bar.js', { i: 'bar' });
      });
      it('should throw an error when --allow-relative-paths and --allow-files were not used', () => {
        const cmd = () => helper.command.tagAllComponentsNew();
        const error = new FailedLoadForTag(['foo'], ['bar', 'foo']);
        helper.general.expectToThrow(cmd, error);
      });
      it('should still throw an error when --allow-relative-paths is used but not --allow-files', () => {
        const cmd = () => helper.command.tagAllComponentsNew('--allow-relative-paths');
        const error = new FailedLoadForTag([], ['bar', 'foo']);
        helper.general.expectToThrow(cmd, error);
      });
      it('should still throw an error when --allow-files is used but not --allow-relative-paths', () => {
        const cmd = () => helper.command.tagAllComponentsNew('--allow-files');
        const error = new FailedLoadForTag(['foo'], []);
        helper.general.expectToThrow(cmd, error);
      });
      describe('when using both --allow-relative-paths and --allow-files', () => {
        let output;
        before(() => {
          output = helper.command.tagAllComponents();
        });
        it('should succeed', () => {
          expect(output).to.have.string('2 component(s) tagged');
        });
        it('should add rootDir of "." for both components', () => {
          const bitMap = helper.bitMap.read();
          const componentMapFoo = bitMap['foo@0.0.1'];
          expect(componentMapFoo).to.not.have.property('trackDir');
          expect(componentMapFoo).to.have.property('rootDir');
          expect(componentMapFoo.rootDir).to.equal('.');
          const componentMapBar = bitMap['bar@0.0.1'];
          expect(componentMapBar).to.not.have.property('trackDir');
          expect(componentMapBar).to.have.property('rootDir');
          expect(componentMapBar.rootDir).to.equal('.');
        });
      });
    });
  });
});
