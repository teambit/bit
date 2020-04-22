/* eslint-disable no-sequences */
import { expect } from 'chai';
import { toArray } from 'rxjs/operators';
import { GraphTestCase, createTestNetworkStream } from '../util/create-fake-network';
import { flattenReplaySubject } from '../util/flatten-nested-map';

//
// a graph of inter connected capsules where a->b if a is liable for b (b depends on a).
//
//
describe('Network', () => {
  function getTestCaseFunc(toExpect: string, graph: { [k: string]: string[] } = { 'bit/a': [] }, input = ['bit/a']) {
    return async function() {
      const testCase: GraphTestCase = {
        graph,
        input,
        options: {
          concurrency: 4,
          traverse: 'both',
          caching: true
        }
      };
      const stream = await createTestNetworkStream(testCase);

      return new Promise((resolve, reject) =>
        flattenReplaySubject(stream)
          .pipe(toArray())
          .subscribe(
            results => {
              const report = results
                .filter((x: any) => x.type === 'flow:result')
                .reduce((accum, curr: any): string => (accum ? `${accum}-->${curr.id}` : curr.id), '');
              expect(report).to.equal(toExpect);
            },
            reject,
            resolve
          )
      );
    };
  }
  describe('sanity', function() {
    it('should support 1 component graph', getTestCaseFunc('bit/a'));
    it('should support 0 component graph', getTestCaseFunc('', {}, []));
  });

  it(
    'structure is a-->b-->c seeder is a ',
    getTestCaseFunc(
      'bit/c-->bit/b-->bit/a',
      {
        'bit/a': [],
        'bit/b': ['bit/a'],
        'bit/c': ['bit/b']
      },
      ['bit/a']
    )
  );

  it(
    'structure is a-->b-->c seeder is b',
    getTestCaseFunc(
      'bit/c-->bit/b-->bit/a',
      {
        'bit/a': [],
        'bit/b': ['bit/a'],
        'bit/c': ['bit/b']
      },
      ['bit/b']
    )
  );

  it(
    'structure is a-->b-->c seeder is c ',
    getTestCaseFunc(
      'bit/c-->bit/b-->bit/a',
      {
        'bit/a': [],
        'bit/b': ['bit/a'],
        'bit/c': ['bit/b']
      },
      ['bit/c']
    )
  );

  // currently fails on circular
  it.skip(
    'circular structure is a-->b-->c-->b seeder is a',
    getTestCaseFunc(
      'bit/c-->bit/b-->bit/a',
      {
        'bit/a': [],
        'bit/b': ['bit/a', 'bit/c'],
        'bit/c': ['bit/b']
      },
      ['bit/a']
    )
  );

  // currently fails on circular
  it.skip('circular structure is a-->b-->c-->b seeder is c', function() {});
});
