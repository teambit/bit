import { expect } from 'chai';
import sinon from 'sinon';
import cacache from 'cacache';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { FsCache } from './fs-cache';

function fsError(code: string) {
  return Object.assign(new Error(`${code}: operation not permitted, scandir`), { code });
}

describe('FsCache', function () {
  this.timeout(10000);
  let scopePath: string;
  let fsCache: FsCache;
  beforeEach(async () => {
    scopePath = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-cache-spec-'));
    fsCache = new FsCache(scopePath);
  });
  afterEach(async () => {
    sinon.restore();
    await fs.remove(scopePath);
  });

  describe('listDependenciesDataCache()', () => {
    it('should list the saved entries', async () => {
      await fsCache.saveDependenciesDataInCache('comp1', 'data');
      const list = await fsCache.listDependenciesDataCache();
      expect(Object.keys(list)).to.deep.equal(['comp1']);
    });
    it('should return an empty list when the cache dir does not exist', async () => {
      expect(await fsCache.listDependenciesDataCache()).to.deep.equal({});
    });
    // on Windows, reading a bucket dir that is pending deletion fails with EPERM
    it('should retry when listing fails with a transient error', async () => {
      const ls = sinon.stub(cacache, 'ls');
      ls.onFirstCall().rejects(fsError('EPERM'));
      ls.onSecondCall().resolves({});
      expect(await fsCache.listDependenciesDataCache()).to.deep.equal({});
      expect(ls.callCount).to.equal(2);
    });
    it('should not retry other errors', async () => {
      const ls = sinon.stub(cacache, 'ls').rejects(fsError('EACCES'));
      let error: any;
      try {
        await fsCache.listDependenciesDataCache();
      } catch (err) {
        error = err;
      }
      expect(error?.code).to.equal('EACCES');
      expect(ls.callCount).to.equal(1);
    });
  });
});
