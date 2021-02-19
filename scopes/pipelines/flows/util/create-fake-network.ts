/* eslint-disable @typescript-eslint/no-unused-vars */
import { Component, ComponentID } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { Graph } from 'graphlib';
import { ReplaySubject } from 'rxjs';

import { Flow } from '../flow';
import { Network } from '../network';
import { ExecutionOptions } from '../network/options';
import { createFakeCapsule, getFakeCapsuleLocation } from './create-capsule';

export type GraphTestCase = {
  graph: { [id: string]: string[] };
  input: string[];
  options: ExecutionOptions;
};

export async function createTestNetworkStream(testCase: GraphTestCase): Promise<ReplaySubject<any>> {
  const fakeGetGraph = createGetGraphFn(testCase);
  const fakeWorkSpace = createFakeWorkSpace(fakeGetGraph);
  const ids = testCase.input.map((val) => new ComponentID(BitId.parse(val)));
  const getFlow = (id: Capsule) => Promise.resolve(new Flow([`echo hello-${id.component.id}`]));

  const network = new Network(fakeWorkSpace, ids, getFlow, fakeGetGraph);
  return network.execute(testCase.options);
}

function createFakeWorkSpace(fakeGetGraph: (_consumer: Consumer) => Promise<Graph>) {
  return ({
    getMany: (ids: Array<BitId | string>) => {
      return Promise.resolve(
        ids.map((id) => {
          return {
            id: {
              toString: () => (typeof id === 'string' ? id : id.toString()),
            },
          } as Component;
        })
      );
    },
    loadCapsules: async (ids: string[]) => {
      const graph = await fakeGetGraph({} as Consumer);
      return Promise.all(ids.map((id) => createFakeCapsuleInGraph(id, graph)));
    },
  } as any) as Workspace;
}

export function createGetGraphFn(testCase: GraphTestCase) {
  return (_consumer: Consumer) => {
    const res = Object.entries(testCase.graph).reduce((accum, [key, value]) => {
      accum.setNode(key);
      value.forEach((val) => {
        accum.setNode(val);
        accum.setEdge(key, val);
      });
      return accum;
    }, new Graph());

    return Promise.resolve(res);
  };
}

async function createFakeCapsuleInGraph(name: string, graph: Graph) {
  const main = 'src/index.js';
  const dependencies = (graph.predecessors(name) || []).reduce((accum, dependency) => {
    accum[dependency] = `file://${getFakeCapsuleLocation(name)}`;
    return accum;
  }, {});

  const fs = {
    [main]: `
      ${Object.keys(dependencies)
        .map((dependency) => `const ${dependency.split('/')[1]} = require('${dependency}')`)
        .join('\n')}
      function printMe(){
        console.log('${Object.keys(dependencies)
          .map((dependency) => `${dependency.split('/')[1]}()` || ['hello', 'world'])
          .join('+')}')
      }

      module.exports = function () {
        return '${name}'
      }
    `,
    'package.json': JSON.stringify({ main, name, dependencies }, null, 2),
  };

  const fakeCapsule = await createFakeCapsule(fs, name);
  return fakeCapsule;
}
