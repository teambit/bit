// covers also init, create, commit, modify commands

import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit config', function () {
  this.timeout(0);
  const helper = new Helper();

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
});
