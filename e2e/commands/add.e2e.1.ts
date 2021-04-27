/* eslint-disable max-lines */
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { InvalidName } from '@teambit/legacy-bit-id';
import AddTestsWithoutId from '../../src/cli/commands/exceptions/add-tests-without-id';
import { statusInvalidComponentsMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { AUTO_GENERATED_MSG } from '../../src/constants';
import { MissingMainFile } from '../../src/consumer/bit-map/exceptions';
import {
  ExcludedMainFile,
  IncorrectIdForImportedComponent,
  MainFileIsDir,
  MissingComponentIdForImportedComponent,
  MissingMainFileMultipleComponents,
  PathOutsideConsumer,
  TestIsDirectory,
  VersionShouldBeRemoved,
} from '../../src/consumer/component-ops/add-components/exceptions';
import { AddingIndividualFiles } from '../../src/consumer/component-ops/add-components/exceptions/adding-individual-files';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit add command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('add before running "bit init"', () => {
    it('Should return message to run "bit init"', () => {
      let error;
      try {
        helper.fs.createFile('bar', 'foo.js');
        helper.fixtures.addComponentBarFoo();
      } catch (err) {
        error = err.message;
      }
      expect(error).to.have.string('workspace not found. to initiate a new workspace, please use `bit init');
    });
  });
  describe('bit add without bitmap and .git/bit initialized', () => {
    it('Should find local scope inside .git/bit and add component', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.git.initNewGitRepo();
      helper.bitMap.delete();
      helper.fs.deletePath('.bit');
      helper.fs.deletePath('bit.json');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      helper.scopeHelper.initLocalScope();
      helper.fs.createFile('bar', 'foo.js');
      const addCmd = () => helper.command.addComponent('bar/foo.js', { i: 'bar/foo ' });
      expect(addCmd).to.not.throw('fatal: scope not found. to create a new scope, please use `bit init`');
    });
  });
  describe('add before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then add component', () => {
      helper.bitMap.create();
      helper.fixtures.createComponentBarFoo();
      const output = helper.fixtures.addComponentBarFoo();
      expect(output).to.contain('tracking component bar/foo');
    });
  });
  describe('add to imported component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/foo.js', { i: 'bar/foo ' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('Should throw error when trying to add files to imported component without specifying id', () => {
      const addCmd = () =>
        helper.command.addComponent('.', undefined, path.join(helper.scopes.localPath, 'components', 'bar', 'foo'));
      const error = new MissingComponentIdForImportedComponent(`${helper.scopes.remote}/bar/foo`);
      helper.general.expectToThrow(addCmd, error);
    });
    it('Should throw error when trying to add files to imported component without specifying correct id', () => {
      const addCmd = () =>
        helper.command.addComponent(
          '.',
          { i: 'test/test' },
          path.join(helper.scopes.localPath, 'components', 'bar', 'foo')
        );
      const error = new IncorrectIdForImportedComponent(
        `${helper.scopes.remote}/bar/foo`,
        'test/test',
        'components/bar/foo/foo.js'
      );
      helper.general.expectToThrow(addCmd, error);
    });
    it('should throw an error when specifying an incorrect version', () => {
      const addFunc = () => helper.command.addComponent('components/bar/foo', { i: 'bar/foo@0.0.45' });
      const error = new VersionShouldBeRemoved('bar/foo@0.0.45');
      helper.general.expectToThrow(addFunc, error);
    });
    it('Should not add files and dists to imported component', () => {
      helper.command.addComponent(
        '.',
        { i: 'bar/foo' },
        path.join(helper.scopes.localPath, 'components', 'bar', 'foo')
      );
      const expectTestFile = { relativePath: 'foo.js', test: false, name: 'foo.js' };
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files).to.deep.include(expectTestFile);
      expect(files, helper.bitMap.printFilesInCaseOfError(files)).to.be.ofSize(1);
    });
    it('Should only add new files to imported component', () => {
      helper.fs.createFile(path.join('components', 'bar', 'foo', 'testDir'), 'newFile.js', 'console.log("test");');
      helper.command.addComponent(
        '.',
        { i: 'bar/foo' },
        path.join(helper.scopes.localPath, 'components', 'bar', 'foo')
      );
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files, helper.bitMap.printFilesInCaseOfError(files)).to.be.ofSize(2);
      expect(files).to.deep.include({ relativePath: 'foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'testDir/newFile.js', test: false, name: 'newFile.js' });
    });
    it('Should not add dist files to imported component when distTarget is not specified', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files, helper.bitMap.printFilesInCaseOfError(files)).to.be.ofSize(2);
      expect(files).to.not.deep.include({ relativePath: 'dist/foo.js', test: false, name: 'foo.js' });
      expect(files).to.not.deep.include({ relativePath: 'dist/testDir/newFile.js', test: false, name: 'newFile.js' });
    });
    it('Should only add test file to imported component', () => {
      helper.fs.createFile(path.join('components', 'bar', 'foo', 'testDir'), 'test.spec.js', 'console.log("test");');
      helper.command.addComponent(
        'testDir/test.spec.js',
        {
          t: 'testDir/test.spec.js',
          i: 'bar/foo',
        },
        path.join(helper.scopes.localPath, 'components', 'bar', 'foo')
      );
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files, helper.bitMap.printFilesInCaseOfError(files)).to.be.ofSize(3);
      expect(files).to.deep.include({ relativePath: 'testDir/test.spec.js', test: true, name: 'test.spec.js' });
    });
    it('should not throw an error when specifying the correct version', () => {
      const output = helper.command.addComponent('components/bar/foo', {
        i: `${helper.scopes.remote}/bar/foo@0.0.1`,
      });
      expect(output).to.have.string('added');
    });
    it('should not throw an error when specifying a mainFile with path relative to consumer', () => {
      const output = helper.command.addComponent('components/bar/foo', {
        i: 'bar/foo',
        m: 'components/bar/foo/foo.js',
      });
      expect(output).to.have.string('added');
    });
  });
  describe('add one component', () => {
    let output;
    beforeEach(() => {
      helper.scopeHelper.reInitLocalScope();
    });
    it('Should print tracking component: id', () => {
      helper.fixtures.createComponentBarFoo();
      output = helper.fixtures.addComponentBarFoo();
      expect(output).to.contain('tracking component bar/foo');
    });
    it('Should print warning when trying to add file that is already tracked with different id and not add it as a new one', () => {
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.addComponent('bar/foo.js -i bar/new');
      expect(output).to.have.string('warning: files bar/foo.js already used by component: bar/foo');
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('bar/new');
    });
    it('Should add test to tracked component', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo2.spec.js');
      helper.command.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.command.addComponent(` -t ${path.normalize('bar/foo2.spec.js')} --id bar/foo2`);
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo2'].files;
      const expectImplFile = { relativePath: 'bar/foo2.js', test: false, name: 'foo2.js' };
      const expectTestFile = { relativePath: 'bar/foo2.spec.js', test: true, name: 'foo2.spec.js' };
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.include(expectTestFile);
      expect(files).to.deep.include(expectImplFile);
    });
    it('should be able to mark a file as test after adding it as non-test', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo.spec.js');
      helper.command.addComponent('bar', { m: 'bar/foo.js', i: 'bar/foo' });
      helper.command.addComponent(' -t bar/foo.spec.js --id bar/foo');
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      const expectImplFile = { relativePath: 'bar/foo.js', test: false, name: 'foo.js' };
      const expectTestFile = { relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' };
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.include(expectTestFile);
      expect(files).to.deep.include(expectImplFile);
    });
    it('Should throw message if adding test files without id', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo2.spec.js');
      const normalizedPath = path.normalize('bar/foo2.js');
      helper.command.addComponent(normalizedPath);
      const specNormalizedPath = path.normalize('bar/foo2.spec.js');
      const addCmd = () => helper.command.addComponent(` -t ${specNormalizedPath}`);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const error = new AddTestsWithoutId(specNormalizedPath);
      helper.general.expectToThrow(addCmd, error);
    });

    it('Should add component to bitmap with folder as default namespace', () => {
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo');
    });

    it('Should add component main file when defined from relative path ', () => {
      helper.fs.createFile('bar', 'bar.js');
      helper.fs.createFile('bar/foo', 'foo.js');
      helper.fs.createFile('bar/foo', 'foo2.js');

      helper.fs.createFile('goo', 'goo.js');
      helper.command.addComponent(
        path.normalize('foo/foo.js foo/foo2.js'),
        { m: 'foo/foo2.js', i: 'test/test' },
        path.join(helper.scopes.localPath, 'bar')
      );
      const bitMap = helper.bitMap.read();
      const files = bitMap['test/test'].files;
      expect(bitMap['test/test'].mainFile).to.equal('bar/foo/foo2.js');
      const expectTestFile = { relativePath: 'bar/foo/foo.js', test: false, name: 'foo.js' };
      expect(files).to.deep.include(expectTestFile);
    });
    it('Should not add component if bit.json is corrupted', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.bitJson.corrupt();
      try {
        helper.command.addComponent(path.normalize('bar/foo2.js'));
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.scopes.localPath, 'bit.json')}`);
    });
    it('Should throw error when adding more than one component with same ID ', () => {
      helper.fs.createFile('bar', 'file.js');
      helper.fs.createFile('bar', 'file.md');
      const addCmd = () => helper.command.addComponent(path.normalize('bar/*'));
      expect(addCmd).to.throw('unable to add 2 components with the same ID: bar/file : bar/file.js,bar/file.md');
    });
    it('Should trim testFiles spaces', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo.spec.js');
      helper.command.addComponent(osComponentName, { i: 'bar/foo', t: `${osFilePathName}       ` });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      const expectTestFile = { relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' };
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.array();
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.include(expectTestFile);
    });
    it('Should add to bitmap file that it was generated comment', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo.spec.js');
      helper.command.addComponent(osComponentName, { t: `${osFilePathName}       ` });
      const bitMap = fs.readFileSync(path.join(helper.scopes.localPath, '.bitmap')).toString();
      expect(bitMap).to.have.string(AUTO_GENERATED_MSG);
    });
    it('Should not add component to bitmap because test file does not exists', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.fs.createFile('bar', 'foo.js');
      const addCmd = () => helper.command.addComponent(osComponentName, { t: `${osFilePathName}       ` });
      expect(addCmd).to.throw(`error: file or directory "${osFilePathName}" was not found`);
    });
    it('Add component from subdir  ../someFile ', () => {
      const barPath = path.join(helper.scopes.localPath, 'bar/x');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo2.spec.js');
      helper.fs.createFile('bar/x', 'foo1.js');
      helper.command.addComponent('../foo2.js', { t: '../foo2.spec.js' }, barPath);
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo2');

      const testFile = bitMap.foo2.files.find((file) => file.test === true);
      const implFile = bitMap.foo2.files.find((file) => file.test === false);
      expect(testFile.relativePath).to.equal('bar/foo2.spec.js');
      expect(implFile.relativePath).to.equal('bar/foo2.js');
    });
    it('Should add component with namespace flag to bitmap with correct name', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/foo2.js', { n: 'test' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('test/foo2');
    });
    it('Should override component with override flag', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'boo1.js');
      helper.command.addComponent('bar/foo.js', { i: 'bar/foo ' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo');
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(1);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      helper.command.addComponent('bar/boo1.js', { i: 'bar/foo', o: true, m: 'bar/boo1.js' });
      const bitMap2 = helper.bitMap.read();
      expect(bitMap2).to.have.property('bar/foo');
      const files2 = bitMap2['bar/foo'].files;
      expect(files2).to.be.ofSize(1);
      expect(files2).to.deep.include({ relativePath: 'bar/boo1.js', test: false, name: 'boo1.js' });
      expect(bitMap2['bar/foo'].mainFile).to.equal('bar/boo1.js');
    });
    it('should change a test file to regular file by re-adding the component using --override flag', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo.spec.js');
      helper.command.addComponent('bar', { t: 'bar/foo.spec.js', m: 'bar/foo.js' });
      helper.command.addComponent('bar', { o: true, m: 'bar/foo.js', i: 'bar' });
      const bitMap = helper.bitMap.read();
      const specFile = bitMap.bar.files.find((f) => f.relativePath === 'bar/foo.spec.js');
      expect(specFile.test).to.be.false;
    });
    it('Should throw error when no index file is found', () => {
      const file1 = 'foo1.js';
      const file2 = 'foo2.js';
      helper.fs.createFile('bar', file1);
      helper.fs.createFile('bar', file2);

      const addCmd = () => helper.command.addComponent('bar', { n: 'test' });
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const error = new MissingMainFile('test/bar');
      helper.general.expectToThrow(addCmd, error);
    });
    it('Should throw error msg if -i and -n flag are used with bit add', () => {
      helper.fs.createFile('bar', 'foo2.js');
      const addCmd = () => helper.command.addComponent('bar/foo2.js', { n: 'test', i: 'jaja' });
      expect(addCmd).to.throw('please use either [id] or [namespace] to add a particular component');
    });
    it('Should throw error msg if trying to add non existing file', () => {
      const addCmd = () => helper.command.addComponent('non-existing-file.js');
      expect(addCmd).to.throw('error: file or directory "non-existing-file.js" was not found');
    });
    it('Bitmap origin should be AUTHORED', () => {
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo');
      expect(bitMap['bar/foo'].origin).to.equal('AUTHORED');
    });
    it('Should prevent adding a file with invalid keys in namespace', () => {
      const error = new InvalidName('bar.f/foo');
      helper.fixtures.createComponentBarFoo();
      const addFunc = () => helper.command.addComponent('bar/foo.js', { i: 'bar.f/foo' });
      helper.general.expectToThrow(addFunc, error);
    });
    it('Should prevent adding a file with invalid keys in ID', () => {
      const error = new InvalidName('bar/fo.o');
      helper.fixtures.createComponentBarFoo();
      const addFunc = () => helper.command.addComponent('bar/foo.js', { i: 'bar/fo.o' });
      helper.general.expectToThrow(addFunc, error);
    });
    it('Define dynamic main file ', () => {
      const mainFileOs = path.normalize('{PARENT}/{PARENT}.js');
      helper.fs.createFile('bar', 'bar.js');
      helper.fs.createFile('bar', 'foo1.js');
      helper.command.addComponent('bar', { m: mainFileOs, n: 'test' });
      const bitMap = helper.bitMap.read();
      const mainFile = bitMap['test/bar'].mainFile;
      expect(bitMap).to.have.property('test/bar');
      expect(mainFile).to.equal('bar/bar.js');
    });
    it('Should add component with spec file from another dir according to dsl', () => {
      const dslOs = path.normalize('test/{FILE_NAME}.spec.js');
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('test', 'foo.spec.js');
      helper.command.addComponent('bar/foo.js', { t: dslOs, i: 'bar/foo' });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Glob and dsl Should add component to bitmap ', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('test', 'foo.spec.js');
      helper.fs.createFile('test2', 'foo1.spec.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), {
        t: path.normalize('test/{FILE_NAME}.spec.js,test2/*.spec.js'),
      });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo');
      const files = bitMap.foo.files;
      expect(files).to.be.ofSize(3);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test2/foo1.spec.js', test: true, name: 'foo1.spec.js' });
    });
    it('should not add test file as bit component', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('test', 'foo.spec.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), {
        t: path.normalize('test/{FILE_NAME}.spec.js'),
        n: 'internal',
      });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('test/foo.spec');
    });
    it('Should add dir files with spec from dsl when test files are flattened', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('test', 'foo.spec.js');
      helper.fs.createFile('test', 'foo2.spec.js');
      helper.command.addComponent('bar', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: path.normalize('test/{FILE_NAME}.spec.js'),
      });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(5);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should return error if used an invalid ID', () => {
      helper.fs.createFile('bar', 'foo.js');
      const addFunc = () => helper.command.addComponent('bar/foo.js', { i: 'Bar/foo' });
      const error = new InvalidName('Bar/foo');
      helper.general.expectToThrow(addFunc, error);
    });
    it('should add component with id contains only one level', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent('bar', {
        i: 'foo',
      });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo');
    });
    it('Should add dir files with spec from multiple dsls when test files are placed in same structure', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('test/bar', 'foo.spec.js');
      helper.fs.createFile('test/bar', 'foo2.spec.js');
      helper.fs.createFile('test', 'foo2.spec.js');
      helper.command.addComponent('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,test/{FILE_NAME}.spec.js',
      });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should add dir files with spec from multiple dsls when test files are placed in same structure but bit add is with glob', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('bar', 'foo.spec.js');
      helper.fs.createFile('test/bar', 'foo2.spec.js');
      helper.fs.createFile('test', 'foo2.spec.js');
      helper.command.addComponent('bar/*.js', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,bar/foo.spec.js,test/{FILE_NAME}.spec.js',
      });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });

    it('Should add dir files with spec from dsl and glob pattern', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('test/bar', 'foo.spec.js');
      helper.fs.createFile('test/bar', 'foo2.spec.js');
      helper.fs.createFile('test', 'foo2.spec.js');
      helper.command.addComponent('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,test/*.spec.js',
      });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    // TODO: we need to implement the feature preventing the use of -t without wrapping in quotes.
    it.skip('Should output message preventing user from adding files with spec from dsl and glob pattern without using quotes', () => {
      let errMsg = '';
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('test/bar', 'foo.spec.js');
      helper.fs.createFile('test/bar', 'foo2.spec.js');
      try {
        helper.command.runCmd('bit add bar/*.js -t test/bar/{FILE_NAME}.spec.js -n bar');
      } catch (err) {
        errMsg = err.message;
      }
      expect(errMsg).to.have.string('Please wrap tests with quotes');
    });
    it('Should add dir files with spec from dsl and glob pattern and exclude', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('test/bar', 'foo.spec.js');
      helper.fs.createFile('test/bar', 'foo2.spec.js');
      helper.fs.createFile('test', 'foo2.spec.js');
      helper.command.addComponent('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,test/*.spec.js',
        e: 'test/*.spec.js',
      });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(5);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('should throw an error when main file is excluded', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      const addCmd = () => helper.command.addComponent('bar/*.js', { e: 'bar/foo2.js', m: 'bar/foo2.js' });
      const error = new ExcludedMainFile(path.join('bar', 'foo2.js'));
      helper.general.expectToThrow(addCmd, error);
    });
    it('Should modify bitmap when adding component again without id', () => {
      helper.fs.createFile('bar/foo', 'foo.js');
      helper.fs.createFile('bar/foo', 'index.js');
      helper.command.addComponent('bar/foo', { i: 'bar/foo' });
      const bitMap1 = helper.bitMap.read();
      const files1 = bitMap1['bar/foo'].files;
      expect(bitMap1).to.have.property('bar/foo');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(2);
      helper.fs.createFile('bar/foo', 'foo3.js');
      helper.command.addComponent('bar/foo', {});
      const bitMap2 = helper.bitMap.read();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(3);
    });
    it('Should add test files from dsls and exlude dsl specifics', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('bar', 'foo.spec.js');
      helper.fs.createFile('test/bar', 'foo2.spec.js');
      helper.fs.createFile('test/bar', 'a.example.js');
      helper.fs.createFile('test', 'foo2.spec.js');
      helper.command.addComponent('bar/*.js', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,bar/foo.spec.js,test/{FILE_NAME}.spec.js',
        e: 'test/{PARENT}/*.example.*',
      });
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(files).to.not.deep.include({ relativePath: 'bar/a.example.js', test: true, name: 'a.example.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
  });
  describe('adding file to existing tagged component', () => {
    let bitMap;
    let files;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'boo1.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.addComponent('bar/boo1.js', { i: 'bar/foo' });
      bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo@0.0.1'); // should not change the component ID
      files = bitMap['bar/foo@0.0.1'].files;
    });
    it('Should show component as modified', () => {
      const output = helper.command.runCmd('bit s');
      expect(output).to.have.string(
        'modified components\n(use "bit tag --all [version]" to lock a version with all your changes)\n(use "bit diff" to compare changes)\n\n     > bar/foo'
      );
    });
    it('Should be added to the existing component', () => {
      expect(files).to.deep.include({ relativePath: 'bar/boo1.js', test: false, name: 'boo1.js' });
      expect(files).to.be.ofSize(2);
      expect(bitMap).to.not.have.property('bar/boo1');
    });
  });
  describe('add multiple components', () => {
    it('Should add all components with correct namespace and return message to user', () => {
      helper.scopeHelper.reInitLocalScope();
      const basePath = path.normalize('bar/*');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo1.js');
      const output = helper.command.addComponent(basePath, { n: 'test' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('test/foo1');
      expect(bitMap).to.have.property('test/foo2');
      expect(output).to.have.string('tracking 2 new components');
    });
    it('should indicate in the error message which components are missing the main file', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'baz1/foo.js');
      helper.fs.createFile('bar', 'baz1/foo2.js');
      helper.fs.createFile('bar', 'baz2/foo.js');
      helper.fs.createFile('bar', 'baz2/foo2.js');
      const addFunc = () => helper.command.addComponent('bar/*');
      const error = new MissingMainFileMultipleComponents(['baz1, baz2']);
      helper.general.expectToThrow(addFunc, error);
    });
    describe('when some of the components have empty directory as a result of excluding their files', () => {
      let output;
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.createFile('bar', 'baz1/foo.js');
        helper.fs.createFile('bar', 'baz2/foo3.js');
        output = helper.command.addComponent('bar/*', { e: 'bar/baz2/foo3.js' });
      });
      it('should not break the operation if some of the components have empty directory', () => {
        expect(output).to.have.string('tracking component baz1');
      });
      it('should show a warning indicating the directories that were not added', () => {
        expect(output).to.have.string('warning');
        expect(output).to.have.string('the following directories are empty');
        expect(output).to.have.string(path.normalize('bar/baz2'));
      });
    });
    describe('two component with the same file name but different directory name', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fs.createFile('bar', 'baz1/foo.js');
        helper.fs.createFile('bar', 'baz2/foo.js');
      });
      describe('adding them as directories so the name are not conflicting', () => {
        before(() => {
          helper.command.addComponent('bar/*');
        });
        it('should generate a short id out of the directory only', () => {
          const bitMap = helper.bitMap.readComponentsMapOnly();
          const ids = Object.keys(bitMap);
          expect(ids).to.include('baz1');
          expect(ids).to.include('baz2');
        });
      });
      describe('adding them as files so the file names are conflicting', () => {
        before(() => {
          helper.bitMap.delete();
          helper.command.addComponent('bar/baz1/foo.js bar/baz2/foo.js');
        });
        it('should generate id out of the directory and the filename to not have a conflict', () => {
          const bitMap = helper.bitMap.readComponentsMapOnly();
          const ids = Object.keys(bitMap);
          expect(ids).to.include('baz1/foo');
          expect(ids).to.include('baz2/foo');
        });
      });
    });
  });
  describe('add component with exclude', () => {
    beforeEach(() => {
      helper.scopeHelper.reInitLocalScope();
    });
    it('should throw error when all files are excluded', () => {
      helper.fs.createFile('bar', 'foo1.js');
      const normalizedPath = path.normalize('bar/foo1.js');
      const addCmd = () => helper.command.addComponent(normalizedPath, { e: 'bar/foo1.js' });
      expect(addCmd).to.throw(`warning: no files to add, the following files were ignored: ${normalizedPath}`);
    });
    it('should throw an error when main file is excluded', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      const addCmd = () => helper.command.addComponent('bar', { i: 'bar/foo', e: 'bar/foo1.js', m: 'bar/foo1.js' });
      const error = new ExcludedMainFile(path.join('bar', 'foo1.js'));
      helper.general.expectToThrow(addCmd, error);
    });
    it('should add main file to component if exists and not in file list', () => {
      const expectedArray = [
        { relativePath: 'bar/foo1.js', test: false, name: 'foo1.js' },
        { relativePath: 'bar/foo2.js', test: false, name: 'foo2.js' },
      ];
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/foo1.js', { i: 'bar/foo', m: 'bar/foo2.js' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo');
      const files = bitMap['bar/foo'].files;
      expect(files).to.deep.equal(expectedArray);
    });
    it('bitMap should only contain components that have files', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/foo1.js bar/foo2.js', { e: 'bar/foo2.js' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo1');
      expect(bitMap).not.to.have.property('foo2');
    });
    it('When adding folder bitMap should not contain excluded glob *.exclude.js', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo2.exclude.js');
      helper.command.addComponent('bar/*.js', { e: 'bar/*.exclude.js' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo1');
      expect(bitMap).to.have.property('foo2');
      expect(bitMap).not.to.have.property('foo2exclude');
    });
    it('Bitmap should not contain all files in excluded list', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo2.exclude.js');
      helper.command.addComponent('bar/*.js', { e: 'bar/*.exclude.js,bar/foo2.js' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo1');
      expect(bitMap).not.to.have.property('foo2');
      expect(bitMap).not.to.have.property('foo2exclude');
    });
    it('When excluding dir ,bit component should not appear in bitmap', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar/x', 'foo2.exclude.js');
      helper.command.addComponent('bar/*', { e: 'bar/x/' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('foo1');
      expect(bitMap).to.have.property('foo2');
      expect(bitMap).not.to.have.property('x');
    });
    it('bitMap should contain files that are not excluded ', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.command.addComponent(
        `${path.normalize('bar/foo1.js')} ${path.normalize('bar/foo2.js')} ${path.normalize(
          'bar/foo3.js'
        )}  -i bar/foo -m ${path.normalize('bar/foo1.js')}`,
        { e: 'bar/foo2.js' }
      );
      const bitMap = helper.bitMap.read();
      const files = bitMap['bar/foo'].files;
      const expectedArray = [
        { relativePath: 'bar/foo1.js', test: false, name: 'foo1.js' },
        { relativePath: 'bar/foo3.js', test: false, name: 'foo3.js' },
      ];
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.array();
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.equal(expectedArray);
    });
    it('bitMap should contain component even if all test files are excluded ', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo2.spec.js');
      helper.command.addComponent('bar/foo1.js', { t: 'bar/foo2.spec.js', e: 'bar/foo2.spec.js' });
      const bitMap = helper.bitMap.read();
      const files = bitMap.foo1.files;
      expect(bitMap).to.have.property('foo1');
      expect(files).to.be.ofSize(1);
    });
    it('bit should add components and exclude files', () => {
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'foo1.js');
      helper.fs.createFile('bar', 'index.js');
      helper.fs.createFile('foo', 'foo3.js');
      helper.fs.createFile('foo', 'foo4.js');
      helper.command.addComponent(path.normalize('*'), { e: 'foo' });
      const bitMap = helper.bitMap.read();
      expect(bitMap).not.to.have.property('bar/foo1');
    });
  });
  describe('with multiple index files', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'index.js');
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile(path.join('bar', 'exceptions'), 'some-exception.js');
      helper.fs.createFile(path.join('bar', 'exceptions'), 'index.js');
      helper.command.addComponent('bar', { i: 'bar/foo' });
    });
    it('should identify the closest index file as the main file', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].mainFile).to.equal('bar/index.js');
    });
  });
  describe('adding files to an imported component', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.reInitRemoteScope();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    describe('outside the component rootDir', () => {
      let output;
      before(() => {
        helper.fs.createFile('bar', 'foo2.js');
        try {
          helper.command.addComponent(path.join('bar', 'foo2.js'), { i: 'bar/foo' });
        } catch (err) {
          output = err.message;
        }
      });
      it('should throw an error', () => {
        expect(output).to.have.string(
          "unable to add file bar/foo2.js because it's located outside the component root dir components/bar/foo"
        );
      });
    });
    describe('inside the component rootDir', () => {
      before(() => {
        const barFooPath = path.join('components', 'bar', 'foo', 'bar');
        helper.fs.createFile(barFooPath, 'foo2.js');
        helper.command.addComponent(path.join(barFooPath, 'foo2.js'), { i: 'bar/foo' });
      });
      it('should add the new file to the existing imported component', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`].files).to.be.ofSize(2);
      });
      it('should not add it as a new component', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).not.to.have.property('bar/foo');
      });
      it('should mark the component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output.includes('no modified components')).to.be.false;
        expect(output.includes('modified components')).to.be.true;
        expect(output.includes('bar/foo')).to.be.true;
      });
    });
  });
  describe('adding a component again (without specifying id) after exporting it', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.reInitRemoteScope();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      helper.fixtures.addComponentBarFoo();
    });
    it('should not add it as a new component', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).not.to.have.property('bar/foo');
    });
  });
  describe('add component/s with gitignore', () => {
    let errorMessage;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
    });
    it('Should show warning msg in case there are no files to add because of gitignore', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.git.writeGitIgnore(['bar/foo2.js']);
      try {
        helper.command.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      } catch (err) {
        errorMessage = err.message;
      }
      expect(errorMessage).to.contain(
        `warning: no files to add, the following files were ignored: ${path.normalize('bar/foo2.js')}`
      );
    });
    it('Should only add files that are not in  gitignore', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('bar', 'boo.js');
      helper.git.writeGitIgnore(['bar/f*']);
      const output = helper.command.addComponent(path.normalize('bar/*.js'), { i: 'bar/boo' });
      expect(output).to.contain('tracking component bar/boo');
    });
    it('Should contain only unfiltered components inside bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/boo');
    });
  });
  describe('ignore specific files inside component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo3.js');
      helper.fs.createFile('bar', 'boo.js');
      helper.fs.createFile('bar', 'index.js');
      helper.git.writeGitIgnore(['bar/foo.js', 'bar/foo3.js']);
      output = helper.command.addComponent(path.normalize('bar/'), { i: 'bar/foo' });
    });
    it('Should track component ', () => {
      expect(output).to.contain('tracking component bar/foo');
    });
    it('Should contain component inside bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should contain inside bitmap only files that are not inside gitignore', () => {
      const bitMap = helper.bitMap.read();
      const expectedArray = [
        { relativePath: 'bar/boo.js', test: false, name: 'boo.js' },
        { relativePath: 'bar/index.js', test: false, name: 'index.js' },
      ];
      expect(bitMap).to.have.property('bar/foo');
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.array();
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.equal(expectedArray);
    });
  });
  describe('ignore files with exclamation mark pattern', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo.spec.js');
      helper.fs.createFile('bar', 'index.js');
      // we don't expect this pattern to do anything. it just makes sure we don't repeat the bug we
      // had before where having ANY entry in .gitignore with "!", the test file was ignored.
      helper.git.writeGitIgnore(['!bar']);
      output = helper.command.addComponent('bar/foo.js', { t: 'bar/foo.spec.js', i: 'bar/foo' });
    });
    it('should track the component', () => {
      expect(output).to.contain('tracking component bar/foo');
    });
    it('bitmap should include the file and the test file correctly', () => {
      const bitMap = helper.bitMap.read();
      const expectedArray = [
        { relativePath: 'bar/foo.js', test: false, name: 'foo.js' },
        { relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' },
      ];
      expect(bitMap).to.have.property('bar/foo');
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.array();
      expect(files).to.deep.equal(expectedArray);
      expect(files).to.be.ofSize(2);
    });
  });
  describe('add one component to project with existing .bit.map.json file', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.bitMap.delete();
      helper.bitMap.create(
        helper.scopes.localPath,
        {
          'bar/foo': {
            files: [
              {
                relativePath: 'bar/foo.js',
                test: false,
                name: 'foo.js',
              },
            ],
            mainFile: 'bar/foo.js',
            origin: 'AUTHORED',
          },
        },
        true
      );

      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
    });
    it('Should update .bit.map.json file and not create ', () => {
      const oldBitMap = helper.bitMap.read(path.join(helper.scopes.localPath, '.bit.map.json'));
      expect(oldBitMap).to.have.property('bar/foo2');
    });
    it('Should not create .bitmap ', () => {
      const newBitMapPath = path.join(helper.scopes.localPath, '.bitmap');
      expect(newBitMapPath).to.not.be.a.path('.bitmap Should not exist');
    });
  });
  describe('add existing files to exported component', () => {
    let bitMap;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopes.remotePath;
      helper.fs.createFile('bar', 'index.js');
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/', { i: 'bar/foo ' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.fs.deletePath('bar/foo2.js');
      helper.command.addComponent('bar/', { i: 'bar/foo ' });
      helper.command.runCmd('bit s');
      bitMap = helper.bitMap.read();
    });
    it('should not create duplicate ids in bitmap', () => {
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@0.0.1`);
      expect(bitMap).to.not.have.property('bar/foo');
    });
    it('should contain only one file', () => {
      expect(bitMap[`${helper.scopes.remote}/bar/foo@0.0.1`].files).to.be.ofSize(1);
    });
  });
  describe('add component when id includes a version', () => {
    before(() => {
      helper.scopeHelper.initLocalScope();
      helper.fixtures.createComponentBarFoo();
    });
    it('should throw an VersionShouldBeRemoved exception', () => {
      const addFunc = () => helper.command.addComponent('bar/foo.js', { i: 'bar/foo@0.0.4' });
      const error = new VersionShouldBeRemoved('bar/foo@0.0.4');
      helper.general.expectToThrow(addFunc, error);
    });
  });
  describe('add component when the test is a directory', () => {
    before(() => {
      helper.scopeHelper.initLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('specs', 'foo.spec.js');
    });
    it('should throw an exception TestIsDirectory', () => {
      const addFunc = () => helper.command.addComponent('bar/foo.js', { i: 'bar/foo', t: 'specs' });
      const error = new TestIsDirectory('specs');
      helper.general.expectToThrow(addFunc, error);
    });
  });
  describe('add component when the main file is a directory', () => {
    before(() => {
      helper.scopeHelper.initLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fs.createFile('mainDir', 'mainFile.js');
    });
    it('should throw an exception TestIsDirectory', () => {
      const addFunc = () => helper.command.addComponent('bar/foo.js', { i: 'bar/foo', m: 'mainDir' });
      const mainPath = path.join(helper.scopes.localPath, 'mainDir');
      const error = new MainFileIsDir(mainPath);
      helper.general.expectToThrow(addFunc, error);
    });
  });
  describe('add file as lowercase and then re-add it as CamelCase', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      fs.removeSync(path.join(helper.scopes.localPath, 'bar'));
      helper.fs.createFile('Bar', 'foo.js');
      helper.command.addComponent('Bar/foo.js', { i: 'bar/foo' });
    });
    it('should update the files and the mainFile with the new case', () => {
      const bitMap = helper.bitMap.read();
      const componentMap = bitMap['bar/foo'];
      expect(componentMap.files).to.have.lengthOf(1);
      expect(componentMap.files[0].relativePath).to.equal('Bar/foo.js');
      expect(componentMap.files[0].relativePath).to.not.equal('bar/foo.js');
      expect(componentMap.mainFile).to.equal('Bar/foo.js');
    });
  });
  describe('add the main file when it was removed before', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo-main.js');
      helper.command.addComponent('bar', { m: 'foo-main.js', i: 'bar/foo' });
      helper.fs.deletePath('bar/foo-main.js');
      const status = helper.command.status();
      expect(status).to.have.string(statusInvalidComponentsMsg);
      expect(status).to.have.string('main-file was removed');
      helper.fs.createFile('bar', 'foo-main2.js');
      output = helper.command.addComponent('bar/foo-main2.js', { m: 'bar/foo-main2.js', i: 'bar/foo' });
    });
    it('should add the main file successfully', () => {
      expect(output).to.have.string('added bar/foo-main2.js');
    });
  });
  describe('directory is with upper case and test/main flags are written with lower case', () => {
    let addOutput;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('Bar', 'foo.js');
      helper.fs.createFile('Bar', 'foo.spec.js');
      addOutput = helper.general.runWithTryCatch('bit add Bar -i bar -m bar/foo.js -t bar/foo.spec.js');
    });
    it('should throw an error for case sensitive filesystem saying the file was not found. for other system, it should work', () => {
      if (addOutput.includes('error')) {
        expect(addOutput).to.have.string('file or directory');
        expect(addOutput).to.have.string('was not found');
      } else {
        expect(addOutput).to.have.string('added');
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('bar');
        const files = bitMap.bar.files.map((file) => file.relativePath);
        expect(files).to.include('Bar/foo.js');
        expect(files).to.include('Bar/foo.spec.js');
        expect(files).not.to.include('bar/foo.js');
        expect(files).not.to.include('bar/foo.js');
      }
    });
  });
  describe('adding a file outside the consumer dir', () => {
    let consumerDir;
    before(() => {
      helper.scopeHelper.clean();
      consumerDir = path.join(helper.scopes.localPath, 'bar');
      fs.mkdirSync(consumerDir);
      helper.fs.createFile('', 'foo.js');
      helper.scopeHelper.initWorkspace(consumerDir);
    });
    it('should throw PathOutsideConsumer error', () => {
      const addCmd = () => helper.command.addComponent('../foo.js', undefined, consumerDir);
      const error = new PathOutsideConsumer(path.normalize('../foo.js'));
      helper.general.expectToThrow(addCmd, error);
    });
  });
  describe('adding a directory outside the consumer dir', () => {
    let consumerDir;
    before(() => {
      helper.scopeHelper.clean();
      consumerDir = path.join(helper.scopes.localPath, 'bar');
      fs.mkdirSync(consumerDir);
      helper.fs.createFile('foo', 'foo.js');
      helper.scopeHelper.initWorkspace(consumerDir);
    });
    it('should throw PathOutsideConsumer error', () => {
      const addCmd = () => helper.command.addComponent('../foo', undefined, consumerDir);
      const error = new PathOutsideConsumer(path.normalize('../foo'));
      helper.general.expectToThrow(addCmd, error);
    });
  });
  describe('adding a directory and also its files', () => {
    let output;
    before(() => {
      helper.scopeHelper.initLocalScope();
      helper.fs.createFile('src/one', 'first.js');
      helper.fs.createFile('src/one', 'second.js');
      helper.fs.createFile('src/two', 'third.js');
      helper.fs.createFile('src', 'fourth.js');
      output = helper.command.addComponent('"src/**/*"');
    });
    it('should add them as individual files and ignore the directories', () => {
      expect(output).to.have.string('tracking 4 new components');
    });
  });
  describe.skip('running add command with id without any path to change a component', () => {
    let scopeAfterAdd;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('src', 'main1.js');
      helper.fs.createFile('src', 'main2.js');
      helper.fs.createFile('src', 'main1.spec.js');
      helper.fs.createFile('src', 'main2.spec.js');
      helper.command.addComponent('src/main1.js', { i: 'foo' });
      scopeAfterAdd = helper.scopeHelper.cloneLocalScope();
    });
    describe('changing the main file', () => {
      before(() => {
        helper.command.addComponent('', { i: 'foo', m: 'src/main2.js' });
      });
      it('should change the main file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.foo.mainFile).to.equal('src/main2.js');
      });
    });
    describe('adding test files', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdd);
        helper.command.addComponent('', { i: 'foo', t: 'src/main1.spec.js' });
      });
      it('should add the test files', () => {
        const bitMap = helper.bitMap.read();
        const specFile = bitMap.foo.files.find((f) => f.relativePath === 'src/main1.spec.js');
        expect(specFile).to.not.be.undefined;
        expect(specFile.test).to.be.true;
      });
    });
  });
  describe('no mainFile and one of the files has the same name as the directory', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFile('bar', 'bar.js');
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent('bar');
    });
    it('should resolve the mainFile as the file with the same name as the directory', () => {
      const bitMap = helper.bitMap.read();
      const bar = bitMap.bar;
      expect(bar.mainFile).to.equal('bar/bar.js');
    });
  });
  describe('sort .bitmap components', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFileOnRootLevel('aaa.js');
      helper.fs.createFileOnRootLevel('bbb.js');
      helper.fs.createFileOnRootLevel('ccc.js');
      helper.fs.createFileOnRootLevel('ddd.js');
      helper.command.addComponent('bbb.js');
      helper.command.addComponent('ddd.js');
      helper.command.addComponent('aaa.js');
      helper.command.addComponent('ccc.js');
    });
    it('should sort the components in .bitmap file alphabetically', () => {
      const bitMap = helper.bitMap.read();
      const ids = Object.keys(bitMap);
      expect(ids[0]).to.equal('aaa');
      expect(ids[1]).to.equal('bbb');
      expect(ids[2]).to.equal('ccc');
      expect(ids[3]).to.equal('ddd');
    });
  });
  describe('sort .bitmap files', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fs.createFileOnRootLevel('aaa.js');
      helper.fs.createFileOnRootLevel('bbb.js');
      helper.fs.createFileOnRootLevel('ccc.js');
      helper.fs.createFileOnRootLevel('ddd.js');
      helper.command.addComponent('bbb.js', { i: 'foo' });
      helper.command.addComponent('ddd.js', { i: 'foo' });
      helper.command.addComponent('aaa.js', { i: 'foo' });
      helper.command.addComponent('ccc.js', { i: 'foo' });
    });
    it('should sort the components in .bitmap file alphabetically', () => {
      const bitMap = helper.bitMap.read();
      const files = bitMap.foo.files;
      expect(files[0].relativePath).to.equal('aaa.js');
      expect(files[1].relativePath).to.equal('bbb.js');
      expect(files[2].relativePath).to.equal('ccc.js');
      expect(files[3].relativePath).to.equal('ddd.js');
    });
  });
  describe('adding files when workspace is new', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.createComponentBarFoo();
    });
    it('should throw an error AddingIndividualFiles', () => {
      const addFunc = () => helper.command.addComponent('bar/foo.js');
      const error = new AddingIndividualFiles(path.normalize('bar/foo.js'));
      helper.general.expectToThrow(addFunc, error);
    });
    it('when excluding a file, should throw an error', () => {
      helper.fs.outputFile('bar/foo1.js');
      const cmd = () => helper.command.addComponent('bar', { e: 'bar/foo1.js' });
      expect(cmd).to.throw('unable to exclude files when tracking a directory');
    });
  });
});
