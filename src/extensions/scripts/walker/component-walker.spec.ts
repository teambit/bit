/* eslint-disable no-sequences */
// import { expect } from 'chai';
import { Graph } from 'graphlib';
import { Consumer } from '../../../consumer';
import { getTopologicalWalker } from './component-walker';
import { ResolvedComponent } from '../../workspace/resolved-component';
import { Workspace } from '../../workspace';
import { ScriptsOptions } from '../scripts-options';

describe('component-walker', () => {
  // todo: qballer - fix.
  it.skip('sanity', async function() {
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

    const execute = await createTestCase(testCase);
    const result = await execute.run();
    // debugger
  });
});

export type GraphTestCase = {
  graph: { [id: string]: string[] };
  input: string[];
  options: ScriptsOptions;
};

export async function createTestCase(testCase: GraphTestCase) {
  const input = createResolvedComponentsMock(testCase.input);
  const fakeGetGraph = createGetGraphFn(testCase);
  const workspace = {
    load: ids => Promise.resolve(createResolvedComponentsMock(ids))
  };
  // eslint-disable-next-line no-console
  const visitor = async () => Promise.resolve();
  const { walk, reporter } = await getTopologicalWalker(
    input,
    testCase.options,
    (workspace as any) as Workspace,
    fakeGetGraph
  );
  return {
    run: () => walk(visitor),
    reporter
  };
}

export function createGetGraphFn(testCase: GraphTestCase) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (_consumer: Consumer) => {
    const res = Object.entries(testCase.graph).reduce((accum, [key, value]) => {
      accum.setNode(key);
      value.forEach(val => {
        accum.setNode(val);
        accum.setEdge(key, val);
      });
      return accum;
    }, new Graph());

    return Promise.resolve(res);
  };
}

export function createResolvedComponentsMock(ids: string[]) {
  return (ids.map(id => ({
    component: {
      id: {
        toString: () => id
      }
    },
    capsule: {}
  })) as any) as ResolvedComponent[];
}
