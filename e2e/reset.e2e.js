/* eslint-disable */
import { expect } from 'chai';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import childProcess from 'child_process';

const verbose = false;
const workspace = path.join(os.tmpdir(), 'bit', 'e2e');

const runCmd = (cmd) => {
  if (verbose) console.log('running: ', cmd);
  const cmdOutput = childProcess.execSync(cmd, { cwd: workspace });
  if (verbose) console.log(cmdOutput.toString());
};

describe('reset', function () {
  this.timeout(0);
  describe('component with multiple commits', () => {
    before(() => {
      fs.emptyDirSync(workspace);
      runCmd('bit init');
      runCmd('bit create foo');
      runCmd('bit commit foo commit-msg1');
      runCmd('bit modify @this/global/foo');
      runCmd('bit commit foo commit-msg2');
      runCmd('bit reset @this/global/foo');
    });
    it('should delete the last version from the components directory', () => {
      const lastVersion = path.join(workspace, 'components', 'global', 'foo', 'e2e', '2');
      expect(fs.existsSync(lastVersion)).to.be.false;
    });
    it('should leave the first version from the components directory intact', () => {
      const lastVersion = path.join(workspace, 'components', 'global', 'foo', 'e2e', '1');
      expect(fs.existsSync(lastVersion)).to.be.true;
    });
    it('should place the first version in the inline_components directory', () => {
      const inlineComponentPath = path.join(workspace, 'inline_components', 'global', 'foo');
      expect(fs.existsSync(inlineComponentPath)).to.be.true;
    });
  });

  describe('component with one commit', () => {
    before(() => {
      fs.emptyDirSync(workspace);
      runCmd('bit init');
      runCmd('bit create foo');
      runCmd('bit commit foo commit-msg1');
      runCmd('bit reset @this/global/foo');
    });
    it('should delete the entire component from the components directory', () => {
      const lastVersion = path.join(workspace, 'components', 'global', 'foo', 'e2e');
      expect(fs.existsSync(lastVersion)).to.be.false;
    });
    it('should place the first version in the inline_components directory', () => {
      const inlineComponentPath = path.join(workspace, 'inline_components', 'global', 'foo');
      expect(fs.existsSync(inlineComponentPath)).to.be.true;
    });
  });
});
