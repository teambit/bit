/* eslint-disable max-lines */
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';
import { AUTO_GENERATED_MSG } from '../../src/constants';
import {
  ExcludedMainFile,
  IncorrectIdForImportedComponent,
  VersionShouldBeRemoved
} from '../../src/consumer/component/add-components/exceptions';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit add command', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('add before running "bit init"', () => {
    it('Should return message to run "bit init"', () => {
      let error;
      try {
        helper.createFile('bar', 'foo.js');
        helper.addComponent(path.normalize('bar/foo.js'));
      } catch (err) {
        error = err.message;
      }
      expect(error).to.have.string('workspace not found. to initiate a new workspace, please use `bit init');
    });
  });
  describe('bit add without bitmap and .git/bit initialized', () => {
    it('Should find local scope inside .git/bit and add component', () => {
      helper.reInitLocalScope();
      helper.initNewGitRepo();
      helper.deleteFile('.bitmap');
      helper.deleteFile('.bit');
      helper.deleteFile('bit.json');
      helper.initLocalScope('bit init');
      helper.createFile('bar', 'foo.js');
      const addCmd = () => helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo ' });
      expect(addCmd).to.not.throw('fatal: scope not found. to create a new scope, please use `bit init`');
    });
  });
  describe('add before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then add component', () => {
      helper.createBitMap();
      helper.createFile('bar', 'foo.js');
      const output = helper.addComponent(path.normalize('bar/foo.js'));
      expect(output).to.contain('tracking component bar/foo');
    });
  });
  describe('add to imported component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const remote = helper.remoteScopePath;
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.importCompiler();
      helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo ' });
      helper.tagAllWithoutMessage();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope(remote);
      helper.importComponent('bar/foo');
    });
    it('Should throw error when trying to add files to imported component without specifying id', () => {
      const addCmd = () => helper.addComponent('.', path.join(helper.localScopePath, 'components', 'bar', 'foo'));
      expect(addCmd).to.throw(
        `error: unable to add new files to the component "${
          helper.remoteScope
        }/bar/foo" without specifying a component ID. please define the component ID using the --id flag.`
      );
    });
    it('Should throw error when trying to add files to imported component without specifying correct id', () => {
      const addCmd = () =>
        helper.addComponentWithOptions(
          '.',
          { i: 'test/test' },
          path.join(helper.localScopePath, 'components', 'bar', 'foo')
        );
      const error = new IncorrectIdForImportedComponent(
        `${helper.remoteScope}/bar/foo`,
        'test/test',
        'components/bar/foo/foo.js'
      );
      helper.expectToThrow(addCmd, error);
    });
    it('should throw an error when specifying an incorrect version', () => {
      const addFunc = () => helper.addComponentWithOptions('components/bar/foo', { i: 'bar/foo@0.0.45' });
      const error = new VersionShouldBeRemoved('bar/foo@0.0.45');
      helper.expectToThrow(addFunc, error);
    });
    it('Should not add files and dists to imported component', () => {
      helper.addComponentWithOptions(
        '.',
        { i: 'bar/foo' },
        path.join(helper.localScopePath, 'components', 'bar', 'foo')
      );
      const expectTestFile = { relativePath: 'foo.js', test: false, name: 'foo.js' };
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files).to.deep.include(expectTestFile);
      expect(files, helper.printBitMapFilesInCaseOfError(files)).to.be.ofSize(1);
    });
    it('Should only add new files to imported component', () => {
      helper.createFile(path.join('components', 'bar', 'foo', 'testDir'), 'newFile.js', 'console.log("test");');
      helper.addComponentWithOptions(
        '.',
        { i: 'bar/foo' },
        path.join(helper.localScopePath, 'components', 'bar', 'foo')
      );
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files, helper.printBitMapFilesInCaseOfError(files)).to.be.ofSize(2);
      expect(files).to.deep.include({ relativePath: 'foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'testDir/newFile.js', test: false, name: 'newFile.js' });
    });
    it('Should not add dist files to imported component when distTarget is not specified', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files, helper.printBitMapFilesInCaseOfError(files)).to.be.ofSize(2);
      expect(files).to.not.deep.include({ relativePath: 'dist/foo.js', test: false, name: 'foo.js' });
      expect(files).to.not.deep.include({ relativePath: 'dist/testDir/newFile.js', test: false, name: 'newFile.js' });
    });
    it('Should only add test file to imported component', () => {
      helper.createFile(path.join('components', 'bar', 'foo', 'testDir'), 'test.spec.js', 'console.log("test");');
      helper.addComponentWithOptions(
        'testDir/test.spec.js',
        {
          t: 'testDir/test.spec.js',
          i: 'bar/foo'
        },
        path.join(helper.localScopePath, 'components', 'bar', 'foo')
      );
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
      const component = bitMap[`${helper.remoteScope}/bar/foo@0.0.1`];
      const files = component.files;
      expect(files).to.be.array();
      expect(files, helper.printBitMapFilesInCaseOfError(files)).to.be.ofSize(3);
      expect(files).to.deep.include({ relativePath: 'testDir/test.spec.js', test: true, name: 'test.spec.js' });
    });
    it('should not throw an error when specifying the correct version', () => {
      const output = helper.addComponentWithOptions('components/bar/foo', { i: `${helper.remoteScope}/bar/foo@0.0.1` });
      expect(output).to.have.string('added');
    });
  });
  describe('add one component', () => {
    let output;
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should print tracking component: id', () => {
      helper.createFile('bar', 'foo2.js');
      output = helper.addComponent(path.normalize('bar/foo2.js'));
      expect(output).to.contain('tracking component bar/foo2');
    });
    it('Should print warning when trying to add file that is already tracked with different id and not add it as a new one', () => {
      helper.createFile('bar', 'foo2.js');
      helper.addComponent(path.normalize('bar/foo2.js'));
      output = helper.addComponent(`${path.normalize('bar/foo2.js')} -i bar/new`);
      expect(output).to.have.string('warning: files bar/foo2.js already used by component: bar/foo2');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property('bar/new');
    });
    it('Should add test to tracked component', () => {
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo2.spec.js');
      helper.addComponent(path.normalize('bar/foo2.js'));
      helper.addComponent(` -t ${path.normalize('bar/foo2.spec.js')} --id bar/foo2`);
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo2'].files;
      const expectImplFile = { relativePath: 'bar/foo2.js', test: false, name: 'foo2.js' };
      const expectTestFile = { relativePath: 'bar/foo2.spec.js', test: true, name: 'foo2.spec.js' };
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.include(expectTestFile);
      expect(files).to.deep.include(expectImplFile);
    });
    it('Should throw message if adding test files without id', () => {
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo2.spec.js');
      const normalizedPath = path.normalize('bar/foo2.js');
      helper.addComponent(normalizedPath);
      const specNormalizedPath = path.normalize('bar/foo2.spec.js');
      const addCmd = () => helper.addComponent(` -t ${specNormalizedPath}`);
      expect(addCmd).to.throw(
        `Command failed: ${
          helper.bitBin
        } add  -t ${specNormalizedPath}\nplease specify a component ID to add test files to an existing component. \nexample: bit add --tests [test_file_path] --id [component_id]\n`
      );
    });

    it('Should add component to bitmap with folder as default namespace', () => {
      helper.createFile('bar', 'foo2.js');
      helper.addComponent(path.normalize('bar/foo2.js'));
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo2');
    });

    it('Should add component main file when defined from relative path ', () => {
      helper.createFile('bar', 'bar.js');
      helper.createFile('bar/foo', 'foo.js');
      helper.createFile('bar/foo', 'foo2.js');

      helper.createFile('goo', 'goo.js');
      helper.addComponentWithOptions(
        path.normalize('foo/foo.js foo/foo2.js'),
        { m: 'foo/foo2.js', i: 'test/test' },
        path.join(helper.localScopePath, 'bar')
      );
      const bitMap = helper.readBitMap();
      const files = bitMap['test/test'].files;
      expect(bitMap['test/test'].mainFile).to.equal('bar/foo/foo2.js');
      const expectTestFile = { relativePath: 'bar/foo/foo.js', test: false, name: 'foo.js' };
      expect(files).to.deep.include(expectTestFile);
    });
    it('Should not add component if bit.json is corrupted', () => {
      helper.createFile('bar', 'foo2.js');
      helper.corruptBitJson();
      try {
        helper.addComponent(path.normalize('bar/foo2.js'));
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
    it('Should throw error when adding more than one component with same ID ', () => {
      helper.createFile('bar', 'file.js');
      helper.createFile('bar', 'file.md');
      const addCmd = () => helper.addComponent(path.normalize('bar/*'));
      expect(addCmd).to.throw('unable to add 2 components with the same ID: bar/file : bar/file.js,bar/file.md');
    });
    it('Should trim testFiles spaces', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo.spec.js');
      helper.addComponentWithOptions(osComponentName, { t: `${osFilePathName}       ` });
      const bitMap = helper.readBitMap();
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
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo.spec.js');
      helper.addComponentWithOptions(osComponentName, { t: `${osFilePathName}       ` });
      const bitMap = fs.readFileSync(path.join(helper.localScopePath, '.bitmap')).toString();
      expect(bitMap).to.have.string(AUTO_GENERATED_MSG);
    });
    it('Should not add component to bitmap because test file does not exists', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.createFile('bar', 'foo.js');
      const addCmd = () => helper.addComponentWithOptions(osComponentName, { t: `${osFilePathName}       ` });
      expect(addCmd).to.throw(`error: file or directory "${osFilePathName}" was not found`);
    });
    it('Add component from subdir  ../someFile ', () => {
      const barPath = path.join(helper.localScopePath, 'bar/x');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo2.spec.js');
      helper.createFile('bar/x', 'foo1.js');
      helper.addComponent('../foo2.js -t ../foo2.spec.js', barPath);
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo2');

      const testFile = bitMap['bar/foo2'].files.find(file => file.test === true);
      const implFile = bitMap['bar/foo2'].files.find(file => file.test === false);
      expect(testFile.relativePath).to.equal('bar/foo2.spec.js');
      expect(implFile.relativePath).to.equal('bar/foo2.js');
    });
    it('Should add component with namespace flag to bitmap with correct name', () => {
      helper.createFile('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/foo2.js', { n: 'test' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('test/foo2');
    });
    it('Should override component with override flag', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'boo1.js');
      helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo ' });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.ofSize(1);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      helper.addComponentWithOptions('bar/boo1.js', { i: 'bar/foo', o: true, m: 'bar/boo1.js' });
      const bitMap2 = helper.readBitMap();
      expect(bitMap2).to.have.property('bar/foo');
      const files2 = bitMap2['bar/foo'].files;
      expect(files2).to.be.ofSize(1);
      expect(files2).to.deep.include({ relativePath: 'bar/boo1.js', test: false, name: 'boo1.js' });
      expect(bitMap2['bar/foo'].mainFile).to.equal('bar/boo1.js');
    });
    it('Should throw error when no index file is found', () => {
      const file1 = 'foo1.js';
      const file2 = 'foo2.js';
      helper.createFile('bar', file1);
      helper.createFile('bar', file2);

      const addCmd = () => helper.addComponentWithOptions('bar', { n: 'test' });
      expect(addCmd).to.throw(
        `Command failed: ${
          helper.bitBin
        } add bar -n test\nerror: one or more of the added components does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at https://docs.bitsrc.io/docs/isolating-and-tracking-components.html#define-a-components-main-file\n`
      );
    });
    it('Should throw error msg if -i and -n flag are used with bit add', () => {
      helper.createFile('bar', 'foo2.js');
      const addCmd = () => helper.addComponentWithOptions('bar/foo2.js', { n: 'test', i: 'jaja' });
      expect(addCmd).to.throw('please use either [id] or [namespace] to add a particular component');
    });
    it('Should throw error msg if trying to add non existing file', () => {
      const addCmd = () => helper.addComponent('non-existing-file.js');
      expect(addCmd).to.throw('error: file or directory "non-existing-file.js" was not found');
    });
    it.skip('Bitmap should contain multiple files for component with more than one file', () => {});
    it.skip('Bitmap should contain impl files and test files  in different fields', () => {});
    it('Bitmap origin should be AUTHORED', () => {
      helper.createFile('bar', 'foo1.js');
      helper.addComponent('bar/foo1.js');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap['bar/foo1'].origin).to.equal('AUTHORED');
    });
    it('Should prevent adding a file with invalid keys in namespace', () => {
      let errMsg;
      helper.createComponentBarFoo();
      const normalizedPath = path.normalize('bar/foo.js');
      try {
        helper.addComponentWithOptions(normalizedPath, { i: 'bar.f/foo' });
      } catch (err) {
        errMsg = err.message;
      }
      expect(errMsg).to.have.string(
        `Command failed: ${
          helper.bitBin
        } add ${normalizedPath} -i bar.f/foo\nerror: "bar.f/foo" is invalid, component IDs can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]\n`
      );
    });
    it('Should prevent adding a file with invalid keys in ID', () => {
      let errMsg;
      helper.createComponentBarFoo();
      let normalizedPath;
      try {
        normalizedPath = path.normalize('bar/foo.js');
        helper.addComponentWithOptions(normalizedPath, { i: 'bar/fo.o' });
      } catch (err) {
        errMsg = err.message;
      }
      expect(errMsg).to.have.string(
        `Command failed: ${
          helper.bitBin
        } add ${normalizedPath} -i bar/fo.o\nerror: "bar/fo.o" is invalid, component IDs can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!"]\n`
      );
    });
    it.skip('Bitmap mainFile should point to correct mainFile', () => {});
    it.skip('should not allow adding a component with an existing box-name and component-name', () => {});
  });
  describe('adding file to existing tagged component', () => {
    let bitMap;
    let files;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'boo1.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.tagAllWithoutMessage();
      helper.addComponentWithOptions('bar/boo1.js', { i: 'bar/foo' });
      bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo@0.0.1'); // should not change the component ID
      files = bitMap['bar/foo@0.0.1'].files;
    });
    it('Should show component as modified', () => {
      const output = helper.runCmd('bit s');
      expect(output).to.have.string(
        'modified components\n(use "bit tag --all [version]" to lock a version with all your changes)\n\n     > bar/foo'
      );
    });
    it('Should be added to the existing component', () => {
      expect(files).to.deep.include({ relativePath: 'bar/boo1.js', test: false, name: 'boo1.js' });
      expect(files).to.be.ofSize(2);
      expect(bitMap).to.not.have.property('bar/boo1');
    });
  });
  describe('add multiple components', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should add all components with correct namespace and return message to user', () => {
      const basePath = path.normalize('bar/*');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo1.js');
      const output = helper.addComponentWithOptions(basePath, { n: 'test' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('test/foo1');
      expect(bitMap).to.have.property('test/foo2');
      expect(output).to.have.string('tracking 2 new components');
    });
    it('Should return error for missing namespace', () => {
      const basePath = path.normalize('bar/*');
      let errorMessage;
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo1.js');
      try {
        helper.addComponentWithOptions(basePath, { n: '' });
      } catch (err) {
        errorMessage = err.message;
      }
      expect(errorMessage).to.have.string("error: option `-n, --namespace <namespace>' argument missing");
    });
    it('Define dynamic main file ', () => {
      const mainFileOs = path.normalize('{PARENT}/{PARENT}.js');
      helper.createFile('bar', 'bar.js');
      helper.createFile('bar', 'foo1.js');
      helper.addComponentWithOptions('bar', { m: mainFileOs, n: 'test' });
      const bitMap = helper.readBitMap();
      const mainFile = bitMap['test/bar'].mainFile;
      expect(bitMap).to.have.property('test/bar');
      expect(mainFile).to.equal('bar/bar.js');
    });
    it('Should add component with spec file from another dir according to dsl', () => {
      const dslOs = path.normalize('test/{FILE_NAME}.spec.js');
      helper.createFile('bar', 'foo.js');
      helper.createFile('test', 'foo.spec.js');
      helper.addComponentWithOptions('bar/foo.js', { t: dslOs });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Glob and dsl Should add component to bitmap ', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('test', 'foo.spec.js');
      helper.createFile('test2', 'foo1.spec.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), {
        t: path.normalize('test/{FILE_NAME}.spec.js,test2/*.spec.js')
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(3);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test2/foo1.spec.js', test: true, name: 'foo1.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('should not add test file as bit component', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('test', 'foo.spec.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), {
        t: path.normalize('test/{FILE_NAME}.spec.js'),
        n: 'internal'
      });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property('test/foo.spec');
    });

    it('Should add dir files with spec from dsl when test files are flattened', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('test', 'foo.spec.js');
      helper.createFile('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: path.normalize('test/{FILE_NAME}.spec.js')
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(5);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should return error if used the "-i" flag without specifying an ID', () => {
      helper.createFile('bar', 'foo.js');
      let errorMessage;
      try {
        helper.addComponentWithOptions('bar', {
          i: ''
        });
      } catch (err) {
        errorMessage = err.message;
      }
      expect(errorMessage).to.have.string("error: option `-i, --id <name>' argument missing");
    });
    it('Should return error if used an invalid ID', () => {
      helper.createFile('bar', 'foo.js');
      let errorMessage;
      try {
        helper.addComponentWithOptions('bar', {
          i: 'Bar/Foo'
        });
      } catch (err) {
        errorMessage = err.message;
      }

      expect(errorMessage).to.have.string('error: "Bar/Foo" is invalid, component IDs can only contain');
    });
    it('Should add component with global namespace if used parcial ID', () => {
      helper.createFile('bar', 'foo.js');
      helper.addComponentWithOptions('bar', {
        i: 'foo'
      });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('global/foo');
    });
    it('Should add dir files with spec from multiple dsls when test files are placed in same structure', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('test/bar', 'foo.spec.js');
      helper.createFile('test/bar', 'foo2.spec.js');
      helper.createFile('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,test/{FILE_NAME}.spec.js'
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should add dir files with spec from multiple dsls when test files are placed in same structure but bit add is with glob', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('bar', 'foo.spec.js');
      helper.createFile('test/bar', 'foo2.spec.js');
      helper.createFile('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/*.js', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,bar/foo.spec.js,test/{FILE_NAME}.spec.js'
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });

    it('Should add dir files with spec from dsl and glob pattern', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('test/bar', 'foo.spec.js');
      helper.createFile('test/bar', 'foo2.spec.js');
      helper.createFile('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,test/*.spec.js'
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });

    // TODO: we need to implement the feature preventing the use of -t without wrapping in quotes.
    it.skip('Should output message preventing user from adding files with spec from dsl and glob pattern without using quotes', () => {
      let errMsg = '';
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('test/bar', 'foo.spec.js');
      helper.createFile('test/bar', 'foo2.spec.js');
      try {
        helper.runCmd('bit add bar/*.js -t test/bar/{FILE_NAME}.spec.js -n bar');
      } catch (err) {
        errMsg = err.message;
      }
      expect(errMsg).to.have.string('Please wrap tests with quotes');
    });

    it('Should add dir files with spec from dsl and glob pattern and exclude', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('test/bar', 'foo.spec.js');
      helper.createFile('test/bar', 'foo2.spec.js');
      helper.createFile('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,test/*.spec.js',
        e: 'test/*.spec.js'
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(5);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });

    // TODO: we need to implement the feature preventing -e without wrapping in quotes.
    it.skip('Should prevent using exclude flag without wrapping in quotes', () => {
      let errMsg = '';
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      try {
        helper.runCmd('bit add bar/*.js -e bar/foo2.js');
      } catch (err) {
        errMsg = err.message;
      }
      expect(errMsg).to.have.string('Please wrap excluded files with quotes');
    });
    // TODO: we need to implement the feature preventing -e without wrapping in quotes.
    it('should throw an error when main file is excluded', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      const addCmd = () => helper.runCmd('bit add bar/*.js -e bar/foo2.js -m bar/foo2.js');
      const error = new ExcludedMainFile(path.join('bar', 'foo2.js'));
      helper.expectToThrow(addCmd, error);
    });
    it('Should modify bitmap when adding component again when specifing id', () => {
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'index.js');
      helper.createFile('bars', 'foo3.js');
      helper.addComponentWithOptions('bar/', { i: 'bar/foo' });
      const bitMap1 = helper.readBitMap();
      const files1 = bitMap1['bar/foo'].files;
      expect(bitMap1).to.have.property('bar/foo');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(2);
      helper.addComponentWithOptions('bars/', { i: 'bar/foo' });
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(3);
    });

    it('Should modify bitmap when adding component again without id', () => {
      helper.createFile('bar/foo', 'foo.js');
      helper.createFile('bar/foo', 'index.js');
      helper.addComponentWithOptions('bar/foo', {});
      const bitMap1 = helper.readBitMap();
      const files1 = bitMap1['bar/foo'].files;
      expect(bitMap1).to.have.property('bar/foo');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(2);
      helper.createFile('bar/foo', 'foo3.js');
      helper.addComponentWithOptions('bar/foo', {});
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(3);
    });
    it('Should add test files from dsls and exlude dsl specifics', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('bar', 'foo.spec.js');
      helper.createFile('test/bar', 'foo2.spec.js');
      helper.createFile('test/bar', 'a.example.js');
      helper.createFile('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/*.js', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT}/{FILE_NAME}.spec.js,bar/foo.spec.js,test/{FILE_NAME}.spec.js',
        e: 'test/{PARENT}/*.example.*'
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(files).to.deep.not.include({ relativePath: 'bar/a.example.js', test: true, name: 'a.example.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
  });
  describe('add component with exclude', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('should throw error when all files are excluded', () => {
      helper.createFile('bar', 'foo1.js');
      const normalizedPath = path.normalize('bar/foo1.js');
      const addCmd = () => helper.addComponentWithOptions(normalizedPath, { e: 'bar/foo1.js' });
      expect(addCmd).to.throw(`warning: no files to add, the following files were ignored: ${normalizedPath}`);
    });
    it('should throw an error when main file is excluded', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      const addCmd = () => helper.addComponentWithOptions('bar', { i: 'bar/foo', e: 'bar/foo1.js', m: 'bar/foo1.js' });
      const error = new ExcludedMainFile(path.join('bar', 'foo1.js'));
      helper.expectToThrow(addCmd, error);
    });
    it('should add main file to component if exists and not in file list', () => {
      const expectedArray = [
        { relativePath: 'bar/foo1.js', test: false, name: 'foo1.js' },
        { relativePath: 'bar/foo2.js', test: false, name: 'foo2.js' }
      ];
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/foo1.js', { i: 'bar/foo', m: 'bar/foo2.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo');
      const files = bitMap['bar/foo'].files;
      expect(files).to.deep.equal(expectedArray);
    });
    it('bitMap should only contain bits that have files', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/foo1.js bar/foo2.js', { e: 'bar/foo2.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).not.to.have.property('bar/foo2');
    });
    it('When adding folder bitMap should not contain excluded glob *.exclude.js', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*.js', { e: 'bar/*.exclude.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/foo2.exclude.js');
    });
    it('Bitmap should not contain all files in excluded list', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*.js', { e: 'bar/*.exclude.js,bar/foo2.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).not.to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/foo2.exclude.js');
    });
    it('When excluding dir ,bit component should not appear in bitmap', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar/x', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*', { e: 'bar/x/' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/x');
    });
    it('bitMap should contain files that are not excluded ', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.js');
      helper.createFile('bar', 'foo3.js');
      helper.addComponentWithOptions(
        `${path.normalize('bar/foo1.js')} ${path.normalize('bar/foo2.js')} ${path.normalize(
          'bar/foo3.js'
        )}  -i bar/foo -m ${path.normalize('bar/foo1.js')}`,
        { e: 'bar/foo2.js' }
      );
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      const expectedArray = [
        { relativePath: 'bar/foo1.js', test: false, name: 'foo1.js' },
        { relativePath: 'bar/foo3.js', test: false, name: 'foo3.js' }
      ];
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.array();
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.equal(expectedArray);
    });
    it('bitMap should contain component even if all test files are excluded ', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/foo1.js', { t: 'bar/foo2.spec.js', e: 'bar/foo2.spec.js' });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo1'].files;
      expect(bitMap).to.have.property('bar/foo1');
      expect(files).to.be.ofSize(1);
    });
    it('bit should add components and exclude files', () => {
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'foo1.js');
      helper.createFile('bar', 'index.js');
      helper.createFile('foo', 'foo3.js');
      helper.createFile('foo', 'foo4.js');
      helper.addComponentWithOptions(path.normalize('*'), { e: 'foo' });
      const bitMap = helper.readBitMap();
      expect(bitMap).not.to.have.property('bar/foo1');
    });
  });
  describe('with multiple index files', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'index.js');
      helper.createFile('bar', 'foo.js');
      helper.createFile(path.join('bar', 'exceptions'), 'some-exception.js');
      helper.createFile(path.join('bar', 'exceptions'), 'index.js');
      helper.addComponentWithOptions('bar', { i: 'bar/foo' });
    });
    it('should identify the closest index file as the main file', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap['bar/foo'].mainFile).to.equal('bar/index.js');
    });
  });
  describe('adding files to an imported component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.importCompiler();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    describe('outside the component rootDir', () => {
      let output;
      before(() => {
        helper.createFile('bar', 'foo2.js');
        try {
          helper.addComponentWithOptions(path.join('bar', 'foo2.js'), { i: 'bar/foo' });
        } catch (err) {
          output = err.message;
        }
      });
      it('should throw an error', () => {
        const barFoo2Path = path.join('bar', 'foo2.js');
        expect(output).to.have.string(
          `Command failed: ${
            helper.bitBin
          } add ${barFoo2Path} -i bar/foo\nunable to add file bar/foo2.js because it's located outside the component root dir components/bar/foo\n`
        );
      });
    });
    describe('inside the component rootDir', () => {
      before(() => {
        const barFooPath = path.join('components', 'bar', 'foo', 'bar');
        helper.createFile(barFooPath, 'foo2.js');
        helper.addComponentWithOptions(path.join(barFooPath, 'foo2.js'), { i: 'bar/foo' });
      });
      it('should add the new file to the existing imported component', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap[`${helper.remoteScope}/bar/foo@0.0.1`].files).to.be.ofSize(2);
      });
      it('should not add it as a new component', () => {
        const bitMap = helper.readBitMap();
        expect(bitMap).not.to.have.property('bar/foo');
      });
      it('should mark the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output.includes('no modified components')).to.be.false;
        expect(output.includes('modified components')).to.be.true;
        expect(output.includes('bar/foo')).to.be.true;
      });
    });
  });
  describe('adding a component again (without specifying id) after exporting it', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.addComponentBarFoo();
    });
    it('should not add it as a new component', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).not.to.have.property('bar/foo');
    });
  });
  describe('add component/s with gitignore', () => {
    let errorMessage;
    before(() => {
      helper.reInitLocalScope();
    });
    it('Should show warning msg in case there are no files to add because of gitignore', () => {
      helper.createFile('bar', 'foo2.js');
      helper.writeGitIgnore(['bar/foo2.js']);

      try {
        helper.addComponent(path.normalize('bar/foo2.js'));
      } catch (err) {
        errorMessage = err.message;
      }
      expect(errorMessage).to.contain(
        `warning: no files to add, the following files were ignored: ${path.normalize('bar/foo2.js')}`
      );
    });
    it('Should only add files that are not in  gitignore', () => {
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('bar', 'boo.js');
      helper.writeGitIgnore(['bar/f*']);
      const output = helper.addComponent(path.normalize('bar/*.js'));
      expect(output).to.contain('tracking component bar/boo');
    });
    it('Should contain only unfiltered components inside bitmap', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/boo');
    });
  });
  describe('ignore specific files inside component', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo3.js');
      helper.createFile('bar', 'boo.js');
      helper.createFile('bar', 'index.js');
      helper.writeGitIgnore(['bar/foo.js', 'bar/foo3.js']);
      output = helper.addComponentWithOptions(path.normalize('bar/'), { i: 'bar/foo' });
    });
    it('Should track component ', () => {
      expect(output).to.contain('tracking component bar/foo');
    });
    it('Should contain component inside bitmap', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should contain inside bitmap only files that are not inside gitignore', () => {
      const bitMap = helper.readBitMap();
      const expectedArray = [
        { relativePath: 'bar/boo.js', test: false, name: 'boo.js' },
        { relativePath: 'bar/index.js', test: false, name: 'index.js' }
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
      helper.reInitLocalScope();
      helper.createFile('bar', 'foo.js');
      helper.createFile('bar', 'foo.spec.js');
      helper.createFile('bar', 'index.js');
      // we don't expect this pattern to do anything. it just makes sure we don't repeat the bug we
      // had before where having ANY entry in .gitignore with "!", the test file was ignored.
      helper.writeGitIgnore(['!bar']);
      output = helper.addComponentWithOptions('bar/foo.js', { t: 'bar/foo.spec.js' });
    });
    it('should track the component', () => {
      expect(output).to.contain('tracking component bar/foo');
    });
    it('bitmap should include the file and the test file correctly', () => {
      const bitMap = helper.readBitMap();
      const expectedArray = [
        { relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' },
        { relativePath: 'bar/foo.js', test: false, name: 'foo.js' }
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
      helper.reInitLocalScope();
      helper.deleteFile('.bitmap');
      helper.createBitMap(
        helper.localScopePath,
        {
          'bar/foo': {
            files: [
              {
                relativePath: 'bar/foo.js',
                test: false,
                name: 'foo.js'
              }
            ],
            mainFile: 'bar/foo.js',
            origin: 'AUTHORED'
          }
        },
        true
      );

      helper.createFile('bar', 'foo2.js');
      helper.addComponent(path.normalize('bar/foo2.js'));
    });
    it('Should update .bit.map.json file and not create ', () => {
      const oldBitMap = helper.readBitMap(path.join(helper.localScopePath, '.bit.map.json'));
      expect(oldBitMap).to.have.property('bar/foo2');
    });
    it('Should not create .bitmap ', () => {
      const newBitMapPath = path.join(helper.localScopePath, '.bitmap');
      expect(newBitMapPath).to.not.be.a.path('.bitmap Should not exist');
    });
  });
  describe('add existing files to exported component', () => {
    let bitMap;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.remoteScopePath;
      helper.createFile('bar', 'index.js');
      helper.createFile('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/', { i: 'bar/foo ' });
      helper.tagAllWithoutMessage();
      helper.exportAllComponents();
      helper.deleteFile('bar/foo2.js');
      helper.addComponentWithOptions('bar/', { i: 'bar/foo ' });
      helper.runCmd('bit s');
      bitMap = helper.readBitMap();
    });
    it('should not create duplicate ids in bitmap', () => {
      expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo@0.0.1`);
      expect(bitMap).to.not.have.property('bar/foo');
    });
    it('should contain only one file', () => {
      expect(bitMap[`${helper.remoteScope}/bar/foo@0.0.1`].files).to.be.ofSize(1);
    });
  });
  describe('add component when id includes a version', () => {
    before(() => {
      helper.initLocalScope();
      helper.createComponentBarFoo();
    });
    it('should throw an VersionShouldBeRemoved exception', () => {
      const addFunc = () => helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo@0.0.4' });
      const error = new VersionShouldBeRemoved('bar/foo@0.0.4');
      helper.expectToThrow(addFunc, error);
    });
  });
});
