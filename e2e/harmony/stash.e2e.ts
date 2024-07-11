import chai, { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit stash command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic stash', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.stash();
    });
    it('should change the code to the last tag', () => {
      const content = helper.fs.readFile('comp1/index.js');
      expect(content).to.not.have.string('version2');
    });
    it('should create a stash-file', () => {
      const stashPath = path.join(helper.scopes.localPath, '.bit/stash/stash-1.json');
      expect(stashPath).to.be.a.file();
    });
    it('should checkout-reset the component', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    describe('stash load', () => {
      before(() => {
        helper.command.stashLoad();
      });
      it('should return the code that was stashed before', () => {
        const content = helper.fs.readFile('comp1/index.js');
        expect(content).to.have.string('version2');
      });
      it('bit status should show the component as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(1);
      });
      it('should delete the stash file', () => {
        const stashPath = path.join(helper.scopes.localPath, '.bit/stash/stash-1.json');
        expect(stashPath).to.not.be.a.path();
      });
    });
  });
  describe('stash and local have conflicting modification', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, false, 'from-stash');
      helper.command.stash();
      helper.fs.outputFile('comp1/foo.js', 'console.log("hello");');
      helper.fs.appendFile('comp1/index.js', '\n\n\nconsole.log("hello");');
      helper.command.stashLoad('--manual');
    });
    it('should save the file with conflicts markers', () => {
      const index = helper.fs.readFile('comp1/index.js');
      expect(index).to.have.string('<<<<<<< 0.0.1 modified');
      expect(index).to.have.string('from-stash');
      expect(index).to.have.string('>>>>>>> stash');
    });
  });
  describe('stash the modification from 0.0.1 then tag 0.0.2', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/index.js', 'console.log("hello");\n\n');
      helper.command.tagAllWithoutBuild();
      helper.fs.appendFile('comp1/index.js', '\nconsole.log("from-stash");\n\n');
      helper.command.stash();
      helper.fs.outputFile('comp1/index.js', 'console.log("from-modification");\n\n');
      helper.command.tagAllWithoutBuild();
      helper.command.stashLoad();
    });
    it('should use 0.0.1 as the "base-version", find the modification from 0.0.1 and apply them on top of 0.0.2', () => {
      const index = helper.fs.readFile('comp1/index.js');
      expect(index).to.have.string('from-stash');
      expect(index).to.have.string('from-modification');
      expect(index).to.not.have.string('hello');
    });
  });
  describe('stash and local have modification with a shared base - 0.0.1', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/index.js', 'console.log("hello");\n\n');
      helper.command.tagAllWithoutBuild();
      helper.fs.appendFile('comp1/index.js', '\nconsole.log("from-stash");\n\n');
      helper.command.stash();
      helper.fs.outputFile('comp1/index.js', 'console.log("from-modification");\n\n');
      helper.command.stashLoad();
    });
    it('should use 0.0.1 as the "base-version", find the modification from 0.0.1 and apply them on the local modifications', () => {
      const index = helper.fs.readFile('comp1/index.js');
      expect(index).to.have.string('from-stash');
      expect(index).to.have.string('from-modification');
      expect(index).to.not.have.string('hello');
    });
  });
});
