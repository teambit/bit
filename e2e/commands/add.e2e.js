// covers also init, create, commit, import and export commands

import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit add command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('add one component', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should add component to bitmap with folder as default namespace', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.addComponent('bar/foo2.js');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo2');
    });
    it('Should trim testFiles spaces', () => {
      const osComponentName = path.normalize('bar/foo.js');
      const osFilePathName = path.normalize('bar/foo.spec.js');
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo.spec.js');
      helper.addComponentWithOptions(osComponentName, { 't': `${osFilePathName}       ` });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      const expectTestFile = { relativePath: osFilePathName, test: true, name: 'foo.spec.js' };
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.array();
      expect(files).to.be.ofSize(2);
      expect(files).to.include(expectTestFile);
    });
    it('Add component from subdir  ../someFile ', () => {
      const barPath  = path.join(helper.localScopePath, 'bar/x');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar/x', 'foo1.js');
      helper.addComponent('../foo2.js', barPath);
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo2');
    });
    it('Should add component with namespace flag to bitmap with correct name', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/foo2.js', { 'n': 'test' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('test/foo2');
    });

    it('Should throw error when no index file is found', () => {
      const file1= 'foo1.js'
      const file2= 'foo2.js'
      const file1Path = path.normalize(`bar/${file1}`);
      const file2Path = path.normalize(`bar/${file2}`);
      helper.createComponent('bar', file1);
      helper.createComponent('bar', file2);

      const addCmd = () => helper.addComponentWithOptions('bar', { 'n': 'test' });
      expect(addCmd).to.throw(`fatal: the main file index.js was not found in the files list ${file1Path}, ${file2Path}`);
    });

    it('Should throw error msg if -i and -n flag are used with bit add', () => {
      helper.createComponent('bar', 'foo2.js');
      const addCmd = () => helper.addComponentWithOptions('bar/foo2.js', { 'n': 'test', 'i': 'jaja' });
      expect(addCmd).to.throw(`You can use either [id] or [namespace] to add a particular component`);
    });
    it('Should throw error msg if trying to add non existing file', () => {
      const addCmd = () => helper.addComponent('non-existing-file.js');
      expect(addCmd).to.throw(`fatal: the file "non-existing-file.js" was not found`);
    });
    it('Should modify bitmap when adding component again', () => {
      const file1 = path.normalize('bar/foo2.js');
      const file2 = path.normalize('bar/foo1.js');
      const file3 = path.normalize('bar/foo3.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo3.js');
      helper.addComponentWithOptions(`${file2} ${file1}`, { });
      const bitMap1 = helper.readBitMap();
      const files1 = bitMap1['bar/foo1'].files;
      expect(bitMap1).to.have.property('bar/foo1');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(1);
      helper.addComponentWithOptions(`${file1} ${file3}`, {'m': file1, 'i': 'bar/foo2' });
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo2'].files;
      expect(bitMap2).to.have.property('bar/foo2');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(2);
    });
    it.skip('Bitmap should contain multiple files for component with more than one file', ()=>{});
    it.skip('Bitmap should contain impl files and test files  in diffrent fields', ()=>{});
    it('Bitmap origin should be AUTHORED', ()=>{
      helper.createComponent('bar', 'foo1.js');
      helper.addComponent('bar/foo1.js');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap['bar/foo1'].origin).to.equal('AUTHORED');
    });
    it.skip('Bitmap mainFile should point to correct mainFile', ()=>{});
    it.skip('should not allow adding a component with an existing box-name and component-name', () => {});
  });
  describe('add multiple components', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should add all components with correct namespace', () => {
      const basePath = path.normalize('bar/*');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo1.js');
      helper.addComponentWithOptions(basePath, { 'n': 'test' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('test/foo1');
      expect(bitMap).to.have.property('test/foo2');

    });
    it('Define dynamic main file ', () => {
      const mainFileOs = path.normalize('{PARENT_FOLDER}/{PARENT_FOLDER}.js');
      const expectedRes = path.normalize('bar/bar.js');
      helper.createComponent('bar', 'bar.js');
      helper.createComponent('bar', 'foo1.js');
      helper.addComponentWithOptions('bar', { 'm': mainFileOs, 'n': 'test' });
      const bitMap = helper.readBitMap();
      const mainFile = bitMap['test/bar'].mainFile;
      expect(bitMap).to.have.property('test/bar');
      expect(mainFile).to.equal(expectedRes);
    });
    it('Should add component with spec file from another dir according to dsl', () => {
      const dslOs = path.normalize('test/{FILE_NAME}.spec.js');
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.addComponentWithOptions('bar/foo.js', {'t': dslOs });
      const bitMap = helper.readBitMap();
      const files = bitMap["bar/foo"].files;
      expect(files).to.be.ofSize(2);
      expect(files).to.include({ relativePath: path.normalize('bar/foo.js'), test: false, name: 'foo.js' });
      expect(files).to.include({ relativePath: path.normalize('test/foo.spec.js'), test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Glob and dsl Should add component to bitmap ', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.createComponent('test2', 'foo1.spec.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), {'t': path.normalize("test/{FILE_NAME}.spec.js,test2/*.spec.js")});
      const bitMap = helper.readBitMap();
      const files = bitMap["bar/foo"].files;
      expect(files).to.be.ofSize(3);
      expect(files).to.include({ relativePath: path.normalize('bar/foo.js'), test: false, name: 'foo.js' });
      expect(files).to.include({ relativePath: path.normalize('test/foo.spec.js'), test: true, name: 'foo.spec.js' });
      expect(files).to.include({ relativePath: path.normalize('test2/foo1.spec.js'), test: true, name: 'foo1.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });

    it('Should add dir files with spec from dsl when test files are flattened', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar', { 'i': 'bar/foo' ,'m': path.normalize('bar/foo.js'),  't': path.normalize(`test/{FILE_NAME}.spec.js`) });
      const bitMap = helper.readBitMap();
      const files = bitMap["bar/foo"].files;
      expect(files).to.be.ofSize(5);
      expect(files).to.include({ relativePath: path.normalize('bar/foo.js'), test: false, name: 'foo.js' });
      expect(files).to.include({ relativePath: path.normalize('test/foo.spec.js'), test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should add dir files with spec from multiple dsls when test files are placed in same structure', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test/bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', { 'i': 'bar/foo' ,'m': path.normalize('bar/foo.js'),  't': `test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,test/{FILE_NAME}.spec.js` });
      const bitMap = helper.readBitMap();
      const files = bitMap["bar/foo"].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.include({ relativePath: path.normalize('test/bar/foo2.spec.js'), test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: path.normalize('test/foo2.spec.js'), test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: path.normalize('test/bar/foo.spec.js'), test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should add dir files with spec from dsl and glob pattern', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test/bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', { 'i': 'bar/foo' ,'m': path.normalize('bar/foo.js'),  't': `test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,test/*.spec.js` });
      const bitMap = helper.readBitMap();
      const files = bitMap["bar/foo"].files;
      expect(files).to.be.ofSize(6);
      expect(files).to.include({ relativePath: path.normalize('test/bar/foo2.spec.js'), test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: path.normalize('test/foo2.spec.js'), test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: path.normalize('test/bar/foo.spec.js'), test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });

    it('Should add dir files with spec from dsl and glob pattern and exclude', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.createComponent('test/bar', 'foo.spec.js');
      helper.createComponent('test/bar', 'foo2.spec.js');
      helper.createComponent('test', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/', { 'i': 'bar/foo' ,'m': path.normalize('bar/foo.js'),  't': `test/{PARENT_FOLDER}/{FILE_NAME}.spec.js,test/*.spec.js`,'e': 'test/*.spec.js' });
      const bitMap = helper.readBitMap();
      const files = bitMap["bar/foo"].files;
      expect(files).to.be.ofSize(5);
      expect(files).to.include({ relativePath: path.normalize('test/bar/foo2.spec.js'), test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: path.normalize('test/bar/foo.spec.js'), test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
  });
  describe('add component with exclude', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('bitMap should not contain component if all files are excluded', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.addComponentWithOptions('bar/foo1.js', { 'e': 'bar/foo1.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).not.to.have.property('bar/foo1');
    });
    it('bitMap should only contain bits that have files', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions('bar/foo1.js bar/foo2.js', { 'e': 'bar/foo2.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).not.to.have.property('bar/foo2');
    });
    it('When adding folder bitMap should not contain excluded glob *.exclude.js', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*.js', { 'e': 'bar/*.exclude.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/foo2.exclude.js');
    });
    it('Bitmap should not contain all files in excluded list', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*.js', { 'e': 'bar/*.exclude.js,bar/foo2.js' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).not.to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/foo2.exclude.js');
    });
    it('When excluding dir ,bit component should not appear in bitmap', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar/x', 'foo2.exclude.js');
      helper.addComponentWithOptions('bar/*', { 'e': 'bar/x/*' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).not.to.have.property('bar/x');
    });
    it('bitMap should contain files that are not excluded ', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo3.js');
      helper.addComponentWithOptions(`${path.normalize('bar/foo1.js')} ${path.normalize('bar/foo2.js')} ${path.normalize('bar/foo3.js')}  -i bar/foo -m ${path.normalize('bar/foo1.js')}`, { 'e': 'bar/foo2.js' });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      const expectedArray = [{ relativePath: path.normalize('bar/foo1.js'), test: false, name: 'foo1.js' },
        { relativePath: path.normalize('bar/foo3.js'), test: false, name: 'foo3.js' }]
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.array();
      expect(files).to.be.ofSize(2);
      expect(files[0]).to.deep.equal(expectedArray[0]);
      expect(files[1]).to.deep.equal(expectedArray[1]);
    });
    it.skip('bitMap should contain tests that are not excluded', () => {});
    it('bitMap should contain component even if all test files are excluded ', () => {
      helper.createComponent('bar', 'foo1.js');
      helper.createComponent('bar', 'foo2.spec.js');
      helper.addComponentWithOptions('bar/foo1.js', { 't': 'bar/foo2.spec.js', 'e': 'bar/foo2.spec.js' });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo1'].files;
      expect(bitMap).to.have.property('bar/foo1');
      expect(files).to.be.ofSize(1);
    });

  });
});
