import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

describe('custom module resolutions', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('using custom module directory', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.writeBitJson(bitJson);

      helper.createFile('src/utils', 'is-type.js', fixtures.isType);
      const isStringFixture =
        "const isType = require('utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      const barFooFixture =
        "const isString = require('utils/is-string'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/utils/is-type.js');
      helper.addComponent('src/utils/is-string.js');
      helper.addComponent('src/bar/foo.js');
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.showComponentParsed('bar/foo');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].importSource).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
    });
    describe('importing the component', () => {
      before(() => {
        helper.tagAllWithoutMessage();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
    });
  });
  describe('using alias', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { aliases: { '@': 'src' } };
      helper.writeBitJson(bitJson);

      helper.createFile('src/utils', 'is-type.js', fixtures.isType);
      const isStringFixture =
        "const isType = require('@/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      const barFooFixture =
        "const isString = require('@/utils/is-string'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/utils/is-type.js');
      helper.addComponent('src/utils/is-string.js');
      helper.addComponent('src/bar/foo.js');
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.showComponentParsed('bar/foo');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].importSource).to.equal('@/utils/is-string');
      expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
    });
    describe('importing the component', () => {
      before(() => {
        helper.tagAllWithoutMessage();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      describe('deleting the link generated for the custom-module-resolution', () => {
        before(() => {
          fs.removeSync(path.join(helper.localScopePath, 'components/bar/foo/node_modules'));
        });
        it('bit status should show it as missing links and not as missing packages dependencies', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.string('missing links');
          expect(output).to.not.have.string('missing packages dependencies');
        });
        describe('bit link', () => {
          let linkOutput;
          before(() => {
            linkOutput = helper.runCmd('bit link');
          });
          it('should recreate the missing link', () => {
            expect(linkOutput).to.have.string('components/bar/foo/node_modules/@/utils/is-string');
          });
          it('should recreate the links correctly', () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
    });
  });
});
