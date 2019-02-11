import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

chai.use(require('chai-fs'));

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'installing dependencies as packages (not as components)',
  function () {
    this.timeout(0);
    const helper = new Helper();
    const npmCiRegistry = new NpmCiRegistry(helper);
    after(() => {
      helper.destroyEnv();
      npmCiRegistry.destroy();
    });
    before(async () => {
      await npmCiRegistry.init();
    });
    describe('components with nested dependencies', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        npmCiRegistry.setCiScopeInBitJson();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponentUtilsIsType();
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponentUtilsIsString();
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.tagAllComponents();
        helper.tagAllComponents('-s 0.0.2');
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.importComponent('utils/is-type');
        helper.importComponent('utils/is-string');

        helper.importNpmPackExtension();
        helper.removeRemoteScope();
        npmCiRegistry.publishComponent('utils/is-type');
        npmCiRegistry.publishComponent('utils/is-string');
        npmCiRegistry.publishComponent('bar/foo');
        npmCiRegistry.publishComponent('utils/is-type', '0.0.2');
        npmCiRegistry.publishComponent('utils/is-string', '0.0.2');
        npmCiRegistry.publishComponent('bar/foo', '0.0.2');
      });
      describe('installing a component using NPM', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.runCmd('npm init -y');
          helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
      describe('importing a component using Bit', () => {
        let afterImportScope;
        before(() => {
          helper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          npmCiRegistry.setResolver();
          helper.importComponent('bar/foo');
          afterImportScope = helper.cloneLocalScope();
        });
        it('should not create .dependencies directory', () => {
          expect(path.join(helper.localScopePath, 'components/.dependencies')).to.not.be.a.path();
        });
        it('should install the dependencies using NPM', () => {
          const basePath = path.join(helper.localScopePath, 'components/bar/foo/node_modules/@ci');
          expect(path.join(basePath, `${helper.remoteScope}.utils.is-string`, 'is-string.js')).to.be.a.file();
          expect(path.join(basePath, `${helper.remoteScope}.utils.is-type`, 'is-type.js')).to.be.a.file();
        });
        it('bit status should not show any error', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        describe('checkout to an older version', () => {
          before(() => {
            helper.checkout('0.0.1 bar/foo');
          });
          it('should not create .dependencies directory', () => {
            expect(path.join(helper.localScopePath, 'components/.dependencies')).to.not.be.a.path();
          });
          it('should install the dependencies using NPM', () => {
            const basePath = path.join(helper.localScopePath, 'components/bar/foo/node_modules/@ci');
            expect(path.join(basePath, `${helper.remoteScope}.utils.is-string`, 'is-string.js')).to.be.a.file();
            expect(path.join(basePath, `${helper.remoteScope}.utils.is-type`, 'is-type.js')).to.be.a.file();
          });
          it('bit status should not show any error', () => {
            const output = helper.runCmd('bit status');
            expect(output).to.have.a.string('pending updates');
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
            fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
        describe('import all dependencies directly', () => {
          before(() => {
            helper.getClonedLocalScope(afterImportScope);
            helper.importComponent('utils/is-string');
            helper.importComponent('utils/is-type');
          });
          it('should write the correct scope in the package.json file', () => {
            const packageJson = helper.readPackageJson();
            const packages = Object.keys(packageJson.dependencies);
            expect(packages).to.include(`@ci/${helper.remoteScope}.bar.foo`);
            expect(packages).to.include(`@ci/${helper.remoteScope}.utils.is-string`);
            expect(packages).to.include(`@ci/${helper.remoteScope}.utils.is-type`);
          });
          it('bit status should not show any error', () => {
            const output = helper.runCmd('bit status');
            expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
          });
          describe('bit checkout all components to an older version', () => {
            let checkoutOutput;
            before(() => {
              checkoutOutput = helper.checkout('0.0.1 --all');
            });
            it('should not crash and show a success message', () => {
              expect(checkoutOutput).to.have.string('successfully switched');
            });
            it('should update the bit.json of all components to the old version', () => {
              const bitJson = helper.readBitJson();
              const dependencies = bitJson.dependencies;
              expect(dependencies[`${helper.remoteScope}/bar/foo`]).to.equal('0.0.1');
              expect(dependencies[`${helper.remoteScope}/utils/is-string`]).to.equal('0.0.1');
              expect(dependencies[`${helper.remoteScope}/utils/is-type`]).to.equal('0.0.1');
            });
            it('should be able to require its direct dependency and print results from all dependencies', () => {
              const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
              fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
              const result = helper.runCmd('node app.js');
              expect(result.trim()).to.equal('got is-type and got is-string and got foo');
            });
          });
        });
      });
    });
  }
);
