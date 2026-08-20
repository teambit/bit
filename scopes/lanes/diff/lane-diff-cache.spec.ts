import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import { LaneId } from '@teambit/lane-id';
import { LaneDiffCache, laneCompositionFingerprint } from './lane-diff-cache';
import type { LaneLike } from './lane-diff-cache';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sourceLaneId = LaneId.from('my-lane', 'org.scope');
const targetLaneId = LaneId.from('other-lane', 'org.scope');

/** a Lane-model stand-in: constant uuid `hash()` (as the real model has) + a mutable composition. */
function makeLane(heads: Record<string, string>): LaneLike & { hash: () => string; _hash: string } {
  return {
    _hash: 'constant-uuid-hash',
    hash: () => 'constant-uuid-hash',
    components: Object.entries(heads).map(([id, head]) => ({
      id: { toString: () => id },
      head: { toString: () => head },
    })),
  };
}

function makeCache() {
  // isolated persist dir so scheduled (debounced, unref'd) saves never touch the real bit cache.
  return new LaneDiffCache(undefined, path.join(os.tmpdir(), `lane-diff-cache-spec-${process.pid}`));
}

describe('laneCompositionFingerprint', () => {
  it('should change when a component head advances, even though the lane uuid hash is constant', () => {
    const before = makeLane({ 'org.scope/button': 'aaa111' });
    const after = makeLane({ 'org.scope/button': 'bbb222' });
    expect(before._hash).to.equal(after._hash); // the trap: lane hash never moves
    expect(laneCompositionFingerprint(before)).to.not.equal(laneCompositionFingerprint(after));
  });

  it('should be stable for an identical composition regardless of component order', () => {
    const a: LaneLike = {
      components: [
        { id: { toString: () => 'org.scope/a' }, head: { toString: () => 'h1' } },
        { id: { toString: () => 'org.scope/b' }, head: { toString: () => 'h2' } },
      ],
    };
    const b: LaneLike = { components: [...a.components].reverse() };
    expect(laneCompositionFingerprint(a)).to.equal(laneCompositionFingerprint(b));
  });

  it('should return an empty (uncacheable) fingerprint for an unknown composition', () => {
    expect(laneCompositionFingerprint(undefined)).to.equal('');
    expect(laneCompositionFingerprint({ components: [] })).to.equal('');
  });
});

describe('LaneDiffCache.diffStatusKey', () => {
  it('should produce a different key after the source lane advances', () => {
    const cache = makeCache();
    const target = makeLane({ 'org.scope/button': 'ttt000' });
    const keyBefore = cache.diffStatusKey(
      sourceLaneId,
      makeLane({ 'org.scope/button': 'aaa111' }),
      targetLaneId,
      target
    );
    const keyAfter = cache.diffStatusKey(
      sourceLaneId,
      makeLane({ 'org.scope/button': 'bbb222' }),
      targetLaneId,
      target
    );
    expect(keyBefore).to.not.equal('');
    expect(keyBefore).to.not.equal(keyAfter);
  });

  it('should produce a different key when a main target head advances', () => {
    const cache = makeCache();
    const source = makeLane({ 'org.scope/button': 'aaa111' });
    const mainBefore = [ComponentID.fromString('org.scope/button@111aaa')];
    const mainAfter = [ComponentID.fromString('org.scope/button@222bbb')];
    const keyBefore = cache.diffStatusKey(sourceLaneId, source, undefined, undefined, undefined, mainBefore);
    const keyAfter = cache.diffStatusKey(sourceLaneId, source, undefined, undefined, undefined, mainAfter);
    expect(keyBefore).to.not.equal('');
    expect(keyBefore).to.not.equal(keyAfter);
  });

  it('should not cache when a composition is unknown', () => {
    const cache = makeCache();
    expect(cache.diffStatusKey(sourceLaneId, undefined, targetLaneId, makeLane({ a: 'h' }))).to.equal('');
    expect(cache.diffStatusKey(sourceLaneId, makeLane({ a: 'h' }), undefined, undefined, undefined, [])).to.equal('');
  });

  it('should embed the options so different option sets never share a result', () => {
    const cache = makeCache();
    const source = makeLane({ 'org.scope/button': 'aaa111' });
    const target = makeLane({ 'org.scope/button': 'ttt000' });
    const plain = cache.diffStatusKey(sourceLaneId, source, targetLaneId, target);
    const skipping = cache.diffStatusKey(sourceLaneId, source, targetLaneId, target, { skipUpToDate: true });
    expect(plain).to.not.equal(skipping);
  });
});

describe('LaneDiffCache diff-status store/get round trip', () => {
  it('should return the stored statuses with rehydrated component ids', () => {
    const cache = makeCache();
    const key = cache.diffStatusKey(
      sourceLaneId,
      makeLane({ 'org.scope/button': 'aaa111' }),
      targetLaneId,
      makeLane({ 'org.scope/button': 'ttt000' })
    );
    cache.storeDiffStatus(key, [
      {
        componentId: ComponentID.fromString('org.scope/button@aaa111'),
        sourceHead: 'aaa111',
        targetHead: 'ttt000',
        upToDate: false,
      },
    ]);
    const restored = cache.getDiffStatus(key);
    expect(restored).to.have.lengthOf(1);
    expect(restored?.[0].componentId).to.be.instanceOf(ComponentID);
    expect(restored?.[0].componentId.toString()).to.equal('org.scope/button@aaa111');
    expect(restored?.[0].sourceHead).to.equal('aaa111');
  });

  it('should never store under an empty (uncacheable) key', () => {
    const cache = makeCache();
    cache.storeDiffStatus('', [
      { componentId: ComponentID.fromString('org.scope/button@aaa111'), sourceHead: 'aaa111' },
    ]);
    expect(cache.getDiffStatus('')).to.equal(undefined);
  });
});

describe('LaneDiffCache persistence debounce', () => {
  // count writes by monkeypatching the shared fs-extra `outputFile` the cache calls (no sinon dep):
  // the module does `import fs from 'fs-extra'` and calls `fs.outputFile`, so both reference this
  // same object.
  let writeCount: number;
  let lastWritten: string | undefined;
  let originalOutputFile: typeof fs.outputFile;

  beforeEach(() => {
    writeCount = 0;
    lastWritten = undefined;
    originalOutputFile = fs.outputFile;
    (fs as any).outputFile = async (_file: string, data: string) => {
      writeCount += 1;
      lastWritten = data;
    };
  });

  afterEach(() => {
    (fs as any).outputFile = originalOutputFile;
  });

  it('should collapse a burst of stores into a single write (debounce, not throttle)', async () => {
    // 20ms flush window; the burst spans well past it (10 stores × 8ms = ~80ms) — a throttle would
    // fire multiple times across that span, a debounce exactly once after the last store settles.
    const cache = new LaneDiffCache(undefined, path.join(os.tmpdir(), `lane-diff-debounce-${process.pid}`), 20);
    for (let i = 0; i < 10; i += 1) {
      cache.storeSnapsDistance(`org.scope/c${i}|src|tgt`, {
        err: undefined,
        isUpToDate: () => false,
        commonSnapBeforeDiverge: null,
        snapsOnSourceOnly: [],
        snapsOnTargetOnly: [],
      } as any);
      // eslint-disable-next-line no-await-in-loop
      await delay(8);
    }
    expect(writeCount, 'no write should fire mid-burst').to.equal(0);
    await delay(40); // let the debounce settle past the last store
    expect(writeCount, 'exactly one write after the burst settles').to.equal(1);
    // and it captured the whole burst, not a partial mid-burst snapshot.
    const parsed = JSON.parse(lastWritten as string);
    expect(Object.keys(parsed)).to.have.lengthOf(10);
  });

  it('should write once per memo, keyed independently', async () => {
    const cache = new LaneDiffCache(undefined, path.join(os.tmpdir(), `lane-diff-debounce2-${process.pid}`), 20);
    cache.storeChangeTypes('a|b|c', []);
    cache.storeDiffStatus('key', [{ componentId: ComponentID.fromString('org.scope/x@h'), sourceHead: 'h' }]);
    await delay(40);
    // two distinct memos each flush once — not coalesced together, not fired repeatedly.
    expect(writeCount).to.equal(2);
  });
});
