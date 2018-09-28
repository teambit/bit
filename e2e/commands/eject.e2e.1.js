import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';
import BitsrcTester, { username, supportTestingOnBitsrc } from '../bitsrc-tester';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import * as fixtures from '../fixtures/fixtures';
import { ComponentNotFound } from '../../src/scope/exceptions';
import { failureEjectMessage, successEjectMessage } from '../../src/cli/commands/public-cmds/eject-cmd';

chai.use(require('chai-fs'));

describe('bit eject command', function () {
  this.timeout(0);
  const helper = new Helper();
  const bitsrcTester = new BitsrcTester();
  describe('local component', () => {
    before(() => {
      helper.reInitLocalScope();
    });
    describe('non existing component', () => {
      it('show an error saying the component was not found', () => {
        const useFunc = () => helper.ejectComponents('utils/non-exist');
        const error = new ComponentNotFound('utils/non-exist');
        helper.expectToThrow(useFunc, error);
      });
    });
    describe('tagged component before export', () => {
      let output;
      before(() => {
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagAllWithoutMessage();
        output = helper.ejectComponentsParsed('bar/foo');
      });
      it('should indicate that local components cannot be ejected as it was not exported', () => {
        expect(output).to.have.string(failureEjectMessage);
        expect(output).to.have.string('not exported yet');
      });
    });
  });

  (supportTestingOnBitsrc ? describe : describe.skip)('using bitsrc with one component', function () {
    let scopeName;
    before(() => {
      return bitsrcTester
        .loginToBitSrc()
        .then(() => bitsrcTester.createScope())
        .then((scope) => {
          scopeName = scope;
        });
    });
    after(() => {
      helper.destroyEnv();
      return bitsrcTester.deleteScope(scopeName);
    });
    describe('as author', () => {
      let ejectOutput;
      let scopeBeforeEject;
      let remoteScopeName;
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagAllWithoutMessage();
        remoteScopeName = `${username}.${scopeName}`;
        helper.exportAllComponents(remoteScopeName);
        scopeBeforeEject = helper.cloneLocalScope();
      });
      describe('eject from consumer root', () => {
        before(() => {
          ejectOutput = helper.ejectComponents('bar/foo');
        });
        it('should indicate that the eject was successful', () => {
          expect(ejectOutput).to.have.string(successEjectMessage);
        });
        it('should save the component in package.json', () => {
          const packageJson = helper.readPackageJson();
          expect(packageJson).to.have.property('dependencies');
          const packageName = `@bit/${username}.${scopeName}.bar.foo`;
          expect(packageJson.dependencies).to.have.property(packageName);
          expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const fileInPackage = path.join('node_modules/@bit', `${remoteScopeName}.bar.foo`, 'foo.js');
          expect(path.join(helper.localScopePath, fileInPackage)).to.be.a.path();
          const fileContent = helper.readFile(fileInPackage);
          expect(fileContent).to.equal(fixtures.fooFixture);
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.localScopePath, 'bar', 'foo.js')).not.to.be.a.path();
        });
        it('should delete the component from bit.map', () => {
          const bitMap = helper.readBitMap();
          Object.keys(bitMap).forEach((id) => {
            expect(id).not.to.have.string('foo');
          });
        });
        it('bit status should show a clean state', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
        });
        it('should not delete the objects from the scope', () => {
          const listScope = helper.listLocalScopeParsed('--scope');
          expect(listScope[0].id).to.have.string('foo');
        });
        describe('importing the component after ejecting it', () => {
          let importOutput;
          before(() => {
            importOutput = helper.runCmd(`bit import ${remoteScopeName}/bar/foo`);
          });
          it('should import the component successfully', () => {
            expect(importOutput).to.have.string('successfully imported');
          });
        });
      });
      describe('eject from an inner directory', () => {
        before(() => {
          helper.getClonedLocalScope(scopeBeforeEject);
          ejectOutput = helper.runCmd('bit eject bar/foo', path.join(helper.localScopePath, 'bar'));
        });
        it('should indicate that the eject was successful', () => {
          expect(ejectOutput).to.have.string(successEjectMessage);
        });
        it('should save the component in package.json', () => {
          const packageJson = helper.readPackageJson();
          expect(packageJson).to.have.property('dependencies');
          const packageName = `@bit/${username}.${scopeName}.bar.foo`;
          expect(packageJson.dependencies).to.have.property(packageName);
          expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const fileInPackage = path.join('node_modules/@bit', `${username}.${scopeName}.bar.foo`, 'foo.js');
          expect(path.join(helper.localScopePath, fileInPackage)).to.be.a.path();
          const fileContent = helper.readFile(fileInPackage);
          expect(fileContent).to.equal(fixtures.fooFixture);
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.localScopePath, 'bar', 'foo.js')).not.to.be.a.path();
        });
        it('bit status should show a clean state', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
        });
      });
      describe('eject two components, the additional one has not been exported yet', () => {
        before(() => {
          helper.getClonedLocalScope(scopeBeforeEject);
          helper.createFile('bar', 'foo2.js');
          helper.addComponent('bar/foo2.js');
          helper.tagAllWithoutMessage();
          ejectOutput = helper.ejectComponentsParsed('bar/foo bar/foo2');
        });
        it('should indicate that the only exported one has been ejected', () => {
          expect(ejectOutput.ejectedComponents[0].name).to.equal('bar/foo');
          expect(ejectOutput.failedComponents.notExportedComponents[0].name).to.equal('bar/foo2');
        });
      });
      describe('two components, one exported, one modified', () => {
        let scopeAfterModification;
        before(() => {
          helper.getClonedLocalScope(scopeBeforeEject);
          helper.createFile('bar', 'foo2.js');
          helper.addComponent('bar/foo2.js');
          helper.tagAllWithoutMessage();
          helper.exportAllComponents(`${username}.${scopeName}`);
          helper.createFile('bar', 'foo2.js', 'console.log("v2");'); // modify bar/foo2
          scopeAfterModification = helper.cloneLocalScope();
        });
        describe('eject without --force flag', () => {
          before(() => {
            ejectOutput = helper.ejectComponentsParsed('bar/foo bar/foo2');
          });
          it('should indicate that the only exported one has been ejected and the other is modified', () => {
            expect(ejectOutput.ejectedComponents[0].name).to.equal('bar/foo');
            expect(ejectOutput.failedComponents.modifiedComponents[0].name).to.equal('bar/foo2');
          });
        });
        describe('eject with --force flag', () => {
          before(() => {
            helper.getClonedLocalScope(scopeAfterModification);
            ejectOutput = helper.ejectComponentsParsed('bar/foo bar/foo2', '--force');
          });
          it('should indicate that both components where ejected', () => {
            expect(ejectOutput.ejectedComponents.length).to.equal(2);
            expect(ejectOutput.failedComponents.modifiedComponents.length).to.equal(0);
          });
        });
        describe('two components, one exported, one staged', () => {
          before(() => {
            helper.getClonedLocalScope(scopeAfterModification);
            helper.tagAllWithoutMessage();
          });
          describe('eject without --force flag', () => {
            before(() => {
              ejectOutput = helper.ejectComponentsParsed('bar/foo bar/foo2');
            });
            it('should indicate that the only exported one has been ejected and the other is staged', () => {
              expect(ejectOutput.ejectedComponents[0].name).to.equal('bar/foo');
              expect(ejectOutput.failedComponents.stagedComponents[0].name).to.equal('bar/foo2');
            });
          });
        });
      });
    });
  });
  (supportTestingOnBitsrc ? describe : describe.skip)('using bitsrc, creating component with dependencies', function () {
    let scopeName;
    before(() => {
      return bitsrcTester
        .loginToBitSrc()
        .then(() => bitsrcTester.createScope())
        .then((scope) => {
          scopeName = scope;
        });
    });
    after(() => {
      helper.destroyEnv();
      return bitsrcTester.deleteScope(scopeName);
    });
    describe('export components with dependencies', () => {
      let remoteScopeName;
      before(() => {
        helper.reInitLocalScope();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.tagAllWithoutMessage();
        remoteScopeName = `${username}.${scopeName}`;
        helper.exportAllComponents(remoteScopeName);
        helper.createFileOnRootLevel(
          'app.js',
          `const barFoo = require('@bit/${remoteScopeName}.bar.foo'); console.log(barFoo());`
        );
      });
      it('an intermediate step, make sure the app.js is working', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      describe('as author', () => {
        describe('eject the dependent only', () => {
          let ejectOutput;
          before(() => {
            ejectOutput = helper.ejectComponents('bar/foo');
          });
          it('should eject only the specified component and not its dependencies', () => {
            expect(ejectOutput).to.have.string(successEjectMessage);
            expect(ejectOutput).to.have.string('bar/foo');
            expect(ejectOutput).to.not.have.string('utils/is-type');
            expect(ejectOutput).to.not.have.string('utils/is-string');
          });
          it('app.js should work after replacing the link in node_modules to an actual package', () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
          it('should save the ejected component only in package.json', () => {
            const packageJson = helper.readPackageJson();
            expect(packageJson).to.have.property('dependencies');
            expect(Object.keys(packageJson.dependencies)).to.have.lengthOf(1);
            const packageName = `@bit/${username}.${scopeName}.bar.foo`;
            expect(packageJson.dependencies).to.have.property(packageName);
            expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
          });
          it('should have the component files as a package (in node_modules)', () => {
            const fileInPackage = path.join('node_modules/@bit', `${remoteScopeName}.bar.foo`, 'bar/foo.js');
            expect(path.join(helper.localScopePath, fileInPackage)).to.be.a.path();
            const fileContent = helper.readFile(fileInPackage);
            expect(fileContent).to.equal(fixtures.barFooFixture);
          });
          it('should delete the ejected component files from the file-system', () => {
            expect(path.join(helper.localScopePath, 'bar', 'foo.js')).not.to.be.a.path();
          });
          it('should not delete the non-ejected component files from the file-system', () => {
            expect(path.join(helper.localScopePath, 'utils', 'is-string.js')).to.be.a.file();
            expect(path.join(helper.localScopePath, 'utils', 'is-type.js')).to.be.a.file();
          });
          it('should delete the component from bit.map', () => {
            const bitMap = helper.readBitMap();
            Object.keys(bitMap).forEach((id) => {
              expect(id).not.to.have.string('foo');
            });
          });
          it('bit status should show a clean state', () => {
            const output = helper.runCmd('bit status');
            expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
          });
        });
      });
      describe('as imported', () => {
        describe('importing and ejecting the dependent', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.runCmd(`bit import ${remoteScopeName}/bar/foo`);
            // an intermediate step, make sure the workspace is clean
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string(statusWorkspaceIsCleanMsg);
            helper.createFile('components/bar/foo/bar/', 'foo.js', fixtures.barFooFixtureV2);
            helper.tagAllWithoutMessage();
            helper.exportAllComponents(remoteScopeName);
            helper.ejectComponents('bar/foo');
            helper.createFileOnRootLevel(
              'app.js',
              `const barFoo = require('@bit/${remoteScopeName}.bar.foo'); console.log(barFoo());`
            );
          });
          it('should bring the modified version (v2) as a package', () => {
            const packageJson = helper.readPackageJson();
            expect(packageJson).to.have.property('dependencies');
            const packageName = `@bit/${remoteScopeName}.bar.foo`;
            expect(packageJson.dependencies).to.have.property(packageName);
            expect(packageJson.dependencies[packageName]).to.equal('0.0.2');
          });
          it('should be able to require and print the results from v2', () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
          });
          it('should delete the imported component files from the file-system', () => {
            expect(path.join(helper.localScopePath, 'components/bar/foo/bar/foo.js')).not.to.be.a.path();
          });
          it('should delete the component from bit.map', () => {
            const bitMap = helper.readBitMap();
            Object.keys(bitMap).forEach((id) => {
              expect(id).not.to.have.string('foo');
            });
          });
          it('bit status should show a clean state', () => {
            const output = helper.runCmd('bit status');
            expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
          });
          it('should not delete the objects from the scope', () => {
            const listScope = helper.listLocalScopeParsed('--scope');
            expect(listScope[0].id).to.have.string('foo');
          });
        });
        // @todo: fix
        describe.skip('importing and ejecting the dependency', () => {
          before(() => {
            helper.reInitLocalScope();
            helper.runCmd(`bit import ${remoteScopeName}/bar/foo`);
            helper.runCmd(`bit import ${remoteScopeName}/utils/is-string`);
            // an intermediate step, make sure the workspace is clean
            const statusOutput = helper.status();
            expect(statusOutput).to.have.string(statusWorkspaceIsCleanMsg);
            helper.createFile('components/utils/is-string/utils/', 'is-string.js', fixtures.isStringV2);
            helper.tagAllWithoutMessage();
            helper.exportAllComponents(remoteScopeName);
            helper.ejectComponents('utils/is-string');
            helper.createFileOnRootLevel(
              'app.js',
              `const barFoo = require('@bit/${remoteScopeName}.bar.foo'); console.log(barFoo());`
            );
          });
          it('should bring the modified version (v2) as a package', () => {
            const packageJson = helper.readPackageJson();
            expect(packageJson).to.have.property('dependencies');
            const packageName = `@bit/${remoteScopeName}.utils.is-string`;
            expect(packageJson.dependencies).to.have.property(packageName);
            expect(packageJson.dependencies[packageName]).to.equal('0.0.2');
          });
          it('should be able to require and print the results from v2', () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string v2 and got foo');
          });
          it('should delete the imported component files from the file-system', () => {
            expect(
              path.join(helper.localScopePath, 'components/utils/is-string/utils/is-string.js')
            ).not.to.be.a.path();
          });
          it('should delete the component from bit.map', () => {
            const bitMap = helper.readBitMap();
            Object.keys(bitMap).forEach((id) => {
              expect(id).not.to.have.string('is-string');
            });
          });
          it('bit status should show a clean state', () => {
            const output = helper.runCmd('bit status');
            expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
          });
          it('should not delete the objects from the scope', () => {
            const listScope = helper.listLocalScopeParsed('--scope');
            expect(listScope[0].id).to.have.string('is-string');
          });
        });
      });
    });
  });
});
