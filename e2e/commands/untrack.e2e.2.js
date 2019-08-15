// covers also init, create, tag, import and export commands

import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit untrack command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then run untrack ', () => {
      helper.createBitMap();
      helper.createFile('bar', 'foo.js');
      const output = helper.untrackComponent('bar/foo');
      expect(output).to.include('bar/foo');
    });
  });
  describe('untrack components by id', () => {
    beforeEach(() => {
      helper.reInitLocalScope();
    });
    // this is the only test in 'untrack.e2e.js' that uses readBitMap() to test the creation of the 'version' property.
    // the rest use readBitMapWithoutVersion() which removes it from the .bit.mpa.json file.
    it('Should remove new component that was added from bitmap', () => {
      helper.createFile('bar', 'foo2.js');
      helper.addComponent('bar/foo2.js', { i: 'bar/foo' });
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
      helper.createFile('bar', 'foo.js');
      helper.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.createFile('bar', 'foo2.js');
      helper.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.untrackComponent('bar/foo');
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2');
    });
    it('Should be unsuccessful in untracking tagged component and return a message to the user', () => {
      helper.createFile('bar', 'foo.js');
      helper.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.tagComponent('bar/foo');
      const output = helper.untrackComponent('bar/foo');
      const bitMap = helper.readBitMapWithoutVersion();
      expect(output).to.have.string('error: unable to untrack bar/foo, please use the bit remove command.');
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo@0.0.1');
    });
    it('Should resolve and untrack component and add global as prefix component ', () => {
      helper.createFile('bar', 'foo.js');
      helper.addComponent(path.normalize('bar/foo.js'), { i: 'bar' });
      helper.untrackComponent('bar');
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(0);
    });
    it('Should remove 2 new components and keep tagged component', () => {
      helper.createFile('bar', 'foo.js');
      helper.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.createFile('bar', 'foo2.js');
      helper.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.tagComponent('bar/foo2');
      helper.createFile('bar', 'foo3.js');
      helper.addComponent(path.normalize('bar/foo3.js'), { i: 'bar/foo3' });
      helper.untrackComponent('bar/foo bar/foo3');
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2@0.0.1');
    });
    it('Should remove all new components and keep tagged component', () => {
      helper.createFile('bar', 'foo.js');
      helper.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.createFile('bar', 'foo2.js');
      helper.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.tagComponent('bar/foo2');
      helper.createFile('bar', 'foo3.js');
      helper.addComponent(path.normalize('bar/foo3.js'), { i: 'bar/foo3' });
      helper.untrackComponent('', true);
      const bitMap = helper.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2@0.0.1');
    });
    it('Should not show component if bit.json is corrupted', () => {
      let output;
      helper.corruptBitJson();
      try {
        helper.untrackComponent();
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
});
