import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import Helper, { FileStatusWithoutChalk } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

const barFooV1 = "module.exports = function foo() { return 'got foo'; };";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
const barFooV3 = "module.exports = function foo() { return 'got foo v3'; };";
const barFooV4 = "module.exports = function foo() { return 'got foo v4'; };";
const successOutput = 'successfully merged components';

describe('bit merge command', function () {
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
      const mergeFunc = () => helper.command.runCmd('bit merge 1.0.0 utils/non-exist');
      const error = new MissingBitMapComponent('utils/non-exist');
      helper.general.expectToThrow(mergeFunc, error);
    });
  });
  describe('after the component was created', () => {
    before(() => {
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFoo();
    });
    it('before tagging it should show an error saying the component was not tagged yet', () => {
      // @todo: create a new Exception ComponentHasNoVersion
      const output = helper.general.runWithTryCatch('bit merge 1.0.0 bar/foo');
      expect(output).to.have.string("component bar/foo doesn't have any version yet");
    });
    describe('after the component was tagged', () => {
      before(() => {
        helper.command.tagAllComponents('', '0.0.5');
      });
      describe('using a non-exist version', () => {
        it('should show an error saying the version does not exist', () => {
          const output = helper.general.runWithTryCatch('bit merge 1.0.0 bar/foo');
          expect(output).to.have.string("component bar/foo doesn't have version 1.0.0");
        });
      });
      describe('and component was modified', () => {
        before(() => {
          helper.fixtures.createComponentBarFoo(barFooV2);
        });
        it('should show an error saying the component already uses that version', () => {
          const output = helper.general.runWithTryCatch('bit merge 0.0.5 bar/foo');
          expect(output).to.have.string('component bar/foo is already at version 0.0.5');
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
    it('as an intermediate step, make sure the dependencies are correct', () => {
      const barFoo = helper.command.catComponent('bar/foo@0.0.2');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.dependencies).to.have.lengthOf(1);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.dependencies[0].id.name).to.equal('utils/is-string');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.flattenedDependencies).to.have.lengthOf(2);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: '0.0.2' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.2' });
    });
    describe('as authored', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFooAuthor);
      });
      it('as an intermediate step, make sure all components have v2', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
      });
      describe('merging a previous version with --manual flag', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
          bitMap = helper.bitMap.read();
        });
        it('should display a successful message', () => {
          expect(output).to.have.string(successOutput);
          expect(output).to.have.string('0.0.1');
          expect(output).to.have.string('bar/foo');
        });
        it('should write the conflicts for the main component only', () => {
          const fileContentBarFoo = helper.fs.readFile('bar/foo.js');
          expect(fileContentBarFoo).to.have.string(fixtures.barFooFixtureV2);
          expect(fileContentBarFoo).to.have.string(fixtures.barFooFixture);
          expect(fileContentBarFoo).to.have.string('<<<<<<< 0.0.2');
          expect(fileContentBarFoo).to.have.string('>>>>>>> 0.0.1');
        });
        it('should not change the dependencies', () => {
          const fileContentIsString = helper.fs.readFile('utils/is-string.js');
          expect(fileContentIsString).to.have.string(fixtures.isStringV2);
          const fileContentIsType = helper.fs.readFile('utils/is-type.js');
          expect(fileContentIsType).to.have.string(fixtures.isTypeV2);
        });
        it('should not change the bitmap file', () => {
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          expect(bitMap).to.not.have.property('bar/foo@0.0.1');
          expect(bitMap).to.have.property('utils/is-string@0.0.2');
          expect(bitMap).to.not.have.property('utils/is-string@0.0.1');
          expect(bitMap).to.have.property('utils/is-type@0.0.2');
          expect(bitMap).to.not.have.property('utils/is-type@0.0.1');
        });
        it('should show the main component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
        it('should not write package.json file', () => {
          expect(path.join(helper.scopes.localPath, 'package.json')).to.not.be.a.path();
        });
        it('should not create node_modules directory', () => {
          expect(path.join(helper.scopes.localPath, 'node_modules')).to.not.be.a.path();
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
      describe('merging a previous version of the main component', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
          bitMap = helper.bitMap.read();
        });
        it('should display a successful message', () => {
          expect(output).to.have.string(successOutput);
          expect(output).to.have.string('0.0.1');
          expect(output).to.have.string('bar/foo');
        });
        it('should not install any npm package', () => {
          expect(output).to.not.have.string('npm');
        });
        it('should write the conflicts for the main component', () => {
          const fileContentBarFoo = helper.fs.readFile('components/bar/foo/bar/foo.js');
          expect(fileContentBarFoo).to.have.string(fixtures.barFooFixtureV2);
          expect(fileContentBarFoo).to.have.string(fixtures.barFooFixture);
          expect(fileContentBarFoo).to.have.string('<<<<<<< 0.0.2');
          expect(fileContentBarFoo).to.have.string('>>>>>>> 0.0.1');
        });
        it('should not write the dependencies', () => {
          // merge doesn't change the dependencies version, there is no reason to reinstall them
          expect(output).to.not.have.string('.dependencies');
        });
        it('should not change the bitmap file', () => {
          expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-string@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-string@0.0.1`);
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-type@0.0.1`);
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
        it('should not write bit.json file', () => {
          expect(path.join(helper.scopes.localPath, 'components/bar/foo/bit.json')).not.to.be.a.path();
        });
      });
      describe('merging a previous version of the main component when modified', () => {
        let localScopeAfterModified;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeAfterImport);
          helper.fs.createFile('components/bar/foo/bar', 'foo.js', barFooV3);
          localScopeAfterModified = helper.scopeHelper.cloneLocalScope();
        });
        describe('when using --manual flag', () => {
          let output;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScopeAfterModified);
            output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
          });
          it('should indicate that there are conflicts', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.manual);
          });
          it('bit status should indicate that there are issues with the file', () => {
            const statusOutput = helper.command.runCmd('bit status');
            expect(statusOutput).to.have.string('error found while parsing the file');
            expect(statusOutput).to.have.string('bar/foo.js');
            expect(statusOutput).to.have.string('Unexpected token');
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
          it('bit tag should not tag the component', () => {
            const tagOutput = helper.general.runWithTryCatch('bit tag -a');
            expect(tagOutput).to.have.string('error: issues found with the following component dependencies');
            expect(tagOutput).to.have.string('error found while parsing the file');
          });
          it('bit tag should tag the component when --ignore-unresolved-dependencies flag is used', () => {
            const tagOutput = helper.command.tagAllComponents('--ignore-unresolved-dependencies');
            expect(tagOutput).to.have.string('1 component(s) tagged');
          });
        });
        describe('when using --ours flag', () => {
          let output;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScopeAfterModified);
            output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--ours');
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
            output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
          });
          it('should indicate that the file was updated', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.updated);
          });
          it('should be able to run the app and show the previous version of the main component and current version of dependencies', () => {
            const result = helper.general.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo');
          });
        });
      });

      describe('merging a version when import did not write package.json file', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeAfterImport);
          helper.command.importComponent('bar/foo --ignore-package-json');
          helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should not write package.json file', () => {
          expect(path.join(helper.scopes.localPath, 'components/bar/foo', 'package.json')).to.not.be.a.path();
        });
      });
    });
  });
  describe('component with conflicts', () => {
    let localScope;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo(barFooV1);
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.fixtures.createComponentBarFoo(barFooV2);
      helper.fixtures.tagComponentBarFoo();
      localScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      before(() => {
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
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
        expect(fileContent).to.have.string('<<<<<<< 0.0.2'); // current-change
        expect(fileContent).to.have.string('>>>>>>> 0.0.1'); // incoming-change
      });
      it('should not change bitmap version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
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
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the merged version', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should not update bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--ours');
      });
      it('should indicate that the merge was successful', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should indicate that the file was not changed', () => {
        expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
      });
      it('should leave the file intact', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV2);
      });
      it('should not update bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('when there are files currently on the filesystem which are not on the specified version', () => {
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
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          const files = bitMap['bar/foo@0.0.2'].files;
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
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should keep track the file in bitmap', () => {
          // @todo: should we change the behavior to not track it?
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          const files = bitMap['bar/foo@0.0.2'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--ours');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should keep tracking the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          const files = bitMap['bar/foo@0.0.2'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
    });
    describe('when there are files on the specified version which are not currently on the filesystem', () => {
      let scopeWithRemovedFile;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.fs.createFile('bar', 'foo2.js');
        helper.command.addComponent('bar/foo2.js', { i: 'bar/foo' });
        helper.command.tagAllComponents(); // 0.0.3
        fs.removeSync(path.join(helper.scopes.localPath, 'bar/foo2.js'));
        helper.fixtures.createComponentBarFoo(barFooV4); // change also foo.js so it'll have conflict
        helper.command.tagAllComponents(); // 0.0.4 without bar/foo2.js
        scopeWithRemovedFile = helper.scopeHelper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.command.mergeVersion('0.0.3', 'bar/foo', '--manual');
        });
        it('should indicate that the file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.4');
          const files = bitMap['bar/foo@0.0.4'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should add the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
      });
      describe('using theirs strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithRemovedFile);
          output = helper.command.mergeVersion('0.0.3', 'bar/foo', '--theirs');
        });
        it('should indicate that the file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.4');
          const files = bitMap['bar/foo@0.0.4'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should add the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.command.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeWithRemovedFile);
          output = helper.command.mergeVersion('0.0.3', 'bar/foo', '--ours');
        });
        it('should not add the deleted file', () => {
          expect(output).to.not.have.string(FileStatusWithoutChalk.added);
          expect(output).to.not.have.string('bar/foo2.js');
        });
        it('should not track the deleted file in bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property('bar/foo@0.0.4');
          const files = bitMap['bar/foo@0.0.4'].files;
          expect(files).to.be.lengthOf(1);
          expect(files[0].relativePath).to.equal('bar/foo.js');
        });
        it('should not add the file', () => {
          expect(path.join(helper.scopes.localPath, 'bar/foo2.js')).to.not.be.a.path();
        });
      });
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
      let fileContent;
      before(() => {
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--manual');
        fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
      });
      it('should indicate that the file has conflicts', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.manual);
      });
      it('should rewrite the file with the conflict with the conflicts segments', () => {
        expect(fileContent).to.have.string('<<<<<<<');
        expect(fileContent).to.have.string('>>>>>>>');
        expect(fileContent).to.have.string('=======');
      });
      it('should label the conflicts segments according to the versions', () => {
        expect(fileContent).to.have.string('<<<<<<< 0.0.2'); // current-change
        expect(fileContent).to.have.string('>>>>>>> 0.0.1'); // incoming-change
      });
      it('should contain the content of the current modified file and the merged file', () => {
        expect(fileContent).to.have.string(barFooV1);
        expect(fileContent).to.have.string(barFooV3);
      });
      it('should not change bitmap version', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
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
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the merged version', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo', '--ours');
      });
      it('should indicate that the version was merged', () => {
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
      it('should not change bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should still show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
  describe('modified component without conflict', () => {
    describe('when the modified file is the same as the specified version', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo(barFooV1);
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.tagComponentBarFoo();
        helper.fixtures.createComponentBarFoo(barFooV2);
        helper.fixtures.tagComponentBarFoo();
        helper.fixtures.createComponentBarFoo(barFooV1);
        output = helper.command.mergeVersion('0.0.1', 'bar/foo');
      });
      it('should indicate that the version is merged', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should not change the file content', () => {
        const fileContent = fs.readFileSync(path.join(helper.scopes.localPath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should not change bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
});
