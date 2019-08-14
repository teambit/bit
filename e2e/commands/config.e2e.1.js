import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit config', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('set, get, delete configs', () => {
    let setOutput;
    let getOutput;
    let delOutput;

    before(() => {
      helper.reInitLocalScope();
      setOutput = helper.runCmd('bit config set conf.key conf.value');
      getOutput = helper.runCmd('bit config get conf.key');
      delOutput = helper.runCmd('bit config del conf.key');
    });

    it('should set the config correctly', () => {
      expect(setOutput).to.be.equal('added configuration successfully\n');
    });

    it('should get the config correctly', () => {
      expect(getOutput).to.be.equal('conf.value\n');
    });

    it('should delete the config correctly', () => {
      const confVal = helper.runCmd('bit config get conf.key');
      expect(delOutput).to.be.equal('deleted successfully\n');
      expect(confVal).to.be.equal('undefined\n');
    });
  });

  describe('git propogation', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.initNewGitRepo();
      helper.runCmd('bit config set conf.key bit-value');
      // Commented because of permission issue
      // helper.addGitConfig('conf.key', 'git-system-val', 'system');
      helper.addGitConfig('conf.key', 'git-global-val', 'global');
      helper.addGitConfig('conf.key', 'git-local-val', 'local');
    });
    it('should read config from bit if exists', () => {
      const confVal = helper.runCmd('bit config get conf.key');
      expect(confVal).to.be.equal('bit-value\n');
    });
    it('should read config from git-local if not exists in bit', () => {
      helper.runCmd('bit config del conf.key');
      const confVal = helper.runCmd('bit config get conf.key');
      expect(confVal).to.be.equal('git-local-val\n');
    });
    it('should read config from git-global if not exists in bit and git-local', () => {
      helper.unsetGitConfig('conf.key', 'local');
      const confVal = helper.runCmd('bit config get conf.key');
      // Clean the global env
      helper.unsetGitConfig('conf.key', 'global');
      expect(confVal).to.be.equal('git-global-val\n');
    });
    // Commented because of permission issue
    // it('should read config from git-system if not exists in bit', () => {
    //   helper.unsetGitConfig('conf.key', 'global');
    //   helper.runCmd('bit config del conf.key');
    //   const confVal = helper.runCmd('bit config get conf.key');
    //   expect(confVal).to.be.equal('git-system-val\n');
    // });
    it('should return undefined if not exists both in git and bit', () => {
      const confVal = helper.runCmd('bit config get nonExistsKey');
      expect(confVal).to.be.equal('undefined\n');
    });
  });
});
