import { expect } from 'chai';
import { reduce, filter, map } from 'rxjs/operators';
import { GraphTestCase, createTestNetworkStream } from '../util/create-fake-network';
import { flattenReplaySubject } from '../util/flatten-nested-map';

//
// a graph of inter connected capsules where a->b if a is liable for b (b depends on a).
//
//
describe('Network', () => {
  function getTestCaseFunc(toExpect: string, graph: { [k: string]: string[] } = { 'bit/a': [] }, input = ['bit/a']) {
    return async function(this: any) {
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
      const report = await flattenReplaySubject(stream)
        .pipe(
          // tap((x:any)=> console.log('===>>>', x.type, 'from', typeof x.id ==='string'? x.id : x.id && x.id.toString())),
          filter((x: any) => x.type === 'flow:result'),
          map((x: any) => x.id.toString()),
          reduce((acc: string, val: string) => {
            return acc ? `${acc}-->${val}` : val;
          }, '')
        )
        .toPromise();
      return expect(report).to.equal(toExpect);
    };
  }
  describe('sanity', function() {
    it('should support 1 component graph', function() {
      return getTestCaseFunc('bit/a')();
    });
    it('should support 0 component graph', function() {
      return getTestCaseFunc('', {}, [])();
    });
  });

  it('structure is c-->b-->a seeder is a ', function() {
    return getTestCaseFunc(
      'bit/c-->bit/b-->bit/a',
      {
        'bit/a': [],
        'bit/b': ['bit/a'],
        'bit/c': ['bit/b']
      },
      ['bit/a']
    )();
  });

  it('structure is c-->b-->a seeder is b', function() {
    return getTestCaseFunc(
      'bit/c-->bit/b-->bit/a',
      {
        'bit/a': [],
        'bit/b': ['bit/a'],
        'bit/c': ['bit/b']
      },
      ['bit/b']
    )();
  });

  it('structure is c-->b-->a seeder is c ', function() {
    return getTestCaseFunc(
      'bit/c-->bit/b-->bit/a',
      {
        'bit/a': [],
        'bit/b': ['bit/a'],
        'bit/c': ['bit/b']
      },
      ['bit/c']
    )();
  });

  it('structure is l->a c->h c->a c->l', function() {
    // this.timeout(1000 * 100)
    return getTestCaseFunc(
      'bit/c-->bit/l-->bit/a-->bit/h',
      {
        'bit/a': [],
        'bit/l': ['bit/a'],
        'bit/h': [],
        'bit/c': ['bit/a', 'bit/l', 'bit/h']
      },
      []
    ).bind(this)();
  });

  // currently fails on circular
  it.skip(
    'circular structure is b-->c-->b-->a seeder is a',
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
