import { expect } from 'chai';
import sinon from 'sinon';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import type { Consumer } from '@teambit/legacy.consumer';
import { ComponentLoader } from './component-loader';

describe('ComponentLoader', function () {
  this.timeout(10000);
  let wsPath: string;
  let componentLoader: ComponentLoader;
  beforeEach(async () => {
    wsPath = await fs.mkdtemp(path.join(os.tmpdir(), 'component-loader-spec-'));
    const consumer = {
      getPath: () => wsPath,
      scope: { getPath: () => path.join(wsPath, '.bit') },
      config: { path: path.join(wsPath, 'workspace.jsonc') },
    } as unknown as Consumer;
    componentLoader = new ComponentLoader(consumer);
  });
  afterEach(async () => {
    sinon.restore();
    await fs.remove(wsPath);
  });

  describe('invalidateDependenciesCacheIfNeeded()', () => {
    // components are loaded in parallel. running the check concurrently made them delete the cache while
    // others were listing it, which failed with EPERM on Windows.
    it('should run the check once when called concurrently', async () => {
      const list = sinon
        .stub(componentLoader.componentFsCache, 'listDependenciesDataCache')
        .resolves({ comp1: { time: 0 } } as any);
      const deleteAll = sinon.stub(componentLoader.componentFsCache, 'deleteAllDependenciesDataCache').resolves();
      await fs.outputFile(path.join(wsPath, 'package.json'), '{}');
      await Promise.all([1, 2, 3, 4, 5].map(() => componentLoader.invalidateDependenciesCacheIfNeeded()));
      expect(list.callCount).to.equal(1);
      expect(deleteAll.callCount).to.equal(1);
    });
    it('should check again after the components cache is cleared', async () => {
      const list = sinon.stub(componentLoader.componentFsCache, 'listDependenciesDataCache').resolves({});
      await componentLoader.invalidateDependenciesCacheIfNeeded();
      componentLoader.clearComponentsCache();
      await componentLoader.invalidateDependenciesCacheIfNeeded();
      expect(list.callCount).to.equal(2);
    });
    it('should let a later call retry when the check fails', async () => {
      const list = sinon.stub(componentLoader.componentFsCache, 'listDependenciesDataCache');
      list.onFirstCall().rejects(new Error('failed'));
      list.onSecondCall().resolves({});
      const results = await Promise.allSettled([
        componentLoader.invalidateDependenciesCacheIfNeeded(),
        componentLoader.invalidateDependenciesCacheIfNeeded(),
      ]);
      expect(results.map((r) => r.status)).to.deep.equal(['rejected', 'rejected']);
      await componentLoader.invalidateDependenciesCacheIfNeeded();
      expect(list.callCount).to.equal(2);
    });
    it('should not let a stale failure reset the flag after a newer check succeeded', async () => {
      let rejectFirst: (err: Error) => void = () => {};
      const list = sinon.stub(componentLoader.componentFsCache, 'listDependenciesDataCache');
      list.onFirstCall().returns(new Promise((_resolve, reject) => (rejectFirst = reject)) as any);
      list.resolves({});
      const first = componentLoader.invalidateDependenciesCacheIfNeeded();
      await new Promise((resolve) => setTimeout(resolve, 50)); // let the first check reach listDependenciesDataCache
      componentLoader.clearComponentsCache();
      await componentLoader.invalidateDependenciesCacheIfNeeded();
      rejectFirst(new Error('failed'));
      await first.catch(() => {});
      await componentLoader.invalidateDependenciesCacheIfNeeded();
      expect(list.callCount).to.equal(2);
    });
  });
});
