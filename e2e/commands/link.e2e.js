import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';

chai.use(require('chai-fs'));

describe('bit link', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('author components', () => {
    describe('before export', () => {
      let linkOutput;
      before(() => {
        helper.reInitLocalScope();
        const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
        helper.createComponent('utils', 'is-type.js', isTypeFixture);
        helper.addComponent('utils/is-type.js');
        linkOutput = helper.runCmd('bit link');
      });
      it('should not create any link because there is no scope yet (until export)', () => {
        expect(linkOutput).to.have.string('nothing to link because the component was not exported yet');
        expect(path.join(helper.localScopePath, 'node_modules')).to.not.be.a.path();
      });
    });
    describe('after export', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
        helper.createComponent('utils', 'is-type.js', isTypeFixture);
        helper.addComponent('utils/is-type.js');
        helper.commitAllComponents();
        helper.exportAllComponents();
        const isStringFixture = `const isType = require('@bit/${
          helper.remoteScope
        }.utils.is-type/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
        helper.createComponent('utils', 'is-string.js', isStringFixture);
        helper.addComponent('utils/is-string.js');
        const appJsFixture = "const isString = require('./utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      });
      it('should generate the links as part of the export process', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string');
      });
      describe('after deleting node_modules and running bit link', () => {
        before(() => {
          fs.removeSync(path.join(helper.localScopePath, 'node_modules'));
          helper.runCmd('bit link');
        });
        it('should re-generate the links successfully', () => {
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string');
        });
      });
    });
  });
  describe('with custom bind name in bit.json', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('bindingPrefix', 'testLink');
      helper.importComponent('bar/foo');
    });
    describe('auto linking', () => {
      it('node_modules should contain custom dir name', () => {
        expect(path.join(helper.localScopePath, 'node_modules', 'testLink')).to.be.a.path();
      });
      it('should create symlink inside custom folder', () => {
        expect(
          path.join(helper.localScopePath, 'node_modules', 'testLink', `${helper.remoteScope}.bar.foo`)
        ).to.be.a.path();
      });
      it('should point to generated symlink', () => {
        expect(
          path.join(helper.localScopePath, 'node_modules', 'testLink', `${helper.remoteScope}.bar.foo`, 'index.js')
        ).to.be.a.file();
      });
    });
    describe('manual linking', () => {
      before(() => {
        fs.removeSync(path.join(helper.localScopePath, 'node_modules', 'testLink'));
        helper.runCmd('bit link');
      });
      it('node_modules should contain custom dir name', () => {
        expect(path.join(helper.localScopePath, 'node_modules', 'testLink')).to.be.a.path();
      });
      it('should create symlink inside custom folder', () => {
        expect(
          path.join(helper.localScopePath, 'node_modules', 'testLink', `${helper.remoteScope}.bar.foo`)
        ).to.be.a.path();
      });
      it('should point to generated symlink', () => {
        expect(
          path.join(helper.localScopePath, 'node_modules', 'testLink', `${helper.remoteScope}.bar.foo`, 'index.js')
        ).to.be.a.file();
      });
    });
  });
  describe('import 2 components into same link dir', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.createComponent('bar2', 'foo2.js');
      helper.addComponent('bar/foo.js');
      helper.addComponent('bar2/foo2.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('bindingPrefix', 'test');
      helper.importComponent('bar/foo');
      helper.importComponent('bar2/foo2');
    });
    it('node_modules should contain custom dir name', () => {
      expect(path.join(helper.localScopePath, 'node_modules', 'test')).to.be.a.path();
      expect(path.join(helper.localScopePath, 'node_modules', 'test', `${helper.remoteScope}.bar.foo`)).to.be.a.path();
      expect(
        path.join(helper.localScopePath, 'node_modules', 'test', `${helper.remoteScope}.bar2.foo2`)
      ).to.be.a.path();
    });
  });
  describe('component with dependency tree of 2', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type');
      const isStringFixture = `const isType = require('${helper.getRequireBitPath(
        'utils',
        'is-type'
      )}'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('bindingPrefix', 'bitTest');
      helper.importComponent('utils/is-string');
    });
    it('node_modules should contain custom dir name', () => {
      expect(path.join(helper.localScopePath, 'node_modules', 'bitTest')).to.be.a.path();
    });
  });
  describe('component with dependency tree of 3', () => {
    before(() => {
      // is-type
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      // is-string
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('bindingPrefix', 'bitTest');
      helper.importComponent('utils/is-type');
      const isStringFixture = `const isType = require('bitTest/${
        helper.remoteScope
      }.utils.is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      // is-string2
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('bindingPrefix', 'bitTest2');
      helper.importComponent('utils/is-string');
      const isStringFixture2 = `const isString = require('bitTest2/${
        helper.remoteScope
      }.utils.is-string'); module.exports = function isString2() { return isString() +  ' and got is-string2'; };`;
      helper.createComponent('test', 'is-string2.js', isStringFixture2);
      helper.addComponent('test/is-string2.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('bindingPrefix', 'bitTest2');
      helper.importComponent('test/is-string2');
    });
    it('node_modules should contain custom dir name', () => {
      expect(path.join(helper.localScopePath, 'node_modules', 'bitTest2')).to.be.a.path();
    });
    it('node_modules should contain custom dir name2', () => {
      expect(
        path.join(
          helper.localScopePath,
          'node_modules',
          'bitTest2',
          `${helper.remoteScope}.test.is-string2`,
          'node_modules',
          'bitTest2'
        )
      ).to.be.a.path();
    });
    it('node_modules should contain custom dir name3', () => {
      expect(
        path.join(
          helper.localScopePath,
          'node_modules',
          'bitTest2',
          `${helper.remoteScope}.test.is-string2/node_modules/bitTest2/${
            helper.remoteScope
          }.utils.is-string/node_modules/bitTest`
        )
      ).to.be.a.path();
    });
    it('should print results from the dependency that uses require absolute syntax', () => {
      const appJsFixture = `const isString2 = require('bitTest2/${
        helper.remoteScope
      }.test.is-string2'); console.log(isString2());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got is-string2');
    });
    describe('bit link after deleting the current node_modules directories', () => {
      before(() => {
        fs.removeSync(path.join(helper.localScopePath, 'node_modules'));
        fs.removeSync(path.join(helper.localScopePath, 'components', 'test', 'is-string2', 'node_modules'));
        helper.runCmd('bit link');
      });
      it('should still print results from the dependency that uses require absolute syntax', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got is-string2');
      });
    });
  });
});
