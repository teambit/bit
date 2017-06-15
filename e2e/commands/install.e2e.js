// covers also init, create, commit, import and export commands

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();

describe('bit install command', function () {
  this.timeout(0);
  after(() => {
    helper.destroyEnv();
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
