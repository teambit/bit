// covers also init, create, tag, import and export commands

import chai, { expect } from 'chai';
import * as path from 'path';
import { SCHEMA_FIELD } from '../../src/consumer/bit-map/bit-map';

import Helper from '../../src/e2e-helper/e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('bit untrack command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('before running "bit init" with .bit.map.json', () => {
    it('Should init consumer add then run untrack ', () => {
      helper.bitMap.create();
      helper.fs.createFile('bar', 'foo.js');
      const output = helper.command.untrackComponent('bar/foo');
      expect(output).to.include('bar/foo');
    });
  });
  describe('untrack components by id', () => {
    beforeEach(() => {
      helper.scopeHelper.reInitLocalScope();
    });
    // this is the only test in 'untrack.e2e.js' that uses readBitMap() to test the creation of the 'version' property.
    // the rest use readBitMapWithoutVersion() which removes it from the .bitmap.json file.
    it('Should remove new component that was added from bitmap', () => {
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent('bar/foo2.js', { i: 'bar/foo' });
      helper.command.untrackComponent('bar/foo');
      const bitMap = helper.bitMap.read();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property(SCHEMA_FIELD);
    });
    it('Should return an error message if you try to untrack a non-existing component', () => {
      const output = helper.command.untrackComponent('bar/foo');
      expect(output).to.have.string('fatal: component bar/foo did not match any component.');
    });
    it('Should remove specific component and keep all other new components', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.command.untrackComponent('bar/foo');
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2');
    });
    it('Should be unsuccessful in untracking tagged component and return a message to the user', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.command.tagComponent('bar/foo');
      const output = helper.command.untrackComponent('bar/foo');
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(output).to.have.string('error: unable to untrack bar/foo, please use the bit remove command.');
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo@0.0.1');
    });
    it('Should resolve and untrack component and add global as prefix component ', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), { i: 'bar' });
      helper.command.untrackComponent('bar');
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(Object.keys(bitMap)).to.be.ofSize(0);
    });
    it('Should remove 2 new components and keep tagged component', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.command.tagComponent('bar/foo2');
      helper.fs.createFile('bar', 'foo3.js');
      helper.command.addComponent(path.normalize('bar/foo3.js'), { i: 'bar/foo3' });
      helper.command.untrackComponent('bar/foo bar/foo3');
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2@0.0.1');
    });
    it('Should remove all new components and keep tagged component', () => {
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent(path.normalize('bar/foo.js'), { i: 'bar/foo' });
      helper.fs.createFile('bar', 'foo2.js');
      helper.command.addComponent(path.normalize('bar/foo2.js'), { i: 'bar/foo2' });
      helper.command.tagComponent('bar/foo2');
      helper.fs.createFile('bar', 'foo3.js');
      helper.command.addComponent(path.normalize('bar/foo3.js'), { i: 'bar/foo3' });
      helper.command.untrackComponent('', true);
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(Object.keys(bitMap)).to.be.ofSize(1);
      expect(bitMap).to.have.property('bar/foo2@0.0.1');
    });
    it('Should not show component if bit.json is corrupted', () => {
      let output;
      helper.bitJson.corrupt();
      try {
        helper.command.untrackComponent();
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.scopes.localPath, 'bit.json')}`);
    });
  });
});
