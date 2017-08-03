// covers also init, create, commit, import and export commands

import chai,{ expect } from 'chai';
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
      helper.createComponent('bar', file1);
      helper.createComponent('bar', file2);
      const addCmd = () => helper.addComponentWithOptions('bar', { 'n': 'test' });
      expect(addCmd).to.throw(`fatal: the main file index.js was not found in the files list bar/${file1}, bar/${file2}`);
    });

    it('Should throw error msg if -i and -n flag are used with bit add', () => {
      helper.createComponent('bar', 'foo2.js');
      const addCmd = () => helper.addComponentWithOptions('bar/foo2.js', { 'n': 'test', 'i': 'jaja' });
      expect(addCmd).to.throw(`You can use either [id] or [namespace] to add a particular component`);
    });
    it('Should modify bitmap when adding component again', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo1.js');
      helper.addComponentWithOptions('bar/foo2.js', { 'i': 'test' });
      const bitMap1 = helper.readBitMap();
      const files1 = bitMap1['global/test'].files;
      expect(bitMap1).to.have.property('global/test');
      expect(files1).to.be.array();
      expect(files1).to.be.ofSize(1);
      helper.addComponentWithOptions('bar/foo2.js bar/foo1.js', { 'i': 'test', 'm': 'bar/foo1.js' });
      const bitMap2 = helper.readBitMap();
      const files2 = bitMap2['global/test'].files;
      expect(bitMap2).to.have.property('global/test');
      expect(files2).to.be.array();
      expect(files2).to.be.ofSize(2);
    });
    it.skip('Bitmap should contain multipule files for component with more than one file', ()=>{});
    it.skip('Bitmap should contain impl files and test files  in diffrent fields', ()=>{});
    it('Bitmap origin should be AUTHORED', ()=>{
      helper.createComponent('bar', 'foo1.js');
      helper.addComponent('bar/foo1.js');
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('bar/foo1');
      expect(bitMap['bar/foo1'].origin).to.equal('AUTHORED')
    });
    it.skip('Bitmap mainFile should point to correct mainFile', ()=>{});
  });
  describe('add multipule components', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should add all components with correct namespace', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.createComponent('bar', 'foo1.js');
      helper.addComponentWithOptions('bar/*', { 'n': 'test' });
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property('test/foo1');
      expect(bitMap).to.have.property('test/foo2');
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
    it('Bitmap should not conatin all files in excluded list', () => {
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
      helper.addComponentWithOptions('bar/foo1.js bar/foo2.js bar/foo3.js -i bar/foo -m bar/foo1.js', { 'e': 'bar/foo2.js' });
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
    it.skip('bitMap should contain tests that are not excluded ', () => {});
    it.skip('bitMap should contain component even if all test files are excluded ', () => {});

  });
});
