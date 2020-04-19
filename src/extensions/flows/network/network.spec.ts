/* eslint-disable no-sequences */
import { expect } from 'chai';
import { GraphTestCase, createTestNetworkStream } from '../util/create-fake-network';

//
// a graph of inter connected capsules where a->b if a is liable for b (b depends on a).
//
//
describe('Network', () => {
  describe('sanity', function() {
    it('should support 1 component graph', async function() {
      const testCase: GraphTestCase = {
        graph: {
          'bit/a': []
        },
        input: ['bit/a'],
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
    it('should support 0 component graph', async function() {
      const testCase: GraphTestCase = {
        graph: {},
        input: [],
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
            expect(Object.keys(result.value).length).to.equal(0);
            resolve();
          }
        })
      );
    });
  });
});

it('structure is a-->b-->c seeder is a ', function() {});
it('structure is a-->b-->c seeder is b', function() {
  it('structure is a-->b-->c seeder is c ', function() {});
  it('circular structure is a-->b-->c-->d-->b seeder is a', function() {});
  it('circular structure is a-->b-->c-->d-->b seeder is c', function() {});
});
