// covers also init, create, commit, import and export commands

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();

describe.only('bit install command', function () {
  this.timeout(0);
  after(() => {
    helper.destroyEnv();
  });
  describe('without anything to install', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
    });
    // TODO: The current behaviour doesn't seem to be correct. It shouldn't throw an error.
    xit('should display "there is nothing to import" message', () => {
      try {
        helper.runCmd('bit install');
      } catch (err) {
        expect(err.output.toString().includes('there is nothing to import')).to.be.true;
      }
    });
  });
  describe('with a component to install', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      // export a new component "foo"
      helper.runCmd('bit create foo');
      helper.runCmd('bit commit foo commit-msg');
      helper.runCmd('bit init --bare', helper.remoteScopePath);
      helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
      helper.runCmd(`bit export @this/global/foo @${helper.remoteScope}`);
      fs.emptyDirSync(helper.localScopePath); // a new local scope
      helper.runCmd('bit init');
      helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
      // add "foo" as a bit.json dependency
      const bitJsonPath = path.join(helper.localScopePath, 'bit.json');
      helper.addBitJsonDependencies(bitJsonPath, { [`@${helper.remoteScope}/global/foo`]: '1' });
    });
    it('should display a successful message with the list of installed components', () => {
      const output = helper.runCmd('bit install');
      expect(output.includes('successfully imported the following Bit components')).to.be.true;
      expect(output.includes('global/foo')).to.be.true;
    });
  });
});
