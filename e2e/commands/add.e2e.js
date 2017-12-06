// covers also init, create, commit, import and export commands

import fs from 'fs';
import chai, { expect } from 'chai';
import normalize from 'normalize-path';
import path from 'path';
import Helper from '../e2e-helper';
import { AUTO_GENERATED_MSG, DEFAULT_INDEX_EXTS } from '../../src/constants';

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
        helper.createComponent('bar', 'foo.js');
        helper.addComponent(path.normalize('bar/foo.js'));
      } catch (err) {
        error = err.message;
      }
      expect(error).to.have.string('fatal: scope not found. to create a new scope, please use `bit init');
    });
  });
  describe('add one component', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should print tracking component: id', () => {
      helper.createComponent('bar', 'foo2.js');
      const output = helper.addComponent(path.normalize('bar/foo2.js'));
      expect(output).to.contain('tracking component bar/foo2');
    });
    it('Should add component to bitmap with folder as default namespace', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.addComponent(path.normalize('bar/foo2.js'));
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo2');
    });
    it('Should not add component if bit.json is corrupted', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.corruptBitJson();
      const addCmd = () => helper.addComponent(path.normalize('bar/foo2.js'));
      expect(addCmd).to.throw(
        'error: invalid bit.json: SyntaxError: Unexpected token o in JSON at position 1 is not a valid JSON file.'
      );
    });
    it('Should throw error when adding more than one component with same id ', () => {
      helper.createComponent('bar', 'file.js');
      helper.createComponent('bar', 'file.md');
      const addCmd = () => helper.addComponent(path.normalize('bar/*'));
      expect(addCmd).to.throw('unable to add 2 components with the same id bar/file : bar/file.js,bar/file.md');
    });
    it('Should trim testFiles spaces', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo.spec.js');
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
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo.spec.js');
      helper.addComponentWithOptions(osComponentName, { t: `${osFilePathName}       ` });
      const bitMap = fs.readFileSync(path.join(helper.localScopePath, '.bit.map.json')).toString();
      expect(bitMap).to.have.string(AUTO_GENERATED_MSG);
    });
    it('Should not add component to bitmap because test file does not exists', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.createComponent('bar', 'foo.js');
      const addCmd = () => helper.addComponentWithOptions(osComponentName, { t: `${osFilePathName}       ` });
      expect(addCmd).to.throw(`fatal: the file "${osFilePathName}" was not found`);
    });

    it('Add component from subdir  ../someFile ', () => {
      const barPath = path.join(helper.localScopePath, 'bar/x');
      helper.createComponent('bar', 'foo2.js');
      helper.createFile('bar', 'foo2.spec.js');
      helper.createComponent('bar/x', 'foo1.js');
      helper.addComponent('../foo2.js -t ../foo2.spec.js', barPath);
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo2');

      const testFile = bitMap['bar/foo2'].files.find(file => file.test === true);
      const implFile = bitMap['bar/foo2'].files.find(file => file.test === false);
      expect(testFile.relativePath).to.equal('bar/foo2.spec.js');
      expect(implFile.relativePath).to.equal('bar/foo2.js');
    });
    it('Should add component with namespace flag to bitmap with correct name', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/foo2.js', { n: 'test' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('test/foo2');
    });
    it('Should override component with override flag', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'boo1.js');
      helper.addComponentWithOptions('bar/foo.js', { i: 'bar/foo ' });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.ofSize(1);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      helper.addComponentWithOptions('bar/boo1.js', { i: 'bar/foo', o: true });
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.ofSize(1);
      expect(files2).to.deep.include({ relativePath: 'bar/boo1.js', test: false, name: 'boo1.js' });
    });

    it('Should throw error when no index file is found', () => {
      const file1 = 'foo1.js';
      const file2 = 'foo2.js';
      const file1Path = path.normalize(`bar/${file1}`);
      const file2Path = path.normalize(`bar/${file2}`);
      helper.createComponent('bar', file1);
      helper.createComponent('bar', file2);

      const addCmd = () => helper.addComponentWithOptions('bar', { n: 'test' });
      expect(addCmd).to.throw(
        `Command failed: ${helper.bitBin} add bar -n test\nfatal: the main file index.[${DEFAULT_INDEX_EXTS.join(
          ', '
        )}] was not found in the files list ${file1Path}, ${file2Path}\n`
      );
    });

    it('Should throw error msg if -i and -n flag are used with bit add', () => {
      helper.createComponent('bar', 'foo2.js');
      const addCmd = () => helper.addComponentWithOptions('bar/foo2.js', { n: 'test', i: 'jaja' });
      expect(addCmd).to.throw('You can use either [id] or [namespace] to add a particular component');
    });
    it('Should throw error msg if trying to add non existing file', () => {
      const addCmd = () => helper.addComponent('non-existing-file.js');
      expect(addCmd).to.throw('fatal: the file "non-existing-file.js" was not found');
    });

    it.skip('Bitmap should contain multiple files for component with more than one file', () => {});
    it.skip('Bitmap should contain impl files and test files  in different fields', () => {});
    it('Bitmap origin should be AUTHORED', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.addComponent('bar/foo1.js');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap['bar/foo1'].origin).to.equal('AUTHORED');
    });
    it.skip('Bitmap mainFile should point to correct mainFile', () => {});
    it.skip('should not allow adding a component with an existing box-name and component-name', () => {});
  });
  describe('add multiple components', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should add all components with correct namespace and return message to user', () => {
      const basePath = path.normalize('bar/*');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo1.js');
      const output = helper.addComponentWithOptions(basePath, { n: 'test' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('test/foo1');
      expect(bitMap).to.have.property('test/foo2');
      expect(output).to.have.string('tracking 2 new components');
    });
    it('Should return error for missing namespace', () => {
      const basePath = path.normalize('bar/*');
      let errorMessage;
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo1.js');
      try {
        helper.addComponentWithOptions(basePath, { n: '' });
      } catch (err) {
        errorMessage = err.message;
      }
      expect(errorMessage).to.have.string("error: option `-n, --namespace <namespace>' argument missing");
    });
    it('Define dynamic main file ', () => {
      const mainFileOs = path.normalize('{PARENT_FOLDER}/{PARENT_FOLDER}.js');
      helper.createComponent('bar', 'bar.js');
      helper.createComponent('bar', 'foo1.js');
      helper.addComponentWithOptions('bar', { m: mainFileOs, n: 'test' });
      const bitMap = helper.readBitMap();
      const mainFile = bitMap['test/bar'].mainFile;
      expect(bitMap).to.have.property('test/bar');
      expect(mainFile).to.equal('bar/bar.js');
    });
    it('Should add component with spec file from another dir according to dsl', () => {
      const dslOs = path.normalize('test/{FILE_NAME}.spec.js');
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.addComponentWithOptions('bar/foo.js', { t: dslOs });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(2);
      expect(files).to.deep.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.deep.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Glob and dsl Should add component to bitmap ', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.createComponent('test2', 'foo1.spec.js');
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
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), {
        t: path.normalize('test/{FILE_NAME}.spec.js'),
        n: 'internal'
      });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.not.have.property('test/foo.spec');
    });

    it('Should add dir files with spec from dsl when test files are flattened', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
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
      helper.createComponent('bar', 'foo.js');
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
      helper.createComponent('bar', 'foo.js');
      let errorMessage;
      try {
        helper.addComponentWithOptions('bar', {
          i: 'Bar/Foo'
        });
      } catch (err) {
        errorMessage = err.message;
      }

      expect(errorMessage).to.have.string(
        'invalid id part in "Bar/Foo", id part can have only alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "."]'
      );
    });
    it('Should add component with global namespace if used parcial ID', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions('bar', {
        i: 'foo'
      });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('global/foo');
    });
    it('Should add dir files with spec from multiple dsls when test files are placed in same structure', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test/bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,test/{FILE_NAME}.spec.js'
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
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/*.js', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,bar/foo.spec.js,test/{FILE_NAME}.spec.js'
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
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test/bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,test/*.spec.js'
      });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.deep.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.deep.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });

    // TODO: we need to implement the feature preventing the use of -t without wrapping in quotes.
    it.skip(
      'Should output message preventing user from adding files with spec from dsl and glob pattern without using quotes',
      () => {
        let errMsg = '';
        helper.createComponent('bar', 'foo.js');
        helper.createComponent('bar', 'foo2.js');
        helper.createComponent('test/bar', 'foo.spec.js');
        helper.createComponent('test/bar', 'foo2.spec.js');
        try {
          helper.runCmd('bit add bar/*.js -t test/bar/{FILE_NAME}.spec.js -n bar');
        } catch (err) {
          errMsg = err.message;
        }
        expect(errMsg).to.have.string('Please wrap tests with quotes');
      }
    );

    it('Should add dir files with spec from dsl and glob pattern and exclude', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test/bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,test/*.spec.js',
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
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      try {
        helper.runCmd('bit add bar/*.js -e bar/foo2.js');
      } catch (err) {
        errMsg = err.message;
      }
      expect(errMsg).to.have.string('Please wrap excluded files with quotes');
    });

    it('Should modify bitmap when adding component again when specifing id', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'index.js');
      helper.createComponent('bars', 'foo3.js');
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
      helper.createComponent('bar/foo', 'foo.js');
      helper.createComponent('bar/foo', 'index.js');
      helper.addComponentWithOptions('bar/foo', {});
      const bitMap1 = helper.readBitMap();
      const files1 = bitMap1['bar/foo'].files;
      expect(bitMap1).to.have.property('bar/foo');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(2);
      helper.createComponent('bar/foo', 'foo3.js');
      helper.addComponentWithOptions('bar/foo', {});
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(3);
    });
    it('Should add test files from dsls and exlude dsl specifics', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test/bar', 'a.example.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/*.js', {
        i: 'bar/foo',
        m: path.normalize('bar/foo.js'),
        t: 'test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,bar/foo.spec.js,test/{FILE_NAME}.spec.js',
        e: 'test/{PARENT_FOLDER}/*.example.*'
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
    it('bitMap should not contain component if all files are excluded', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.addComponentWithOptions(path.normalize('bar/foo1.js'), { e: 'bar/foo1.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).not.to.have.property('bar/foo1');
    });
    it('bitMap should not contain component if the main file is excluded', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions('bar', { i: 'bar/foo', e: 'bar/foo1.js', m: 'bar/foo1.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).not.to.have.property('bar/foo');
    });
    it('bitMap should only contain bits that have files', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/foo1.js bar/foo2.js', { e: 'bar/foo2.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).not.to.have.property('bar/foo2');
    });
    it('When adding folder bitMap should not contain excluded glob *.exclude.js', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*.js', { e: 'bar/*.exclude.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/foo2.exclude.js');
    });
    it('Bitmap should not contain all files in excluded list', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*.js', { e: 'bar/*.exclude.js,bar/foo2.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).not.to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/foo2.exclude.js');
    });
    it('When excluding dir ,bit component should not appear in bitmap', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar/x', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*', { e: 'bar/x/*' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/x');
    });
    it('bitMap should contain files that are not excluded ', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
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
      expect(files[0]).to.deep.equal(expectedArray[0]);
      expect(files[1]).to.deep.equal(expectedArray[1]);
    });
    it('bitMap should contain component even if all test files are excluded ', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/foo1.js', { t: 'bar/foo2.spec.js', e: 'bar/foo2.spec.js' });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo1'].files;
      expect(bitMap).to.have.property('bar/foo1');
      expect(files).to.be.ofSize(1);
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
      const expectedMainFile = normalize(path.join('bar', 'index.js'));
      expect(bitMap['bar/foo'].mainFile).to.equal(expectedMainFile);
    });
  });
  describe('adding files to an imported component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
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
          `Command failed: ${helper.bitBin} add ${barFoo2Path} -i bar/foo\nunable to add file bar/foo2.js because it\'s located outside the component root dir components/bar/foo\n`
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
});
