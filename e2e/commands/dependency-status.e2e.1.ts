import { expect } from 'chai';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit dependency status', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('all files mapped', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureComponents('dependency-status');
      helper.command.addComponent('dependency-status-test-files/a.js', { i: 'dependency-status-test-files/a' });
      helper.command.addComponent('dependency-status-test-files/b.js', { i: 'dependency-status-test-files/b' });
      helper.command.addComponent('dependency-status-test-files/c.js', { i: 'dependency-status-test-files/c' });
    });
    it('Should print no missing files as all files are mapped', () => {
      const output = helper.command.runCmd('bit dependency-status dependency-status-test-files/b.js');
      expect(output).to.have.string('All files in dependency tree are marked as components');
    });
  });
  describe('not all files mapped', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureComponents('dependency-status');
      helper.command.addComponent('dependency-status-test-files/a.js', { i: 'dependency-status-test-files/a' });
      helper.command.addComponent('dependency-status-test-files/b.js', { i: 'dependency-status-test-files/b' });
    });
    it('Should print missing files which are not mapped to bit components', () => {
      const output = helper.command.runCmd('bit dependency-status dependency-status-test-files/b.js');
      expect(output).to.have.string('The following file exist in dependency tree but are not a component');
      expect(output).to.have.string('c.js');
    });
  });
  describe('large code base', () => {
    // we use our bit-bin code as an example of large code base
    it('should not hang indefinitely', () => {
      const bitBinRoot = path.resolve(path.join(__dirname, '../..'));
      const output = helper.command.runCmd('bit dependency-status src/app.ts', bitBinRoot);
      expect(output).to.have.string('The following file exist in dependency tree but are not a component');
    });
  });
});
