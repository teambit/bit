// `bit install` command is deprecated. Instead, we use `bit import` with no parameters

import path from 'path';
import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit install command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('with a component in bit.json', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      // export a new component "bar/foo"
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      // add "foo" as a bit.json dependency
      const bitJsonPath = path.join(helper.localScopePath, 'bit.json');
      helper.addBitJsonDependencies(bitJsonPath, { [`${helper.remoteScope}/bar/foo`]: '1' });
    });
    it('should display a successful message with the list of installed components', () => {
      const output = helper.runCmd('bit import');
      expect(output.includes('successfully imported one component')).to.be.true;
    });
  });
  describe('with a component in bit.map', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      const bitMap = helper.readBitMap();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.writeBitMap(bitMap);
    });
    it('should display a successful message with the list of installed components', () => {
      const output = helper.runCmd('bit import');
      expect(output.includes('successfully imported one component')).to.be.true;
    });
  });
  describe('with an AUTHORED component which was only committed but not exported', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      const bitMap = helper.readBitMap();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.writeBitMap(bitMap);
    });
    it('should not try to import that component as it was not exported yet', () => {
      try {
        helper.runCmd('bit import');
      } catch (err) {
        expect(err.toString()).to.have.string('nothing to import');
      }
    });
  });
});
