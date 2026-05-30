import { expect } from 'chai';
import { compareComponentPairs } from './compare-component-pairs';
import type { ComponentComparePair } from './compare-component-pairs';

describe('compareComponentPairs', () => {
  const pairs: ComponentComparePair[] = [
    { baseId: 'a@1', compareId: 'a@2' },
    { baseId: 'b@1', compareId: 'b@2' },
    { baseId: 'c@1', compareId: 'c@2' },
  ];

  it('returns one result per pair, preserving order', async () => {
    const results = await compareComponentPairs(
      pairs,
      async (baseId, compareId) => ({ id: `${baseId}-${compareId}` }),
      { concurrency: 2 }
    );
    expect(results).to.deep.equal([{ id: 'a@1-a@2' }, { id: 'b@1-b@2' }, { id: 'c@1-c@2' }]);
  });

  it('slices by offset and limit', async () => {
    const results = await compareComponentPairs(pairs, async (baseId) => ({ id: baseId }), {
      offset: 1,
      limit: 1,
      concurrency: 2,
    });
    expect(results).to.deep.equal([{ id: 'b@1' }]);
  });

  it('returns an empty array when offset is past the end', async () => {
    const results = await compareComponentPairs(pairs, async (b) => ({ id: b }), {
      offset: 99,
      concurrency: 2,
    });
    expect(results).to.deep.equal([]);
  });

  it('isolates a failing pair as null without failing the others', async () => {
    const errors: ComponentComparePair[] = [];
    const results = await compareComponentPairs(
      pairs,
      async (baseId) => {
        if (baseId === 'b@1') throw new Error('no version yet');
        return { id: baseId };
      },
      {
        concurrency: 2,
        onError: (pair) => errors.push(pair),
      }
    );
    expect(results).to.deep.equal([{ id: 'a@1' }, null, { id: 'c@1' }]);
    expect(errors).to.deep.equal([{ baseId: 'b@1', compareId: 'b@2' }]);
  });

  it('returns an empty array for empty input', async () => {
    const results = await compareComponentPairs([], async (b) => ({ id: b }), { concurrency: 2 });
    expect(results).to.deep.equal([]);
  });
});
