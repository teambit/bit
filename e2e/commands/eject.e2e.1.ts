import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import R from 'ramda';

import { failureEjectMessage, successEjectMessage } from '../../src/cli/templates/eject-template';
import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('bit eject command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  describe('local component', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
    });
    describe('non existing component', () => {
      it('show an error saying the component was not found', () => {
        const useFunc = () => helper.command.ejectComponents('utils/non-exist');
        const error = new MissingBitMapComponent('utils/non-exist');
        helper.general.expectToThrow(useFunc, error);
      });
    });
    describe('tagged component before export', () => {
      let output;
      before(() => {
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        output = helper.command.ejectComponents('bar/foo');
      });
      it('should indicate that local components cannot be ejected as it was not exported', () => {
        expect(output).to.have.string(failureEjectMessage);
        expect(output).to.have.string('not exported yet');
      });
      describe('after export', () => {
        before(() => {
          helper.scopeHelper.reInitRemoteScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.exportAllComponents();
          output = helper.command.ejectComponents('bar/foo');
        });
        it('should indicate that eject is not available on self hosting scope', () => {
          expect(output).to.have.string(failureEjectMessage);
          expect(output).to.have.string('self hosted scope');
        });
      });
    });
  });

  (supportNpmCiRegistryTesting ? describe : describe.skip)('using a registry', function () {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('as author with one component', () => {
      let ejectOutput;
      let scopeBeforeEject;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        npmCiRegistry.setCiScopeInBitJson();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.publishComponent('bar/foo');

        scopeBeforeEject = helper.scopeHelper.cloneLocalScope();
      });
      describe('eject from consumer root', () => {
        before(() => {
          ejectOutput = helper.command.ejectComponents('bar/foo');
        });
        it('should indicate that the eject was successful', () => {
          expect(ejectOutput).to.have.string(successEjectMessage);
        });
        it('should save the component in package.json', () => {
          const packageJson = helper.packageJson.read();
          expect(packageJson).to.have.property('dependencies');
          const packageName = `@ci/${helper.scopes.remote}.bar.foo`;
          expect(packageJson.dependencies).to.have.property(packageName);
          expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const fileInPackage = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.foo`, 'foo.js');
          expect(path.join(helper.scopes.localPath, fileInPackage)).to.be.a.path();
          const fileContent = helper.fs.readFile(fileInPackage);
          expect(fileContent).to.equal(fixtures.fooFixture);
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.scopes.localPath, 'bar', 'foo.js')).not.to.be.a.path();
        });
        it('should delete the component from bit.map', () => {
          const bitMap = helper.bitMap.read();
          Object.keys(bitMap).forEach((id) => {
            expect(id).not.to.have.string('foo');
          });
        });
        it('bit status should show a clean state', () => {
          helper.command.expectStatusToBeClean();
        });
        it('should not delete the objects from the scope', () => {
          const listScope = helper.command.listLocalScopeParsed('--scope');
          const ids = listScope.map((l) => l.id);
          expect(ids).to.include(`${helper.scopes.remote}/bar/foo`);
        });
        describe('importing the component after ejecting it', () => {
          let importOutput;
          before(() => {
            helper.scopeHelper.addRemoteScope();
            importOutput = helper.command.importComponent('bar/foo');
          });
          it('should import the component successfully', () => {
            expect(importOutput).to.have.string('successfully imported');
          });
        });
      });
      describe('eject from an inner directory', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeEject);
          ejectOutput = helper.command.runCmd('bit eject bar/foo', path.join(helper.scopes.localPath, 'bar'));
        });
        it('should indicate that the eject was successful', () => {
          expect(ejectOutput).to.have.string(successEjectMessage);
        });
        it('should save the component in package.json', () => {
          const packageJson = helper.packageJson.read();
          expect(packageJson).to.have.property('dependencies');
          const packageName = `@ci/${helper.scopes.remote}.bar.foo`;
          expect(packageJson.dependencies).to.have.property(packageName);
          expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const fileInPackage = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.foo`, 'foo.js');
          expect(path.join(helper.scopes.localPath, fileInPackage)).to.be.a.path();
          const fileContent = helper.fs.readFile(fileInPackage);
          expect(fileContent).to.equal(fixtures.fooFixture);
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.scopes.localPath, 'bar', 'foo.js')).not.to.be.a.path();
        });
        it('bit status should show a clean state', () => {
          helper.command.expectStatusToBeClean();
        });
      });
      describe('eject two components, the additional one has not been exported yet', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeEject);
          helper.fs.createFile('bar', 'foo2.js');
          helper.command.addComponent('bar/foo2.js', { i: 'bar/foo2' });
          helper.command.tagAllComponents();
          ejectOutput = helper.command.ejectComponentsParsed('bar/foo bar/foo2');
        });
        it('should indicate that the only exported one has been ejected', () => {
          expect(ejectOutput.ejectedComponents[0].name).to.equal('bar/foo');
          expect(ejectOutput.failedComponents.notExportedComponents[0].name).to.equal('bar/foo2');
        });
      });
      describe('two components, one exported, one modified', () => {
        let scopeAfterModification;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeEject);
          helper.fs.createFile('bar', 'foo2.js');
          helper.command.addComponent('bar/foo2.js', { i: 'bar/foo2' });
          helper.command.tagAllComponents();
          helper.scopeHelper.addRemoteScope();
          helper.command.exportAllComponents();
          helper.scopeHelper.removeRemoteScope();
          npmCiRegistry.publishComponent('bar/foo2');
          helper.fs.createFile('bar', 'foo2.js', 'console.log("v2");'); // modify bar/foo2
          scopeAfterModification = helper.scopeHelper.cloneLocalScope();
        });
        describe('eject without --force flag', () => {
          before(() => {
            ejectOutput = helper.command.ejectComponentsParsed('bar/foo bar/foo2');
          });
          it('should indicate that the only exported one has been ejected and the other is modified', () => {
            expect(ejectOutput.ejectedComponents[0].name).to.equal('bar/foo');
            expect(ejectOutput.failedComponents.modifiedComponents[0].name).to.equal('bar/foo2');
          });
        });
        describe('eject with --force flag', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterModification);
            ejectOutput = helper.command.ejectComponentsParsed('bar/foo bar/foo2', '--force');
          });
          it('should indicate that both components where ejected', () => {
            expect(ejectOutput.ejectedComponents.length).to.equal(2);
            expect(ejectOutput.failedComponents.modifiedComponents.length).to.equal(0);
          });
        });
        describe('two components, one exported, one staged', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterModification);
            helper.command.tagAllComponents();
          });
          describe('eject without --force flag', () => {
            before(() => {
              ejectOutput = helper.command.ejectComponentsParsed('bar/foo bar/foo2');
            });
            it('should indicate that the only exported one has been ejected and the other is staged', () => {
              expect(ejectOutput.ejectedComponents[0].name).to.equal('bar/foo');
              expect(ejectOutput.failedComponents.stagedComponents[0].name).to.equal('bar/foo2');
            });
          });
        });
      });
    });
    describe('export components with dependencies', () => {
      let remoteScope;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
        helper.fixtures.addComponentUtilsIsString();
        helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
        helper.fixtures.addComponentBarFoo();
        npmCiRegistry.setCiScopeInBitJson();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        remoteScope = helper.scopeHelper.cloneRemoteScope();

        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.unpublishComponent('bar.foo');
        npmCiRegistry.unpublishComponent('utils.is-string');
        npmCiRegistry.unpublishComponent('utils.is-type');
        npmCiRegistry.publishComponent('bar/foo');
        npmCiRegistry.publishComponent('utils/is-string');
        npmCiRegistry.publishComponent('utils/is-type');

        helper.fs.createFileOnRootLevel(
          'app.js',
          `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo());`
        );
      });
      it('an intermediate step, make sure the app.js is working', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      describe('as author', () => {
        describe('eject the dependent only', () => {
          let ejectOutput;
          before(() => {
            ejectOutput = helper.command.ejectComponents('bar/foo');
          });
          it('should eject only the specified component and not its dependencies', () => {
            expect(ejectOutput).to.have.string(successEjectMessage);
            expect(ejectOutput).to.have.string('bar/foo');
            expect(ejectOutput).to.not.have.string('utils/is-type');
            expect(ejectOutput).to.not.have.string('utils/is-string');
          });
          it('app.js should work after replacing the link in node_modules to an actual package', () => {
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
          it('should save the ejected component only in package.json', () => {
            const packageJson = helper.packageJson.read();
            expect(packageJson).to.have.property('dependencies');
            expect(Object.keys(packageJson.dependencies)).to.have.lengthOf(1);
            const packageName = `@ci/${helper.scopes.remote}.bar.foo`;
            expect(packageJson.dependencies).to.have.property(packageName);
            expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
          });
          it('should have the component files as a package (in node_modules)', () => {
            const fileInPackage = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.foo`, 'bar/foo.js');
            expect(path.join(helper.scopes.localPath, fileInPackage)).to.be.a.path();
            const fileContent = helper.fs.readFile(fileInPackage);
            expect(fileContent).to.equal(fixtures.barFooFixture);
          });
          it('should delete the ejected component files from the file-system', () => {
            expect(path.join(helper.scopes.localPath, 'bar', 'foo.js')).not.to.be.a.path();
          });
          it('should not delete the non-ejected component files from the file-system', () => {
            expect(path.join(helper.scopes.localPath, 'utils', 'is-string.js')).to.be.a.file();
            expect(path.join(helper.scopes.localPath, 'utils', 'is-type.js')).to.be.a.file();
          });
          it('should delete the component from bit.map', () => {
            const bitMap = helper.bitMap.read();
            Object.keys(bitMap).forEach((id) => {
              expect(id).not.to.have.string('foo');
            });
          });
          it('bit status should show a clean state', () => {
            helper.command.expectStatusToBeClean();
          });
        });
      });
      describe('as imported', () => {
        describe('importing and ejecting the dependent', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            npmCiRegistry.setCiScopeInBitJson();
            helper.command.importComponent('bar/foo');
            // an intermediate step, make sure the workspace is clean
            helper.command.expectStatusToBeClean();

            helper.fs.createFile('components/bar/foo/bar/', 'foo.js', fixtures.barFooFixtureV2);
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            helper.scopeHelper.removeRemoteScope();
            npmCiRegistry.publishComponent('bar/foo', '0.0.2');

            helper.command.ejectComponents('bar/foo');
            helper.fs.createFileOnRootLevel(
              'app.js',
              `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo());`
            );
          });
          it('should bring the modified version (v2) as a package', () => {
            const packageJson = helper.packageJson.read();
            expect(packageJson).to.have.property('dependencies');
            const packageName = `@ci/${helper.scopes.remote}.bar.foo`;
            expect(packageJson.dependencies).to.have.property(packageName);
            expect(packageJson.dependencies[packageName]).to.equal('0.0.2');
          });
          it('should be able to require and print the results from v2', () => {
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
          });
          it('should delete the imported component files from the file-system', () => {
            expect(path.join(helper.scopes.localPath, 'components/bar/foo/bar/foo.js')).not.to.be.a.path();
          });
          it('should delete the component from bit.map', () => {
            const bitMap = helper.bitMap.read();
            Object.keys(bitMap).forEach((id) => {
              expect(id).not.to.have.string('foo');
            });
          });
          it('bit status should show a clean state', () => {
            helper.command.expectStatusToBeClean();
          });
          it('should not delete the objects from the scope', () => {
            const listScope = helper.command.listLocalScopeParsed('--scope');
            const ids = listScope.map((l) => l.id);
            expect(ids).to.include(`${helper.scopes.remote}/bar/foo`);
          });
        });
        describe('importing the dependency directly', () => {
          let scopeBeforeEjecting;
          before(() => {
            helper.scopeHelper.getClonedRemoteScope(remoteScope);
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('bar/foo');
            helper.command.importComponent('utils/is-string');
            // an intermediate step, make sure the workspace is clean
            helper.command.expectStatusToBeClean();
            helper.fs.createFile('components/utils/is-string/', 'is-string.js', fixtures.isStringV2);

            npmCiRegistry.setCiScopeInBitJson();
            helper.command.tagScope('2.0.0', 'msg', '-a');
            helper.command.exportAllComponents();
            helper.scopeHelper.removeRemoteScope();
            npmCiRegistry.publishComponent('bar/foo', '2.0.0');
            npmCiRegistry.publishComponent('utils/is-string', '2.0.0');

            helper.fs.createFileOnRootLevel(
              'app.js',
              `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo());`
            );
            scopeBeforeEjecting = helper.scopeHelper.cloneLocalScope();
          });
          describe('ejecting the dependency successfully', () => {
            let ejectOutput;
            before(() => {
              ejectOutput = helper.command.ejectComponents('utils/is-string');
            });
            it('should bring the modified version (v2) as a package', () => {
              const packageJson = helper.packageJson.read();
              expect(packageJson).to.have.property('dependencies');
              const packageName = `@ci/${helper.scopes.remote}.utils.is-string`;
              expect(packageJson.dependencies).to.have.property(packageName);
              expect(packageJson.dependencies[packageName]).to.equal('2.0.0');
            });
            it('should be able to require and print the results from v2', () => {
              const result = helper.command.runCmd('node app.js');
              expect(result.trim()).to.have.string('got is-type and got is-string v2 and got foo');
            });
            it('should delete the imported component files from the file-system', () => {
              expect(path.join(helper.scopes.localPath, 'components/utils/is-string/is-string.js')).not.to.be.a.path();
            });
            it('should delete the component from bit.map', () => {
              const bitMap = helper.bitMap.read();
              Object.keys(bitMap).forEach((id) => {
                expect(id).not.to.have.string('is-string');
              });
            });
            it('bit status should show a clean state', () => {
              helper.command.expectStatusToBeClean();
            });
            it('should not delete any objects from the scope', () => {
              const listScope = helper.command.listLocalScope('--scope');
              expect(listScope).to.have.string('is-string');
              expect(listScope).to.have.string('is-type');
              expect(listScope).to.have.string('bar/foo');
            });
            it('should change the dependents package.json to have the dependency with version', () => {
              const packageJson = helper.packageJson.readComponentPackageJson('bar/foo');
              expect(packageJson.dependencies).to.have.property(`@ci/${helper.scopes.remote}.utils.is-string`);
              expect(packageJson.dependencies[`@ci/${helper.scopes.remote}.utils.is-string`]).to.equal('2.0.0');
            });
            it('should run npm install from the dependent dir', () => {
              expect(ejectOutput).to.have.string('successfully ran npm install at components/bar/foo');
            });
          });
          describe('failure while ejecting the dependency', () => {
            let packageJsonBefore;
            let bitMapBefore;
            let bitJsonBefore;
            before(() => {
              helper.scopeHelper.getClonedLocalScope(scopeBeforeEjecting);
              packageJsonBefore = helper.packageJson.read();
              bitMapBefore = helper.bitMap.read();
              bitJsonBefore = helper.bitJson.read();
            });
            describe('when getting the component status has failed', () => {
              let errorFailure;
              before(() => {
                const renameMainComponentFile = () => {
                  const currentFile = path.join(helper.scopes.localPath, 'components/utils/is-string/is-string.js');
                  const renamedFile = path.join(helper.scopes.localPath, 'components/utils/is-string/is-string2.js');
                  fs.moveSync(currentFile, renamedFile);
                };
                renameMainComponentFile();
                errorFailure = helper.general.runWithTryCatch('bit eject utils/is-string');
              });
              it('should indicate with the error message that no changes have been done yet', () => {
                expect(errorFailure).to.have.string('no action has been done');
              });
              it('should show the original error message', () => {
                expect(errorFailure).to.have.string('main file');
                expect(errorFailure).to.have.string('was removed');
              });
              it('should not change the package.json file', () => {
                const packageJsonNow = helper.packageJson.read();
                expect(packageJsonNow).to.deep.equal(packageJsonBefore);
              });
              it('should not change the .bitmap file', () => {
                const bitMapNow = helper.bitMap.read();
                expect(bitMapNow).to.deep.equal(bitMapBefore);
              });
              it('should not change the bit.json file', () => {
                const bitJsonNow = helper.bitJson.read();
                expect(bitJsonNow).to.deep.equal(bitJsonBefore);
              });
            });
            describe('when npm install has failed', () => {
              let errorFailure;
              let packageJsonWithChanges;
              before(() => {
                helper.scopeHelper.getClonedLocalScope(scopeBeforeEjecting);
                packageJsonWithChanges = R.clone(packageJsonBefore);
                const addNonExistVersionToPackageJson = () => {
                  packageJsonWithChanges.dependencies[`@ci/${helper.scopes.remote}.bar.foo`] = '1.1.1';
                  helper.packageJson.write(packageJsonWithChanges);
                };
                addNonExistVersionToPackageJson();
                errorFailure = helper.general.runWithTryCatch('bit eject utils/is-string');
              });
              it('should indicate with the error message that package.json has been restored', () => {
                expect(errorFailure).to.have.string('your package.json (if existed) has been restored');
              });
              it('should suggest to run bit link', () => {
                expect(errorFailure).to.have.string('please run "bit link"');
              });
              it('should show the original error message', () => {
                expect(errorFailure).to.have.string('failed running npm install');
              });
              it('should not change the package.json file', () => {
                const packageJsonNow = helper.packageJson.read();
                expect(packageJsonNow).to.deep.equal(packageJsonWithChanges);
              });
              it('should not change the .bitmap file', () => {
                const bitMapNow = helper.bitMap.read();
                expect(bitMapNow).to.deep.equal(bitMapBefore);
              });
              it('should not change the bit.json file', () => {
                const bitJsonNow = helper.bitJson.read();
                expect(bitJsonNow).to.deep.equal(bitJsonBefore);
              });
              it('should not delete the component files from the filesystem', () => {
                expect(path.join(helper.scopes.localPath, 'components/utils/is-string/is-string.js')).to.be.a.file();
              });
            });
          });
        });
      });
    });
  });
});
