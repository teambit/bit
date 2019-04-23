import R from 'ramda';
import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import { FileStatus } from '../../src/consumer/versions-ops/merge-version';
import { ComponentNotFound } from '../../src/scope/exceptions';
import { removeChalkCharacters } from '../../src/utils';

chai.use(require('chai-fs'));

const barFooV1 = "module.exports = function foo() { return 'got foo'; };";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";
const barFooV3 = "module.exports = function foo() { return 'got foo v3'; };";
const barFooV4 = "module.exports = function foo() { return 'got foo v4'; };";
const successOutput = 'successfully merged components';
// eslint-disable-next-line import/prefer-default-export
export const FileStatusWithoutChalk = R.fromPairs(
  Object.keys(FileStatus).map(status => [status, removeChalkCharacters(FileStatus[status])])
);

describe('bit merge command', function () {
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
      const mergeFunc = () => helper.runCmd('bit merge 1.0.0 utils/non-exist');
      const error = new ComponentNotFound('utils/non-exist');
      helper.expectToThrow(mergeFunc, error);
    });
  });
  describe('after the component was created', () => {
    before(() => {
      helper.createComponentBarFoo(barFooV1);
      helper.addComponentBarFoo();
    });
    it('before tagging it should show an error saying the component was not tagged yet', () => {
      // @todo: create a new Exception ComponentHasNoVersion
      const output = helper.runWithTryCatch('bit merge 1.0.0 bar/foo');
      expect(output).to.have.string("component bar/foo doesn't have any version yet");
    });
    describe('after the component was tagged', () => {
      before(() => {
        helper.tagAllComponents('', '0.0.5');
      });
      describe('using a non-exist version', () => {
        it('should show an error saying the version does not exist', () => {
          const output = helper.runWithTryCatch('bit merge 1.0.0 bar/foo');
          expect(output).to.have.string("component bar/foo doesn't have version 1.0.0");
        });
      });
      describe('and component was modified', () => {
        before(() => {
          helper.createComponentBarFoo(barFooV2);
        });
        it('should show an error saying the component already uses that version', () => {
          const output = helper.runWithTryCatch('bit merge 0.0.5 bar/foo');
          expect(output).to.have.string('component bar/foo is already at version 0.0.5');
        });
      });
    });
  });
  describe('components with dependencies with multiple versions', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.tagAllComponents();

      helper.createFile('utils', 'is-type.js', fixtures.isTypeV2);
      helper.createFile('utils', 'is-string.js', fixtures.isStringV2);
      helper.createComponentBarFoo(fixtures.barFooFixtureV2);
      helper.tagAllComponents();
      localScope = helper.cloneLocalScope();
    });
    it('as an intermediate step, make sure the dependencies are correct', () => {
      const barFoo = helper.catComponent('bar/foo@0.0.2');
      expect(barFoo.dependencies).to.have.lengthOf(1);
      expect(barFoo.dependencies[0].id.name).to.equal('utils/is-string');
      expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');
      expect(barFoo.flattenedDependencies).to.have.lengthOf(2);
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: '0.0.2' });
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.2' });
    });
    describe('as authored', () => {
      before(() => {
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFooAuthor);
      });
      it('as an intermediate step, make sure all components have v2', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo v2');
      });
      describe('merging a previous version with --manual flag', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.mergeVersion('0.0.1', 'bar/foo', '--manual');
          bitMap = helper.readBitMap();
        });
        it('should display a successful message', () => {
          expect(output).to.have.string(successOutput);
          expect(output).to.have.string('0.0.1');
          expect(output).to.have.string('bar/foo');
        });
        it('should write the conflicts for the main component only', () => {
          const fileContentBarFoo = helper.readFile('bar/foo.js');
          expect(fileContentBarFoo).to.have.string(fixtures.barFooFixtureV2);
          expect(fileContentBarFoo).to.have.string(fixtures.barFooFixture);
          expect(fileContentBarFoo).to.have.string('<<<<<<< 0.0.2');
          expect(fileContentBarFoo).to.have.string('>>>>>>> 0.0.1');
        });
        it('should not change the dependencies', () => {
          const fileContentIsString = helper.readFile('utils/is-string.js');
          expect(fileContentIsString).to.have.string(fixtures.isStringV2);
          const fileContentIsType = helper.readFile('utils/is-type.js');
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
      describe('merging a previous version of the main component', () => {
        let output;
        let bitMap;
        before(() => {
          output = helper.mergeVersion('0.0.1', 'bar/foo', '--manual');
          bitMap = helper.readBitMap();
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
          const fileContentBarFoo = helper.readFile('components/bar/foo/bar/foo.js');
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
          expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-string@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-string@0.0.1`);
          expect(bitMap).to.have.property(`${helper.remoteScope}/utils/is-type@0.0.2`);
          expect(bitMap).to.not.have.property(`${helper.remoteScope}/utils/is-type@0.0.1`);
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
        it('should not write bit.json file', () => {
          expect(path.join(helper.localScopePath, 'components/bar/foo/bit.json')).not.to.be.a.path();
        });
      });
      describe('merging a previous version of the main component when modified', () => {
        let localScopeAfterModified;
        before(() => {
          helper.getClonedLocalScope(localScopeAfterImport);
          helper.createFile('components/bar/foo/bar', 'foo.js', barFooV3);
          localScopeAfterModified = helper.cloneLocalScope();
        });
        describe('when using --manual flag', () => {
          let output;
          before(() => {
            helper.getClonedLocalScope(localScopeAfterModified);
            output = helper.mergeVersion('0.0.1', 'bar/foo', '--manual');
          });
          it('should indicate that there are conflicts', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.manual);
          });
          it('bit status should indicate that there are issues with the file', () => {
            const statusOutput = helper.runCmd('bit status');
            expect(statusOutput).to.have.string('error found while parsing the file');
            expect(statusOutput).to.have.string('bar/foo.js');
            expect(statusOutput).to.have.string('Unexpected token');
          });
          it('should not be able to run the app because of the conflicts', () => {
            const result = helper.runWithTryCatch('node app.js');
            expect(result).to.have.string('SyntaxError: Unexpected token <<');
          });
          it('bit tag should not tag the component', () => {
            const tagOutput = helper.runWithTryCatch('bit tag -a');
            expect(tagOutput).to.have.string('error: issues found with the following component dependencies');
            expect(tagOutput).to.have.string('error found while parsing the file');
          });
          it('bit tag should tag the component when --ignore-unresolved-dependencies flag is used', () => {
            const tagOutput = helper.tagAllComponents('--ignore-unresolved-dependencies');
            expect(tagOutput).to.have.string('1 component(s) tagged');
          });
        });
        describe('when using --ours flag', () => {
          let output;
          before(() => {
            helper.getClonedLocalScope(localScopeAfterModified);
            output = helper.mergeVersion('0.0.1', 'bar/foo', '--ours');
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
            output = helper.mergeVersion('0.0.1', 'bar/foo', '--theirs');
          });
          it('should indicate that the file was updated', () => {
            expect(output).to.have.string(FileStatusWithoutChalk.updated);
          });
          it('should be able to run the app and show the previous version of the main component and current version of dependencies', () => {
            const result = helper.runWithTryCatch('node app.js');
            expect(result.trim()).to.equal('got is-type v2 and got is-string v2 and got foo');
          });
        });
      });
      describe('merging a version when import included bit.json file', () => {
        before(() => {
          helper.getClonedLocalScope(localScopeAfterImport);
          helper.importComponent('bar/foo --conf');
          helper.mergeVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should not delete the bit.json file', () => {
          expect(path.join(helper.localScopePath, 'components/bar/foo/bit.json')).to.be.a.path();
        });
      });
      describe('merging a version when import did not write package.json file', () => {
        before(() => {
          helper.getClonedLocalScope(localScopeAfterImport);
          helper.importComponent('bar/foo --ignore-package-json');
          helper.mergeVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should not write package.json file', () => {
          expect(path.join(helper.localScopePath, 'components/bar/foo', 'package.json')).to.not.be.a.path();
        });
      });
    });
  });
  describe('component with conflicts', () => {
    let localScope;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo(barFooV1);
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.createComponentBarFoo(barFooV2);
      helper.tagComponentBarFoo();
      localScope = helper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      before(() => {
        output = helper.mergeVersion('0.0.1', 'bar/foo', '--manual');
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
        expect(fileContent).to.have.string('<<<<<<< 0.0.2'); // current-change
        expect(fileContent).to.have.string('>>>>>>> 0.0.1'); // incoming-change
      });
      it('should not change bitmap version', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
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
        output = helper.mergeVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the merged version', () => {
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should not update bitmap', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        output = helper.mergeVersion('0.0.1', 'bar/foo', '--ours');
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
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV2);
      });
      it('should not update bitmap', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should not show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.not.have.string('modified components');
      });
    });
    describe('when there are files currently on the filesystem which are not on the specified version', () => {
      let scopeWithAddedFile;
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.createFile('bar', 'foo2.js');
        helper.addComponent('bar/foo2.js', { i: 'bar/foo' });
        scopeWithAddedFile = helper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.mergeVersion('0.0.1', 'bar/foo', '--manual');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          const files = bitMap['bar/foo@0.0.2'].files;
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
          output = helper.mergeVersion('0.0.1', 'bar/foo', '--theirs');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should keep track the file in bitmap', () => {
          // @todo: should we change the behavior to not track it?
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          const files = bitMap['bar/foo@0.0.2'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.getClonedLocalScope(scopeWithAddedFile);
          output = helper.mergeVersion('0.0.1', 'bar/foo', '--ours');
        });
        it('should indicate that the new file was not changed', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.unchanged);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should keep tracking the file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.2');
          const files = bitMap['bar/foo@0.0.2'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should not delete the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
        });
      });
    });
    describe('when there are files on the specified version which are not currently on the filesystem', () => {
      let scopeWithRemovedFile;
      before(() => {
        helper.getClonedLocalScope(localScope);
        helper.createFile('bar', 'foo2.js');
        helper.addComponent('bar/foo2.js', { i: 'bar/foo' });
        helper.tagAllComponents(); // 0.0.3
        fs.removeSync(path.join(helper.localScopePath, 'bar/foo2.js'));
        helper.createComponentBarFoo(barFooV4); // change also foo.js so it'll have conflict
        helper.tagAllComponents(); // 0.0.4 without bar/foo2.js
        scopeWithRemovedFile = helper.cloneLocalScope();
      });
      describe('using manual strategy', () => {
        let output;
        before(() => {
          output = helper.mergeVersion('0.0.3', 'bar/foo', '--manual');
        });
        it('should indicate that the file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.4');
          const files = bitMap['bar/foo@0.0.4'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should add the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
        });
      });
      describe('using theirs strategy', () => {
        let output;
        before(() => {
          helper.getClonedLocalScope(scopeWithRemovedFile);
          output = helper.mergeVersion('0.0.3', 'bar/foo', '--theirs');
        });
        it('should indicate that the file was added', () => {
          expect(output).to.have.string(FileStatusWithoutChalk.added);
          expect(output).to.have.string('bar/foo2.js');
        });
        it('should track the file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.4');
          const files = bitMap['bar/foo@0.0.4'].files;
          expect(files).to.be.lengthOf(2);
          expect(files[0].relativePath).to.equal('bar/foo.js');
          expect(files[1].relativePath).to.equal('bar/foo2.js');
        });
        it('should add the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.be.a.file();
        });
        it('should show the component as modified', () => {
          const statusOutput = helper.runCmd('bit status');
          expect(statusOutput).to.have.string('modified components');
        });
      });
      describe('using ours strategy', () => {
        let output;
        before(() => {
          helper.getClonedLocalScope(scopeWithRemovedFile);
          output = helper.mergeVersion('0.0.3', 'bar/foo', '--ours');
        });
        it('should not add the deleted file', () => {
          expect(output).to.not.have.string(FileStatusWithoutChalk.added);
          expect(output).to.not.have.string('bar/foo2.js');
        });
        it('should not track the deleted file in bitmap', () => {
          const bitMap = helper.readBitMap();
          expect(bitMap).to.have.property('bar/foo@0.0.4');
          const files = bitMap['bar/foo@0.0.4'].files;
          expect(files).to.be.lengthOf(1);
          expect(files[0].relativePath).to.equal('bar/foo.js');
        });
        it('should not add the file', () => {
          expect(path.join(helper.localScopePath, 'bar/foo2.js')).to.not.be.a.path();
        });
      });
    });
  });
  describe('modified component with conflicts', () => {
    let localScope;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo(barFooV1);
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.createComponentBarFoo(barFooV2);
      helper.tagComponentBarFoo();
      helper.createComponentBarFoo(barFooV3);
      localScope = helper.cloneLocalScope();
    });
    describe('using manual strategy', () => {
      let output;
      let fileContent;
      before(() => {
        output = helper.mergeVersion('0.0.1', 'bar/foo', '--manual');
        fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
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
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
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
        output = helper.mergeVersion('0.0.1', 'bar/foo', '--theirs');
      });
      it('should indicate that the file has updated', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string(FileStatusWithoutChalk.updated);
      });
      it('should rewrite the file according to the merged version', () => {
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
    describe('using ours strategy', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        output = helper.mergeVersion('0.0.1', 'bar/foo', '--ours');
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
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV3);
      });
      it('should not change bitmap', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should still show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
  describe('modified component without conflict', () => {
    describe('when the modified file is the same as the specified version', () => {
      let output;
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo(barFooV1);
        helper.addComponentBarFoo();
        helper.tagComponentBarFoo();
        helper.createComponentBarFoo(barFooV2);
        helper.tagComponentBarFoo();
        helper.createComponentBarFoo(barFooV1);
        output = helper.mergeVersion('0.0.1', 'bar/foo');
      });
      it('should indicate that the version is merged', () => {
        expect(output).to.have.string(successOutput);
        expect(output).to.have.string('0.0.1');
        expect(output).to.have.string('bar/foo');
      });
      it('should not change the file content', () => {
        const fileContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js')).toString();
        expect(fileContent).to.be.equal(barFooV1);
      });
      it('should not change bitmap', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).to.have.property('bar/foo@0.0.2');
        expect(bitMap).to.not.have.property('bar/foo');
        expect(bitMap).to.not.have.property('bar/foo@0.0.1');
      });
      it('should show the component as modified', () => {
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('modified components');
      });
    });
  });
});
