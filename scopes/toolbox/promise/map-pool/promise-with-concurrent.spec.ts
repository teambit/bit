import { expect } from 'chai';
import { pMapPool } from './promise-with-concurrent';
// import pMapPool from 'p-map';

describe('pMapPool Tests', () => {
  it('should return an empty array if the input is empty', async () => {
    const result = await pMapPool([], async (item) => item, { concurrency: 2 });
    expect(result).to.deep.equal([]);
  });

  it('should process all items with concurrency = Infinity', async () => {
    const items = [1, 2, 3, 4, 5];
    const mapper = async (value: number) => value * 2;
    const result = await pMapPool(items, mapper, { concurrency: Infinity });

    // Since concurrency is infinite, it just behaves like Promise.all(mapper(...))
    // Expect each item doubled
    expect(result).to.deep.equal([2, 4, 6, 8, 10]);
  });

  it('should process all items with concurrency = 2', async () => {
    const items = [1, 2, 3, 4];
    const mapper = async (value: number) => {
      // Simulate a small delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      return value + 10;
    };
    const result = await pMapPool(items, mapper, { concurrency: 2 });

    // Expect each item incremented by 10
    expect(result).to.deep.equal([11, 12, 13, 14]);
  });

  it('should handle concurrency larger than the array size', async () => {
    const items = [10, 20, 30];
    const mapper = async (value: number) => value / 10;
    // concurrency is 10, but only 3 items
    const result = await pMapPool(items, mapper, { concurrency: 10 });

    // Expect each item divided by 10
    expect(result).to.deep.equal([1, 2, 3]);
  });

  it('should preserve stack traces when an error is thrown', async () => {
    const items = [1, 2, 3];
    // This mapper will throw an error on the second item
    const mapper = async (value: number) => {
      if (value === 2) {
        throw new Error('Test error for concurrency function');
      }
      return value;
    };

    let caughtError: Error | null = null;

    try {
      await pMapPool(items, mapper, { concurrency: 2 });
    } catch (error: any) {
      caughtError = error;
    }

    expect(caughtError).to.not.be.null;
    expect(caughtError).to.be.an.instanceOf(Error);
    expect(caughtError!.message).to.equal('Test error for concurrency function');
    expect(caughtError!.stack).to.include('mapper');
    // for p-map it's 3.
    // for p-map-pool it's 15.
    expect(caughtError!.stack?.split('\n').length).to.be.greaterThan(5);
  });
});
