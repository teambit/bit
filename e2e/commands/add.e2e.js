// covers also init, create, commit, import and export commands

import chai, { expect } from 'chai';
import normalize from 'normalize-path';
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
      const expectTestFile = { relativePath: 'bar/foo.spec.js', test: true, name: 'foo.spec.js' };
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
    it('Should override component with override flag', () => {
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('bar', 'boo1.js');
      helper.addComponentWithOptions('bar/foo.js', { 'i': 'bar/foo ' });
      const bitMap = helper.readBitMap();
      const files = bitMap['bar/foo'].files;
      expect(bitMap).to.have.property('bar/foo');
      expect(files).to.be.ofSize(1);
      expect(files).to.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      helper.addComponentWithOptions('bar/boo1.js', { 'i': 'bar/foo' , 'o': true });
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.ofSize(1);
      expect(files2).to.include({ relativePath: 'bar/boo1.js', test: false, name: 'boo1.js' });
    });

    it('Should throw error when no index file is found', () => {
      const file1= 'foo1.js'
      const file2= 'foo2.js'
      const file1Path = path.normalize(`bar/${file1}`);
      const file2Path = path.normalize(`bar/${file2}`);
      helper.createComponent('bar', file1);
      helper.createComponent('bar', file2);

      const addCmd = () => helper.addComponentWithOptions('bar', { 'n': 'test' });
      expect(addCmd).to.throw(`Command failed: ${helper.bitBin} add bar -n test\nfatal: the main file index.js or index.ts was not found in the files list ${file1Path}, ${file2Path}\n`);
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
      expect(mainFile).to.equal('bar/bar.js');
    });
    it('Should add component with spec file from another dir according to dsl', () => {
      const dslOs = path.normalize('test/{FILE_NAME}.spec.js');
      helper.createComponent('bar', 'foo.js');
      helper.createComponent('test', 'foo.spec.js');
      helper.addComponentWithOptions('bar/foo.js', {'t': dslOs });
      const bitMap = helper.readBitMap();
      const files = bitMap["bar/foo"].files;
      expect(files).to.be.ofSize(2);
      expect(files).to.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
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
      expect(files).to.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(files).to.include({ relativePath: 'test2/foo1.spec.js', test: true, name: 'foo1.spec.js' });
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
      expect(files).to.include({ relativePath: 'bar/foo.js', test: false, name: 'foo.js' });
      expect(files).to.include({ relativePath: 'test/foo.spec.js', test: true, name: 'foo.spec.js' });
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
      expect(files).to.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
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
      expect(files).to.include({ relativePath: 'test/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
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
      expect(files).to.include({ relativePath: 'test/bar/foo2.spec.js', test: true, name: 'foo2.spec.js' });
      expect(files).to.include({ relativePath: 'test/bar/foo.spec.js', test: true, name: 'foo.spec.js' });
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should modify bitmap when adding component again when specifing id', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'index.js');
      helper.createComponent('bars', 'foo3.js');
      helper.addComponentWithOptions(`bar/`, { 'i': 'bar/foo' });
      const bitMap1 = helper.readBitMap();
      const files1 = bitMap1['bar/foo'].files;
      expect(bitMap1).to.have.property('bar/foo');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(2);
      helper.addComponentWithOptions('bars/', { 'i': 'bar/foo' });
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(3);
    });
    it('Should modify bitmap when adding component again without id', () => {
      helper.createComponent('bar/foo', 'foo.js');
      helper.createComponent('bar/foo', 'index.js');
      helper.addComponentWithOptions(`bar/foo`, { });
      const bitMap1 = helper.readBitMap();
      const files1 = bitMap1['bar/foo'].files;
      expect(bitMap1).to.have.property('bar/foo');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(2);
      helper.createComponent('bar/foo', 'foo3.js');
      helper.addComponentWithOptions('bar/foo', { });
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['bar/foo'].files;
      expect(bitMap2).to.have.property('bar/foo');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(3);
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
      const expectedArray = [{ relativePath: 'bar/foo1.js', test: false, name: 'foo1.js' },
        { relativePath: 'bar/foo3.js', test: false, name: 'foo3.js' }]
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
        expect(output).to.have.string('Error: unable to add file');
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
        expect(bitMap[`${helper.remoteScope}/bar/foo@1`].files).to.be.ofSize(2);
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
});
