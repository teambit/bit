import { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

describe('bit dependency status', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('all files mapped', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.reInitLocalScope();
      helper.copyFixtureComponents('dependency-status');
      helper.addComponent('dependency-status-test-files/a.js', { i: 'dependency-status-test-files/a' });
      helper.addComponent('dependency-status-test-files/b.js', { i: 'dependency-status-test-files/b' });
      helper.addComponent('dependency-status-test-files/c.js', { i: 'dependency-status-test-files/c' });
    });
    it('Should print no missing files as all files are mapped', () => {
      const output = helper.runCmd('bit dependency-status dependency-status-test-files/b.js');
      expect(output).to.have.string('All files in dependency tree are marked as components');
    });
  });
  describe('not all files mapped', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.reInitLocalScope();
      helper.copyFixtureComponents('dependency-status');
      helper.addComponent('dependency-status-test-files/a.js', { i: 'dependency-status-test-files/a' });
      helper.addComponent('dependency-status-test-files/b.js', { i: 'dependency-status-test-files/b' });
    });
    it('Should print missing files which are not mapped to bit components', () => {
      const output = helper.runCmd('bit dependency-status dependency-status-test-files/b.js');
      expect(output).to.have.string('The following file exist in dependency tree but are not a component');
      expect(output).to.have.string('c.js');
    });
  });
  describe('large code base', () => {
    // we use our bit-bin code as an example of large code base
    it('should not hang indefinitely', () => {
      const bitBinRoot = path.resolve(path.join(__dirname, '../..'));
      const output = helper.runCmd('bit dependency-status src/app.js', bitBinRoot);
      expect(output).to.have.string('The following file exist in dependency tree but are not a component');
    });
  });
});
