import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('objects in scope are corrupted', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('objects are empty, which are invalid zlib', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const comp = helper.command.catComponent('comp1@latest');
      const fileHash = comp.files[0].file;
      const objectPath = helper.general.getHashPathOfObject(fileHash, true);
      helper.fs.outputFile(objectPath, '');
    });
    it('bit status should throw an error with a suggestion how to fix', () => {
      expect(() => helper.command.status()).to.throw('bit import --all-history');
    });
    it('bit import --all-history should fix it', () => {
      helper.command.import('--all-history');
      expect(() => helper.command.status()).to.not.throw();
    });
  });
});
