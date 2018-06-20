import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import { NewerVersionFound } from '../../src/consumer/exceptions';
import { ComponentNotFound } from '../../src/scope/exceptions';
import { FileStatusWithoutChalk } from './merge.e2e';

chai.use(require('chai-fs'));

const barFooV1 = "module.exports = function foo() { return 'got foo'; };";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
const barFooV3 = "module.exports = function foo() { return 'got foo v3'; };";
const successOutput = 'successfully switched';

describe('bit checkout command', function () {
  this.timeout(0);
  const helper = new Helper();
  before(() => {
    helper.reInitLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('for non existing component', () => {
    it('show an error saying the component was not found', () => {
      const useFunc = () => helper.runCmd('bit checkout 1.0.0 utils/non-exist');
      const error = new ComponentNotFound('utils/non-exist');
      helper.expectToThrow(useFunc, error);
    });
  });
  describe('after the component was created', () => {
    before(() => {
      helper.createComponentBarFoo(barFooV1);
      helper.addComponentBarFoo();
    });
    it('before tagging it should show an error saying the component was not tagged yet', () => {
      const output = helper.runWithTryCatch('bit checkout 1.0.0 bar/foo');
      expect(output).to.have.string("component bar/foo doesn't have any version yet");
    });
    describe('after the component was tagged', () => {
      before(() => {
        helper.tagAllWithoutMessage('', '0.0.5');
      });
      describe('using a non-exist version', () => {
        it('should show an error saying the version does not exist', () => {
          const output = helper.runWithTryCatch('bit checkout 1.0.0 bar/foo');
          expect(output).to.have.string("component bar/foo doesn't have version 1.0.0");
        });
      });
      describe('and component was modified', () => {
        before(() => {
          helper.createComponentBarFoo(barFooV2);
        });
        it('should show an error saying the component already uses that version', () => {
          const output = helper.runWithTryCatch('bit checkout 0.0.5 bar/foo');
          expect(output).to.have.string('component bar/foo is already at version 0.0.5');
        });
        describe('and tagged again', () => {
          let output;
          before(() => {
            helper.tagAllWithoutMessage('', '0.0.10');
            output = helper.runWithTryCatch('bit checkout 0.0.5 bar/foo');
          });
          it('should display a successful message', () => {
            expect(output).to.have.string(successOutput);
            expect(output).to.have.string('0.0.5');
            expect(output).to.have.string('bar/foo');
          });
          it('should revert to v1', () => {
            const fooContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js'));
            expect(fooContent.toString()).to.equal(barFooV1);
          });
          it('should update bitmap with the used version', () => {
            const bitMap = helper.readBitMap();
            expect(bitMap).to.have.property('bar/foo@0.0.5');
            expect(bitMap).to.not.have.property('bar/foo');
            expect(bitMap).to.not.have.property('bar/foo@0.0.10');
          });
          it('should not show the component as modified', () => {
            const statusOutput = helper.runCmd('bit status');
            expect(statusOutput).to.not.have.string('modified components');
          });
          it('bit list should show the currently used version and latest local version', () => {
            const listOutput = helper.listLocalScopeParsed('--outdated');
            expect(listOutput[0].currentVersion).to.equal('0.0.5');
            expect(listOutput[0].localVersion).to.equal('0.0.10');
          });
          describe('trying to tag when using an old version', () => {
            before(() => {
              helper.createComponentBarFoo('modified barFoo');
            });
            it('should throw an error NewerVersionFound', () => {
              const commitFunc = () => helper.commitComponent('bar/foo');
              const error = new NewerVersionFound([
                { componentId: 'bar/foo', currentVersion: '0.0.5', latestVersion: '0.0.10' }
              ]);
              helper.expectToThrow(commitFunc, error);
            });
            it('should allow tagging when --ignore-newest-version flag is used', () => {
              const commitOutput = helper.commitComponent('bar/foo', 'msg', '--ignore-newest-version');
              expect(commitOutput).to.have.string('1 components tagged');
            });
          });
        });
      });
    });
  });
  describe('components with dependencies with multiple versions', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponent('utils/is-type.js');
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent('utils/is-string.js');
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();

      helper.createFile('utils', 'is-type.js', fixtures.isTypeV2);
      helper.createFile('utils', 'is-string.js', fixtures.isStringV2);
      helper.createComponentBarFoo(fixtures.barFooFixtureV2);
      helper.commitAllComponents();
      localScope = helper.cloneLocalScope();
    });
    describe('as authored', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFooAuthor);
      });
      it('as an intermediate step, make sure all components have v2', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
      });
      describe('switching to a previous version of the main component', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.checkoutVersion('0.0.1', 'bar/foo');
          bitMap = helper.readBitMap();
        });
        it('should display a successful message', () => {
          expect(output).to.have.string(successOutput);
          expect(output).to.have.string('0.0.1');
          expect(output).to.have.string('bar/foo');
        });
        it('should write the files of that version for the main component only and not its dependencies', () => {
          const result = helper.runCmd('node app.js');
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
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
        it('should not write package.json file', () => {
          expect(path.join(helper.localScopePath, 'package.json')).to.not.be.a.path();
        });
        it('should not create node_modules directory', () => {
          expect(path.join(helper.localScopePath, 'node_modules')).to.not.be.a.path();
        });
        it('should not write package-lock.json file', () => {
          expect(path.join(helper.localScopePath, 'package-lock.json')).to.not.be.a.path();
        });
      });
    });
    describe('as imported', () => {
      let localScopeAfterImport;
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');

        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
        localScopeAfterImport = helper.cloneLocalScope();
      });
      it('as an intermediate step, make sure all components have v2', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
      });
      describe('switching to a previous version of the main component', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.checkoutVersion('0.0.1', 'bar/foo');
          bitMap = helper.readBitMap();
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
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        it('should update bitmap of the main component with the used version', () => {
          expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/bar/foo@0.0.2`);
        });
        it('should add the dependencies to bitmap with their old versions in addition to the current versions', () => {
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-string@0.0.1`);
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-string@0.0.2`);
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
        });
        it('should not show any component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
        it('should not write bit.json file', () => {
          expect(path.join(helper.localScopePath, 'components/bar/foo/bit.json')).not.to.be.a.path();
        });
      });
      describe('switching to a previous version of the main component when modified', () => {
        let localScopeAfterModified;
        before(() => {
          helper.getClonedLocalScope(localScopeAfterImport);
          helper.createFile('components/bar/foo/bar', 'foo.js', barFooV3);
          localScopeAfterModified = helper.cloneLocalScope();
        });
        describe('when not using --merge flag', () => {
          let output;
          before(() => {
            try {
              helper.checkoutVersion('0.0.1', 'bar/foo');
            } catch (err) {
              output = err.toString();
            }
          });
          it('should throw an error indicating that there are conflicts', () => {
            expect(output).to.have.string('automatic merge has failed');
          });
          it('should be able to run the app with the modified version because nothing has changed', () => {
            const result = helper.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got foo v3');
          });
        });
        describe('when using --manual flag', () => {
          let output;
          before(() => {
            helper.getClonedLocalScope(localScopeAfterModified);
            output = helper.checkoutVersion('0.0.1', 'bar/foo', '--manual');
          });
          it('should indicate that there are conflicts', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.manual);
          });
          it('should not be able to run the app because of the conflicts', () => {
            const result = helper.runWithTryCatch('node app.js');
            expect(result).to.have.string('SyntaxError: Unexpected token <<');
          });
        });
        describe('when using --ours flag', () => {
          let output;
          before(() => {
            helper.getClonedLocalScope(localScopeAfterModified);
            output = helper.checkoutVersion('0.0.1', 'bar/foo', '--ours');
          });
          it('should indicate that the file was not changed', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          });
          it('should be able to run the app and show the modified version', () => {
            const result = helper.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got foo v3');
          });
        });
        describe('when using --theirs flag', () => {
          let output;
          before(() => {
            helper.getClonedLocalScope(localScopeAfterModified);
            output = helper.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
          });
          it('should indicate that the file was updated', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.updated);
          });
          it('should be able to run the app and show the previous version', () => {
            const result = helper.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
      describe.skip('importing individually a nested component', () => {
        before(() => {
          helper.getClonedLocalScope(localScopeAfterImport);
          helper.importComponent('utils/is-string');
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
          helper.getClonedLocalScope(localScopeAfterImport);
          output = helper.checkoutVersion('0.0.1', 'bar/foo', '--skip-npm-install');
        });
        it('should not show npm messages', () => {
          expect(output).to.not.have.string('npm');
        });
        it('should not write package-lock.json file', () => {
          expect(path.join(helper.localScopePath, 'components/bar/foo', 'package-lock.json')).to.not.be.a.path();
        });
      });
      describe('switching a version when import included bit.json file', () => {
        before(() => {
          helper.getClonedLocalScope(localScopeAfterImport);
          helper.importComponent('bar/foo --conf');
          helper.checkoutVersion('0.0.1', 'bar/foo');
        });
        it('should rewrite the bit.json file', () => {
          expect(path.join(helper.localScopePath, 'components/bar/foo/bit.json')).to.be.a.path();
        });
      });
      describe('switching a version when import did not write package.json file', () => {
        before(() => {
          helper.getClonedLocalScope(localScopeAfterImport);
          helper.importComponent('bar/foo --ignore-package-json');
          helper.checkoutVersion('0.0.1', 'bar/foo');
        });
        it('should not write package.json file', () => {
          expect(path.join(helper.localScopePath, 'components/bar/foo', 'package.json')).to.not.be.a.path();
        });
      });
    });
  });
  describe('as AUTHORED when the recent version has new files', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllWithoutMessage();
      helper.createFile('bar', 'foo2.js');
      helper.addComponentWithOptions('bar', { i: 'bar/foo' });
      helper.tagAllWithoutMessage();

      helper.checkoutVersion('0.0.1', 'bar/foo');
    });
    it('should not delete the new files', () => {
      // because the author may still need them
      expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
    });
    it('should update bitmap to not track the new files', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo@0.0.1');
      expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      expect(bitMap['bar/foo@0.0.1'].files).to.be.lengthOf(1);
      expect(bitMap['bar/foo@0.0.1'].files[0].name).to.equal('foo.js');
    });
  });
  describe('modified component with conflicts', () => {
    let localScope;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo(barFooV1);
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.createComponentBarFoo(barFooV2);
      helper.commitComponentBarFoo();
      helper.createComponentBarFoo(barFooV3);
      localScope = helper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      before(() => {
        output = helper.checkoutVersion('0.0.1', 'bar/foo', '--manual');
      });
      it('should indicate that the file has conflicts', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.manual);
      });
      it('should rewrite the file with the conflict with the conflicts segments', () => {
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.have.string('<<<<<<<');
        expect(fileContent).to.have.string('>>>>>>>');
        expect(fileContent).to.have.string('=======');
      });
      it('should label the conflicts segments according to the versions', () => {
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.have.string('<<<<<<< 0.0.1');
        expect(fileContent).to.have.string('>>>>>>> 0.0.2 modified');
      });
      it('should update bitmap with the specified version', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using theirs strategy', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        output = helper.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the used version', () => {
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        output = helper.checkoutVersion('0.0.1', 'bar/foo', '--ours');
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
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV3);
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('when new files are added', () => {
      let scopeWithAddedFile;
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.createFile('bar', 'foo2.js');
        helper.addComponentWithOptions('bar/foo2.js', { i: 'bar/foo' });
        scopeWithAddedFile = helper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.checkoutVersion('0.0.1', 'bar/foo', '--manual');
        });
        it('should indicate that a new file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.1');
          const files = bitMap['bar/foo@0.0.1'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
        });
      });
      describe('using theirs strategy', () => {
        let output;
        before(() => {
          helper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.checkoutVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should not indicate that a new file was added', () => {
          expect(output).to.not.have.string(FileStatusWithoutChalk.added);
          expect(output).to.not.have.string('bar/foo2.js');
        });
        it('should not track the file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.1');
          const files = bitMap['bar/foo@0.0.1'].files;
          expect(files).to.be.lengthOf(1);
          expect(files[0].relativePath).to.equal('bar/foo.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should not show the component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.not.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.checkoutVersion('0.0.1', 'bar/foo', '--ours');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should keep tracking the file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.1');
          const files = bitMap['bar/foo@0.0.1'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
        });
      });
    });
  });
  describe('modified component without conflict', () => {
    describe('when the modified file is the same as the used version', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo(barFooV1);
        helper.addComponentBarFoo();
        helper.commitComponentBarFoo();
        helper.createComponentBarFoo(barFooV2);
        helper.commitComponentBarFoo();
        helper.createComponentBarFoo(barFooV1);
        output = helper.checkoutVersion('0.0.1', 'bar/foo');
      });
      it('should indicate that the version is switched', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should update bitmap with the used version', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('when the base file is the same as the used version', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo(barFooV1);
        helper.addComponentBarFoo();
        helper.commitComponentBarFoo();
        helper.commitComponent('bar/foo --force');
        helper.createComponentBarFoo(barFooV2);
        output = helper.checkoutVersion('0.0.1', 'bar/foo');
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
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
  describe('component with originallySharedDir', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.tagScope('0.0.5');
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      output = helper.checkoutVersion('0.0.1', 'bar/foo');
    });
    it('should show the updated files without the originallySharedDir', () => {
      expect(output).to.not.have.string('bar/foo.js');
      expect(output).to.have.string('foo.js');
    });
    it('bit-diff should not show any changes related to the originallySharedDir', () => {
      const diffOutput = helper.runWithTryCatch('bit diff bar/foo');
      expect(diffOutput).to.have.string('no diff for');
      expect(diffOutput).to.not.have.string('foo.js');
    });
  });
  describe('multiple components with different versions', () => {
    let localScope;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();

      helper.createFile('bar', 'foo2.js');
      helper.addComponent('bar/foo2.js');

      helper.commitAllComponents('v1', '-s 0.0.1');
      helper.commitAllComponents('v2', '-s 0.0.2');
      helper.commitComponent('bar/foo2', 'v3', '0.0.3 -f');
      localScope = helper.cloneLocalScope();
    });
    describe('checkout all to a specific version', () => {
      let output;
      before(() => {
        output = helper.checkout('0.0.1 --all');
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
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.1');
        expect(bitMap).to.have.property('bar/foo2@0.0.1');
        expect(bitMap).to.not.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo2@0.0.3');
      });
      describe('checkout all to their latest version', () => {
        before(() => {
          output = helper.checkout('latest --all');
        });
        it('should show a successful message', () => {
          expect(output).to.have.string(successOutput);
        });
        it('should show both components in the output with the corresponding versions', () => {
          expect(output).to.have.string('bar/foo@0.0.2');
          expect(output).to.have.string('bar/foo2@0.0.3');
        });
        it('should update bitmap with each component to its latest', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          expect(bitMap).to.have.property('bar/foo2@0.0.3');
          expect(bitMap).to.not.have.property('bar/foo@0.0.1');
          expect(bitMap).to.not.have.property('bar/foo2@0.0.1');
        });
        it('should show a failure message when trying to checkout again to the latest versions', () => {
          output = helper.checkout('latest --all');
          expect(output).to.have.string('component bar/foo2 is already at the latest version, which is 0.0.3');
          expect(output).to.have.string('component bar/foo is already at the latest version, which is 0.0.2');
        });
      });
    });
    describe('reset local changes from all modified components', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.createFile('bar', 'foo.js', 'modified');
        helper.createFile('bar', 'foo2.js', 'modified');
        // intermediate step, make sure it's shows as modified
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified');
        output = helper.checkout('--all --reset');
      });
      it('should show a successful message with the corresponding versions', () => {
        expect(output).to.have.string('successfully reset');
        expect(output).to.have.string('bar/foo@0.0.2');
        expect(output).to.have.string('bar/foo2@0.0.3');
      });
      it('should remove local changes from all components', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified');
      });
    });
    describe('reset local changes from one modified component', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.createFile('bar', 'foo.js', 'modified');
        helper.createFile('bar', 'foo2.js', 'modified');
        // intermediate step, make sure it's shows as modified
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified');
        output = helper.checkout('bar/foo --reset');
      });
      it('should show a successful message with the corresponding versions', () => {
        expect(output).to.have.string('successfully reset');
        expect(output).to.have.string('bar/foo@0.0.2');
        expect(output).to.not.have.string('bar/foo2');
      });
      it('should remove local changes from the specified component', () => {
        const diffOutput = helper.runCmd('bit diff bar/foo');
        expect(diffOutput).to.have.string('no diff');
      });
      it('should not remove local changes from the other components', () => {
        const diffOutput = helper.runCmd('bit diff bar/foo2');
        expect(diffOutput).to.have.string('showing diff');
      });
    });
    describe('reset local changes from all components when only one is modified', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.createFile('bar', 'foo.js', 'modified');
        // intermediate step, make sure it's shows as modified
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified');
        output = helper.checkout('--all --reset');
      });
      it('should show a successful message for the modified component', () => {
        expect(output).to.have.string('successfully reset');
        expect(output).to.have.string('bar/foo@0.0.2');
      });
      it('should show a failure message for the unmodified component', () => {
        expect(output).to.have.string('component bar/foo2 is not modified');
      });
      it('should remove local changes from the modified component', () => {
        const diffOutput = helper.runCmd('bit diff bar/foo');
        expect(diffOutput).to.have.string('no diff');
      });
    });
  });
  describe('using a combination of values and flags that are not making sense', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
    });
    describe('using --reset flag and entering a version', () => {
      let output;
      before(() => {
        output = helper.runWithTryCatch('bit checkout 0.0.1 --reset');
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
        output = helper.runWithTryCatch('bit checkout');
      });
      it('should show a descriptive error', () => {
        expect(output).to.have.string('please enter [values...] or use --reset --all flags');
      });
    });
    describe('bit checkout with id without version', () => {
      let output;
      before(() => {
        output = helper.runWithTryCatch('bit checkout bar/foo');
      });
      it('should show a descriptive error', () => {
        expect(output).to.have.string('the specified version "bar/foo" is not a valid version');
      });
    });
    describe('bit checkout with id and --all flag', () => {
      let output;
      before(() => {
        output = helper.runWithTryCatch('bit checkout 0.0.1 bar/foo --all');
      });
      it('should show a descriptive error', () => {
        expect(output).to.have.string('please specify either [ids...] or --all, not both');
      });
    });
  });
});
