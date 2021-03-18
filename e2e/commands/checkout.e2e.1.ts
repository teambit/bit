import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import { NewerVersionFound } from '../../src/consumer/exceptions';
import Helper, { FileStatusWithoutChalk } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

const barFooV1 = "module.exports = function foo() { return 'got foo'; };";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
const barFooV3 = "module.exports = function foo() { return 'got foo v3'; };";
const successOutput = 'successfully switched';

describe('bit checkout command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  before(() => {
    helper.scopeHelper.reInitLocalScope();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('for non existing component', () => {
    it('show an error saying the component was not found', () => {
      const useFunc = () => helper.command.runCmd('bit checkout 1.0.0 utils/non-exist');
      const error = new MissingBitMapComponent('utils/non-exist');
      helper.general.expectToThrow(useFunc, error);
    });
  });
  describe('after the component was created', () => {
    before(() => {
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFoo();
    });
    it('before tagging it should show an error saying the component was not tagged yet', () => {
      const output = helper.general.runWithTryCatch('bit checkout 1.0.0 bar/foo');
      expect(output).to.have.string("component bar/foo doesn't have any version yet");
    });
    describe('after the component was tagged', () => {
      before(() => {
        helper.command.tagAllComponents('', '0.0.5');
      });
      describe('using a non-exist version', () => {
        it('should show an error saying the version does not exist', () => {
          const output = helper.general.runWithTryCatch('bit checkout 1.0.0 bar/foo');
          expect(output).to.have.string("component bar/foo doesn't have version 1.0.0");
        });
      });
      describe('and component was modified', () => {
        before(() => {
          helper.fixtures.createComponentBarFoo(barFooV2);
        });
        it('should show an error saying the component already uses that version', () => {
          const output = helper.general.runWithTryCatch('bit checkout 0.0.5 bar/foo');
          expect(output).to.have.string('component bar/foo is already at version 0.0.5');
        });
        describe('and tagged again', () => {
          let output;
          before(() => {
            helper.command.tagAllComponents('', '0.0.10');
            output = helper.general.runWithTryCatch('bit checkout 0.0.5 bar/foo');
          });
          it('should display a successful message', () => {
            expect(output).to.have.string(successOutput);
            expect(output).to.have.string('0.0.5');
            expect(output).to.have.string('bar/foo');
          });
          it('should revert to v1', () => {
            const fooContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js'));
            expect(fooContent.toString()).to.equal(barFooV1);
          });
          it('should update bitmap with the used version', () => {
            const bitMap = helper.bitMap.read();
            expect(bitMap).to.have.property('bar/foo@0.0.5');
            expect(bitMap).to.not.have.property('bar/foo');
            expect(bitMap).to.not.have.property('bar/foo@0.0.10');
          });
          it('should not show the component as modified', () => {
            const statusOutput = helper.command.runCmd('bit status');
            expect(statusOutput).to.not.have.string('modified components');
          });
          it('bit list should show the currently used version and latest local version', () => {
            const listOutput = helper.command.listLocalScopeParsed('--outdated');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(listOutput[0].currentVersion).to.equal('0.0.5');
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            expect(listOutput[0].localVersion).to.equal('0.0.10');
          });
          describe('trying to tag when using an old version', () => {
            before(() => {
              helper.fixtures.createComponentBarFoo('console.log("modified components");');
            });
            it('should throw an error NewerVersionFound', () => {
              const tagFunc = () => helper.command.tagComponent('bar/foo');
              const error = new NewerVersionFound([
                { componentId: 'bar/foo', currentVersion: '0.0.5', latestVersion: '0.0.10' },
              ]);
              helper.general.expectToThrow(tagFunc, error);
            });
            it('should allow tagging when --ignore-newest-version flag is used', () => {
              const tagOutput = helper.command.tagComponent('bar/foo', 'msg', '--ignore-newest-version');
              expect(tagOutput).to.have.string('1 component(s) tagged');
            });
          });
        });
      });
    });
  });
  describe('components with dependencies with multiple versions', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();

      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);
      helper.fs.createFile('utils', 'is-string.js', fixtures.isStringV2);
      helper.fixtures.createComponentBarFoo(fixtures.barFooFixtureV2);
      helper.command.tagAllComponents();
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('as authored', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFooAuthor);
      });
      it('as an intermediate step, make sure all components have v2', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
      });
      describe('switching to a previous version of the main component', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo');
          bitMap = helper.bitMap.read();
        });
        it('should display a successful message', () => {
          expect(output).to.have.string(successOutput);
          expect(output).to.have.string('0.0.1');
          expect(output).to.have.string('bar/foo');
        });
        it('should write the files of that version for the main component only and not its dependencies', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo');
        });
        it('should update bitmap of the main component with the used version', () => {
          expect(bitMap).to.have.property('bar/foo@0.0.1');
          expect(bitMap).to.not.have.property('bar/foo@0.0.2');
        });
        it('should not change the dependencies in bitmap file', () => {
          expect(bitMap).to.not.have.property('utils/is-string@0.0.1');
          expect(bitMap).to.have.property('utils/is-string@0.0.2');
          expect(bitMap).to.not.have.property('utils/is-type@0.0.1');
          expect(bitMap).to.have.property('utils/is-type@0.0.2');
        });
        it('should show the main component as modified because its dependencies are now having different version', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
        it('should not write package.json file', () => {
          expect(path.join(helper.scopes.localPath, 'package.json')).to.not.be.a.path();
        });
        it('should not write package-lock.json file', () => {
          expect(path.join(helper.scopes.localPath, 'package-lock.json')).to.not.be.a.path();
        });
      });
    });
    describe('as imported', () => {
      let localScopeAfterImport;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');

        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
        localScopeAfterImport = helper.scopeHelper.cloneLocalScope();
      });
      it('as an intermediate step, make sure all components have v2', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
      });
      describe('switching to a previous version of the main component', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo');
          bitMap = helper.bitMap.read();
        });
        it('should display a successful message', () => {
          expect(output).to.have.string(successOutput);
          expect(output).to.have.string('0.0.1');
          expect(output).to.have.string('bar/foo');
        });
        it('should not show verbose npm output', () => {
          expect(output).to.have.string('npm');
          expect(output).to.not.have.string('npm WARN');
        });
        it('should write the files of that version for the main component and its dependencies', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        it('should update bitmap of the main component with the used version', () => {
          expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/bar/foo@0.0.2`);
        });
        it('should add the dependencies to bitmap with their old versions in addition to the current versions', () => {
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-string@0.0.1`);
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-string@0.0.2`);
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.2`);
        });
        it('should not show any component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
        it('should not write bit.json file', () => {
          expect(path.join(helper.scopes.localPath, 'components/bar/foo/bit.json')).not.to.be.a.path();
        });
      });
      describe('switching to a previous version of the main component when modified', () => {
        let localScopeAfterModified;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeAfterImport);
          helper.fs.createFile('components/bar/foo/bar', 'foo.js', barFooV3);
          localScopeAfterModified = helper.scopeHelper.cloneLocalScope();
        });
        describe('when not using --merge flag', () => {
          let output;
          before(() => {
            try {
              helper.command.checkoutVersion('0.0.1', 'bar/foo');
            } catch (err) {
              output = err.toString();
            }
          });
          it('should throw an error indicating that there are conflicts', () => {
            expect(output).to.have.string('automatic merge has failed');
          });
          it('should be able to run the app with the modified version because nothing has changed', () => {
            const result = helper.general.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got foo v3');
          });
        });
        describe('when using --manual flag', () => {
          let output;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScopeAfterModified);
            output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--manual');
          });
          it('should indicate that there are conflicts', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.manual);
          });
          it('should not be able to run the app because of the conflicts', () => {
            const result = helper.general.runWithTryCatch('node app.js');
            // Check only the relevant line since for some reason we got it in circle for windows in this form:
            // SyntaxError: Unexpected token \'<<\'\r\n
            // In another place of the error in circle we have <<<<<
            // So we want to make sure the << is also in the relevant error line
            const splitted = result.split('\n');
            const line = splitted.find((l) => l.includes('SyntaxError:'));
            expect(line).to.have.string('SyntaxError: Unexpected token');
            expect(line).to.have.string('<<');
          });
        });
        describe('when using --ours flag', () => {
          let output;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScopeAfterModified);
            output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--ours');
          });
          it('should indicate that the file was not changed', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          });
          it('should be able to run the app and show the modified version', () => {
            const result = helper.general.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got foo v3');
          });
        });
        describe('when using --theirs flag', () => {
          let output;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScopeAfterModified);
            output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
          });
          it('should indicate that the file was updated', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.updated);
          });
          it('should be able to run the app and show the previous version', () => {
            const result = helper.general.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
      describe.skip('importing individually a nested component', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeAfterImport);
          helper.command.importComponent('utils/is-string');
        });
        // currently it behaves the same as 'bit import' of an older version.
        // it leaves the current version is components dir and write the old version in .dependencies
        // this way if there is another component that depends on the current version of the nested,
        // it won't be broken.
        it('should rewrite the component in components dir or leave it and write the old version in .dependencies?', () => {});
      });
      describe('switching a version using --skip-npm-install flag', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeAfterImport);
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--skip-npm-install');
        });
        it('should not show npm messages', () => {
          expect(output).to.not.have.string('npm');
        });
        it('should not write package-lock.json file', () => {
          expect(path.join(helper.scopes.localPath, 'components/bar/foo', 'package-lock.json')).to.not.be.a.path();
        });
      });
      describe('switching a version with --ignore-package-json flag', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeAfterImport);
          helper.command.importComponent('bar/foo');
          helper.command.checkoutVersion('0.0.1', 'bar/foo', '--ignore-package-json');
        });
        it('should not write package.json file', () => {
          expect(path.join(helper.scopes.localPath, 'components/bar/foo', 'package.json')).to.not.be.a.path();
        });
      });
    });
  });
  describe('as AUTHORED when the recent version has new files', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar', { i: 'bar/foo' });
      helper.command.tagAllComponents();

      helper.command.checkoutVersion('0.0.1', 'bar/foo');
    });
    it('should delete the new files', () => {
      expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.not.be.a.path();
    });
    it('should update bitmap to not track the new files', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo@0.0.1');
      expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      expect(bitMap['bar/foo@0.0.1'].files).to.be.lengthOf(1);
      expect(bitMap['bar/foo@0.0.1'].files[0].name).to.equal('foo.js');
    });
  });
  describe('modified component with conflicts', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(barFooV2);
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(barFooV3);
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      before(() => {
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--manual');
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
        expect(fileContent).to.have.string('<<<<<<< 0.0.1');
        expect(fileContent).to.have.string('>>>>>>> 0.0.2 modified');
      });
      it('should update bitmap with the specified version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
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
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the used version', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--ours');
      });
      it('should indicate that the version was switched', () => {
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
      it('should update bitmap with the used version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('when new files are added', () => {
      let scopeWithAddedFile;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('bar', 'foo2.js');
        helper.command.addComponent('bar/foo2.js', { i: 'bar/foo' });
        scopeWithAddedFile = helper.scopeHelper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--manual');
        });
        it('should indicate that a new file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.1');
          const files = bitMap['bar/foo@0.0.1'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
      describe('using theirs strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should not indicate that a new file was added', () => {
          expect(output).to.not.have.string(FileStatusWithoutChalk.added);
          expect(output).to.not.have.string('bar/foo2.js');
        });
        it('should not track the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.1');
          const files = bitMap['bar/foo@0.0.1'].files;
          expect(files).to.be.lengthOf(1);
          expect(files[0].relativePath).to.equal('bar/foo.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should not show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.command.checkoutVersion('0.0.1', 'bar/foo', '--ours');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should keep tracking the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.1');
          const files = bitMap['bar/foo@0.0.1'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
    });
  });
  describe('modified component without conflict', () => {
    describe('when the modified file is the same as the used version', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo(barFooV1);
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.tagComponentBarFoo();
        helper.fixtures.createComponentBarFoo(barFooV2);
        helper.fixtures.tagComponentBarFoo();
        helper.fixtures.createComponentBarFoo(barFooV1);
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo');
      });
      it('should indicate that the version is switched', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('when the base file is the same as the used version', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo(barFooV1);
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.tagComponentBarFoo();
        helper.command.tagComponent('bar/foo --force');
        helper.fixtures.createComponentBarFoo(barFooV2);
        output = helper.command.checkoutVersion('0.0.1', 'bar/foo');
      });
      it('should indicate that the version is switched', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should indicate that the file has been merged successfully', () => {
        expect(output).to.have.string('bar/foo.js');
        expect(output).to.have.string(FileStatusWithoutChalk.merged);
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
  // legacy test in order to check the originallySharedDir
  describe('component with originallySharedDir', () => {
    let output;
    let authorScope;
    let importedScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.tagScope('0.0.5');
      helper.command.exportAllComponents();
      authorScope = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
      importedScope = helper.scopeHelper.cloneLocalScope();
      output = helper.command.checkoutVersion('0.0.1', 'bar/foo');
    });
    it('should show the updated files without the originallySharedDir', () => {
      expect(output).to.not.have.string('bar/foo.js');
      expect(output).to.have.string('foo.js');
    });
    it('bit-diff should not show any changes related to the originallySharedDir', () => {
      const diffOutput = helper.general.runWithTryCatch('bit diff bar/foo');
      expect(diffOutput).to.have.string('no diff for');
      expect(diffOutput).to.not.have.string('foo.js');
    });
    // @see https://github.com/teambit/bit/issues/2067 for the complete use-case this tests
    describe('author added overrides, changing the component to not have sharedDir', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(authorScope);
        const overrides = {
          'bar/foo': {
            dependencies: {
              'file://some-file.js': '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.getClonedLocalScope(importedScope);
        helper.command.importAllComponents();
        helper.fs.outputFile('components/bar/foo/foo.js', fixtures.fooFixtureV2);
        helper.command.checkout('latest bar/foo');
      });
      it('should not duplicate the component files', () => {
        const componentDir = path.join(helper.scopes.localPath, 'components/bar/foo');
        expect(path.join(componentDir, 'bar/foo.js')).to.be.a.file();
        expect(path.join(componentDir, 'foo.js')).to.not.be.a.path();
      });
      it('should write the updated content into the checked out file', () => {
        const fileContent = helper.fs.readFile('components/bar/foo/bar/foo.js');
        expect(fileContent).to.equal(fixtures.fooFixtureV2);
      });
    });
  });
  describe('multiple components with different versions', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();

      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/foo2.js', { i: 'bar/foo2' });

      helper.command.tagAllComponents('-m v1 -s 0.0.1');
      helper.command.tagAllComponents('-m v2 -s 0.0.2');
      helper.command.tagComponent('bar/foo2', 'v3', '0.0.3 -f');
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('checkout all to a specific version', () => {
      let output;
      before(() => {
        output = helper.command.checkout('0.0.1 --all');
      });
      it('should show a successful message', () => {
        expect(output).to.have.string(successOutput);
      });
      it('should show both components in the output', () => {
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string('bar/foo2');
      });
      it('should show the version in the output', () => {
        expect(output).to.have.string('0.0.1');
      });
      it('should update bitmap with the specified version for all components', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.have.property('bar/foo2@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo2@0.0.3');
      });
      describe('checkout all to their latest version', () => {
        before(() => {
          output = helper.command.checkout('latest --all');
        });
        it('should show a successful message', () => {
          expect(output).to.have.string(successOutput);
        });
        it('should show both components in the output with the corresponding versions', () => {
          expect(output).to.have.string('bar/foo@0.0.2');
          expect(output).to.have.string('bar/foo2@0.0.3');
        });
        it('should update bitmap with each component to its latest', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          expect(bitMap).to.have.property('bar/foo2@0.0.3');
          expect(bitMap).to.not.have.property('bar/foo@0.0.1');
          expect(bitMap).to.not.have.property('bar/foo2@0.0.1');
        });
        it('should show a failure message when trying to checkout again to the latest versions', () => {
          output = helper.command.checkout('latest --all --verbose');
          expect(output).to.have.string('component bar/foo2 is already at the latest version, which is 0.0.3');
          expect(output).to.have.string('component bar/foo is already at the latest version, which is 0.0.2');
        });
      });
    });
    describe('reset local changes from all modified components', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('bar', 'foo.js', 'modified');
        helper.fs.createFile('bar', 'foo2.js', 'modified');
        // intermediate step, make sure it's shows as modified
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified');
        output = helper.command.checkout('--all --reset');
      });
      it('should show a successful message with the corresponding versions', () => {
        expect(output).to.have.string('successfully reset');
        expect(output).to.have.string('bar/foo@0.0.2');
        expect(output).to.have.string('bar/foo2@0.0.3');
      });
      it('should remove local changes from all components', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified');
      });
    });
    describe('reset local changes from one modified component', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('bar', 'foo.js', 'modified');
        helper.fs.createFile('bar', 'foo2.js', 'modified');
        // intermediate step, make sure it's shows as modified
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified');
        output = helper.command.checkout('bar/foo --reset');
      });
      it('should show a successful message with the corresponding versions', () => {
        expect(output).to.have.string('successfully reset');
        expect(output).to.have.string('bar/foo@0.0.2');
        expect(output).to.not.have.string('bar/foo2');
      });
      it('should remove local changes from the specified component', () => {
        const diffOutput = helper.command.runCmd('bit diff bar/foo');
        expect(diffOutput).to.have.string('no diff');
      });
      it('should not remove local changes from the other components', () => {
        const diffOutput = helper.command.runCmd('bit diff bar/foo2');
        expect(diffOutput).to.have.string('showing diff');
      });
    });
    describe('reset local changes from all components when only one is modified', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('bar', 'foo.js', 'modified');
        // intermediate step, make sure it's shows as modified
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified');
        output = helper.command.checkout('--all --reset');
      });
      it('should show a successful message for the modified component', () => {
        expect(output).to.have.string('successfully reset');
        expect(output).to.have.string('bar/foo@0.0.2');
      });
      it('should show a failure message for the unmodified component', () => {
        expect(output).to.have.string('component bar/foo2 is not modified');
      });
      it('should remove local changes from the modified component', () => {
        const diffOutput = helper.command.runCmd('bit diff bar/foo');
        expect(diffOutput).to.have.string('no diff');
      });
    });
  });
  describe('checkout with latest --all when multiple components have conflicts', () => {
    let output;
    let scopeBeforeModified;
    // for some weird reason, the bug related to this test was happening when it's 5 components.
    // tried with 10 and 20 and it didn't happen. probably related to the implementation of
    // `Promise.all` somehow. also, with 5 components, it was happening in about 30% of the times.
    const numOfComponents = 5;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      for (let index = 0; index < numOfComponents; index += 1) {
        helper.fs.createFile('bar', `foo${index}.js`, barFooV1);
      }
      helper.command.addComponent('bar/*');
      helper.command.tagAllComponents();
      for (let index = 0; index < numOfComponents; index += 1) {
        helper.fs.createFile('bar', `foo${index}.js`, barFooV2);
      }
      helper.command.tagAllComponents();
      helper.command.checkout('0.0.1 --all');
      for (let index = 0; index < numOfComponents; index += 1) {
        helper.fs.createFile('bar', `foo${index}.js`, barFooV3);
      }
      // intermediate step, make sure it shows as modified
      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('modified');
      scopeBeforeModified = helper.scopeHelper.cloneLocalScope();
    });
    it('checkout with latest --all should display a successful message', () => {
      output = helper.command.checkout('latest --all --theirs');
      expect(output).to.have.string(successOutput);
    });
    it('merge all of them should display a successful message', () => {
      helper.scopeHelper.getClonedLocalScope(scopeBeforeModified);
      const mergeOutput = helper.command.mergeVersion('0.0.2', 'foo0 foo1 foo2 foo3 foo4', '--theirs');
      expect(mergeOutput).to.have.string('successfully merged');
    });
  });
  describe('using a combination of values and flags that are not making sense', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
    });
    describe('using --reset flag and entering a version', () => {
      let output;
      before(() => {
        output = helper.general.runWithTryCatch('bit checkout 0.0.1 --reset');
      });
      it('should show a descriptive error', () => {
        expect(output).to.have.string(
          'the first argument "0.0.1" seems to be a version. however, --reset flag doesn\'t support a version'
        );
      });
    });
    describe('bit checkout with no values and no flags', () => {
      let output;
      before(() => {
        output = helper.general.runWithTryCatch('bit checkout');
      });
      it('should show a descriptive error', () => {
        expect(output).to.have.string('please enter [values...] or use --reset --all flags');
      });
    });
    describe('bit checkout with id without version', () => {
      let output;
      before(() => {
        output = helper.general.runWithTryCatch('bit checkout bar/foo');
      });
      it('should show a descriptive error', () => {
        expect(output).to.have.string('the specified version "bar/foo" is not a valid version');
      });
    });
    describe('bit checkout with id and --all flag', () => {
      let output;
      before(() => {
        output = helper.general.runWithTryCatch('bit checkout 0.0.1 bar/foo --all');
      });
      it('should show a descriptive error', () => {
        expect(output).to.have.string('please specify either [ids...] or --all, not both');
      });
    });
  });
});
