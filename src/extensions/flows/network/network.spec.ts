/* eslint-disable no-sequences */
import { expect } from 'chai';
import { GraphTestCase, createTestNetworkStream } from '../util/create-fake-network';

describe('Network', () => {
  xit('sanity', async function() {
    const testCase: GraphTestCase = {
      graph: {
        a: []
      },
      input: ['a'],
      options: {
        concurrency: 4,
        traverse: 'both',
        caching: true
      }
    };

    const stream = await createTestNetworkStream(testCase);
    let result;
    return new Promise(resolve =>
      stream.subscribe({
        next(data: any) {
          if (data.type === 'network:result') {
            result = data;
          }
        },
        complete() {
          expect(!!result).to.be.true;
          expect(Object.keys(result.value).length).to.equal(1);
          resolve();
        }
      })
    );
  });
});
