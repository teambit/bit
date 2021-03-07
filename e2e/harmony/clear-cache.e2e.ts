import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { glob } from 'glob';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit clear-cache', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('fs cache corrupted', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.status(); // to populate the cache.

      const cachePath = path.join(helper.scopes.localPath, '.bit/cache/components/file-paths/content-v2/sha512');
      const files = glob.sync('**/*', { cwd: cachePath, nodir: true });
      if (!files.length) throw new Error('no cache files found');
      const cacheFile = path.join(cachePath, files[0]);
      fs.chmodSync(cacheFile, '755');
      fs.appendFileSync(cacheFile, '  ');

      // as an intermediate step, make sure the cache is corrupted
      expect(() => helper.command.status()).to.throw('Integrity verification failed');
    });
    it('bit cc should be able to clear the cache and fix the issue', () => {
      helper.command.clearCache();
      expect(() => helper.command.status()).not.to.throw();
    });
  });
});
