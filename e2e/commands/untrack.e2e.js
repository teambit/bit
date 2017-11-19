// covers also init, create, commit, import and export commands

import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit untrack command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('untrack components by id', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    it('Should remove new component that was added from bitmap', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions(path.normalize('bar/foo2.js'), { i: 'bar/foo' });
      helper.untrackComponent('bar/foo');
      const bitMap = helper.readBitMap();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('version');
    });
    it('Should remove specific component and keep commited ', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.untrackComponent('bar/foo');
      const bitMap = helper.readBitMap();
      expect(Object.keys(bitMap)).to.be.ofSize(2);
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).to.have.property('version');
    });
    it('Should resolve and untrack  component and add global as prefix component ', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar' });
      helper.untrackComponent('bar');
      const bitMap = helper.readBitMap();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('version');
    });

    it('Should remove 2 new components and keep commited component', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.commitComponent('bar/foo2');
      helper.createComponent('bar', 'foo3.js');
      helper.addComponentWithOptions(path.normalize('bar/foo3.js'), { i: 'bar/foo3' });
      helper.untrackComponent('bar/foo bar/foo3');
      const bitMap = helper.readBitMap();
      expect(Object.keys(bitMap)).to.be.ofSize(2);
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).to.have.property('version');
    });
    it('Should remove all new components and keep commited component', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.commitComponent('bar/foo2');
      helper.createComponent('bar', 'foo3.js');
      helper.addComponentWithOptions(path.normalize('bar/foo3.js'), { i: 'bar/foo3' });
      helper.untrackComponent();
      const bitMap = helper.readBitMap();
      expect(Object.keys(bitMap)).to.be.ofSize(2);
      expect(bitMap).to.have.property('bar/foo2');
      expect(bitMap).to.have.property('version');
    });
    it('Should not show component if bit.json is corrupted', () => {
      helper.corruptBitJson();
      const untrackCmd = () => helper.untrackComponent();
      expect(untrackCmd).to.throw(
        'error: invalid bit.json: SyntaxError: Unexpected token o in JSON at position 1 is not a valid JSON file.'
      );
    });
  });
});
