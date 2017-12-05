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
    // this is the only test in 'untrack.e2e.js' that uses readBitMap() to test the creation of the 'version' property.
    // the rest use readBitMapWithoutVersion() which removes it from the .bit.mpa.json file.
    it('Should remove new component that was added from bitmap', () => {
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions(path.normalize('bar/foo2.js'), { i: 'bar/foo' });
      helper.untrackComponent('bar/foo');
      const bitMap = helper.readBitMap();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('version');
    });
    it('Should return an error message if you try to untrack a non-existing component', () => {
      const output = helper.untrackComponent('bar/foo');
      expect(output).to.have.string('fatal: component bar/foo did not match any component.');
    });
    it('Should remove specific component and keep all other new components', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.createComponent('bar', 'foo2.js');
      helper.addComponentWithOptions(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.untrackComponent('bar/foo');
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2');
    });
    it('Should be unsuccessful in untracking commited component and return a message to the user', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.commitComponent('bar/foo');
      const output = helper.untrackComponent('bar/foo');
      const bitMap = helper.readBitMapWithoutVersion();
      expect(output).to.have.string('error: unable to untrack bar/foo, please use the bit remove command.');
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo');
    });
    it('Should resolve and untrack component and add global as prefix component ', () => {
      helper.createComponent('bar', 'foo.js');
      helper.addComponentWithOptions(path.normalize('bar/foo.js'), { i: 'bar' });
      helper.untrackComponent('bar');
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(0);
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
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2');
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
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2');
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
