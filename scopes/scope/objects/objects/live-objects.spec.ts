import { expect } from 'chai';
import type BitObject from './object';
import { LiveObjects } from './live-objects';

const createObject = () => ({}) as BitObject;

describe('LiveObjects', () => {
  it('should return an object that is still referenced, with its size and cacheability', () => {
    const liveObjects = new LiveObjects();
    const object = createObject();
    liveObjects.set('key', object, 100, false);
    expect(liveObjects.get('key')).to.deep.equal({ object, size: 100, cacheable: false });
  });
  it('should return the latest object that was set for the same key', () => {
    const liveObjects = new LiveObjects();
    const older = createObject();
    const newer = createObject();
    liveObjects.set('key', older, 1, true);
    liveObjects.set('key', newer, 2, true);
    expect(liveObjects.get('key')?.object).to.equal(newer);
  });
  it('should not return deleted or cleared objects', () => {
    const liveObjects = new LiveObjects();
    const first = createObject();
    const second = createObject();
    liveObjects.set('first', first, 1, true);
    liveObjects.set('second', second, 1, true);
    liveObjects.delete('first');
    expect(liveObjects.get('first')).to.be.undefined;
    liveObjects.clear();
    expect(liveObjects.get('second')).to.be.undefined;
  });
  it('should not keep an object alive once nothing else references it', async function () {
    const gc = (global as any).gc;
    if (!gc) this.skip(); // requires running node with --expose-gc
    const liveObjects = new LiveObjects();
    (() => liveObjects.set('key', createObject(), 1, true))();
    // a WeakRef keeps its target alive until the end of the current job, so let it end before collecting
    await new Promise((resolve) => setImmediate(resolve));
    gc();
    expect(liveObjects.get('key')).to.be.undefined;
  });
});
