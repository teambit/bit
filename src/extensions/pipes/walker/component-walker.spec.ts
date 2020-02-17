import { expect } from 'chai';
import { Graph } from 'graphlib';
import { Consumer } from '../../../consumer';
import { getTopologicalWalker } from './component-walker';
import { ResolvedComponent } from '../../workspace/resolved-component';
import { PipeOptions } from './pipe-options';
import { Workspace } from '../../workspace';

describe('component-walker', () => {
  it('should traverse graph', () => {});
});

export type GraphTestCase = {
  graph: { [id: string]: string[] };
  input: string[];
  options: PipeOptions;
};

async function runTestCase(testCase: GraphTestCase) {
  const input = createResolvedComponentsMock(testCase.input);
  const func = createGetGraphFn(testCase);
  const { walk, cache } = await getTopologicalWalker(input, testCase.options, {} as Workspace, func);
}

export function createGetGraphFn(testCase: GraphTestCase) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (_consumer: Consumer) => {
    return Promise.resolve(
      Object.entries(testCase.graph).reduce((accum, [key, value]) => {
        accum.setNode(key);
        value.forEach(val => {
          accum.setNode(val);
          accum.setEdge(key, val);
        });
        return accum;
      }, new Graph())
    );
  };
}

export function createResolvedComponentsMock(ids: string[]) {
  return (ids as any[]) as ResolvedComponent[];
}
