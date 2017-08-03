// covers also init, create, commit, import and export commands

import path from 'path';
import fs from 'fs-extra';
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
      helper.reInitLocalScope();
      // export a new component "bar/foo"
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportComponent('bar/foo');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      // add "foo" as a bit.json dependency
      const bitJsonPath = path.join(helper.localScopePath, 'bit.json');
      helper.addBitJsonDependencies(bitJsonPath, { [`${helper.remoteScope}/bar/foo`]: '1' });
    });
    it('should display a successful message with the list of installed components', () => {
      const output = helper.runCmd('bit install');
      expect(output.includes('successfully imported the following Bit components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
  });
  describe('with a component in bit.map', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportComponent('bar/foo');
      const bitMap = helper.readBitMap();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.writeBitMap(bitMap);
    });
    it('should display a successful message with the list of installed components', () => {
      const output = helper.runCmd('bit install');
      expect(output.includes('successfully imported the following Bit components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
  });
});
