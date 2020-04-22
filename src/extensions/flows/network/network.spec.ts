/* eslint-disable no-sequences */
import { expect } from 'chai';
import { ReplaySubject } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { GraphTestCase, createTestNetworkStream } from '../util/create-fake-network';
import { flattenReplaySubject } from '../util/flatten-nested-map';

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

  it('structure is a-->b-->c seeder is a ', async function() {
    const testCase: GraphTestCase = {
      graph: {
        'bit/a': [],
        'bit/b': ['bit/a'],
        'bit/c': ['bit/b']
      },
      input: ['bit/a'],
      options: {
        concurrency: 4,
        traverse: 'both',
        caching: true
      }
    };
    const stream: ReplaySubject<any> = await createTestNetworkStream(testCase);

    return new Promise((resolve, reject) =>
      flattenReplaySubject(stream)
        .pipe(toArray())
        .subscribe(
          results => {
            const report = results
              .filter((x: any) => x.type === 'flow:result')
              .reduce((accum, curr: any): string => (accum ? `${accum}-->${curr.id}` : curr.id), '');
            expect(report).to.equal('bit/c-->bit/b-->bit/a');
          },
          reject,
          resolve
        )
    );

    // stream.pipe(flatMapNest(), flatMapNest()).subscribe((x: any) => console.log('got:', x.type));
  });
  it('structure is a-->b-->c seeder is b', function() {});
  it('structure is a-->b-->c seeder is c ', function() {});
  it('circular structure is a-->b-->c-->d-->b seeder is a', function() {});
  it('circular structure is a-->b-->c-->d-->b seeder is c', function() {});
});
