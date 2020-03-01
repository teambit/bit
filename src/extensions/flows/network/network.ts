/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-empty-function */
import { ReplaySubject } from 'rxjs';
import PQueue from 'p-queue/dist';
import { Graph } from 'graphlib';
import { Workspace } from '../../workspace';
import { Consumer } from '../../../consumer';
import DependencyGraph from '../../../scope/graph/scope-graph';
import { ExecutionOptions } from './options';
import { createSubGraph, getNeighborsByDirection } from './sub-graph';
import { ComponentCapsule } from '../../capsule/component-capsule';
import { Flow } from '../flow';
import { ComponentID } from '../../component';

export type GetFlow = (id: ComponentID) => Promise<Flow>;
type CacheValue = {
  visited: boolean;
  capsule: ComponentCapsule;
  result: any;
};

export type Cache = { [k: string]: CacheValue };

const getSources = (g: Graph, cache: Cache) => g.sources().filter(seed => !cache[seed].visited);
const getSeeders = (g: Graph, cache) => {
  const sources = getSources(g, cache);
  return sources.length ? sources : [g.nodes()[0]].filter(v => v);
};

export class Network {
  constructor(
    private workspace: Workspace,
    private seeders: ComponentID[],
    private getFlow: GetFlow,
    private getGraph = getWorkspaceGraph
  ) {}

  async execute(options: ExecutionOptions) {
    const network = new ReplaySubject();
    const startTime = new Date();

    network.next({
      type: 'network:start',
      startTime
    });

    const graph = await this.createGraph(options);
    const capsules = await this.workspace.loadCapsules(graph.nodes());

    const visitedCache = createCapsuleVisitCache(capsules);
    const q = new PQueue({ concurrency: options.concurrency });

    const that = this;

    async function walk() {
      if (!graph.nodes().length) {
        endNetwork(network, startTime, visitedCache);
        return;
      }

      const seeders = getSeeders(graph, visitedCache).map(async function(seed) {
        const { capsule } = visitedCache[seed];
        const flow = await that.getFlow(capsule.component.id);
        visitedCache[seed].visited = true;
        const flowStream = await flow.execute(capsule);
        network.next(flowStream);
        return q
          .add(
            () =>
              new Promise(resolve =>
                flowStream.subscribe({
                  next(data: any) {
                    if (data.type === 'flow:result') {
                      visitedCache[seed].result = data;
                    }
                  },
                  complete() {
                    graph.removeNode(seed);
                    resolve();
                  },
                  error(err) {
                    handleNetworkError(seed, graph, visitedCache, new Error(err.message));
                    resolve();
                  }
                })
              )
          )
          .then(() => {
            const sources = getSources(graph, visitedCache);
            return sources.length || !q.pending ? walk() : Promise.resolve();
          });
      });
      await Promise.all(seeders);
    }

    await walk();
    return network;
  }

  private async createGraph(options: ExecutionOptions) {
    const fullGraph = await this.getGraph(this.workspace.consumer);
    const components = await this.workspace.getMany(this.seeders.map(seed => seed._legacy));
    const subGraph = createSubGraph(components, options, fullGraph);
    return subGraph;
  }
}

function endNetwork(network: ReplaySubject<unknown>, startTime: Date, visitedCache: Cache) {
  const endTime = new Date();
  network.next({
    type: 'network:result',
    endTime,
    duration: endTime.getTime() - startTime.getTime(),
    value: Object.entries(visitedCache).reduce((accum, [key, val]) => {
      accum[key] = {
        result: val.result,
        visited: val.visited
      };
      return accum;
    }, {}),
    // eslint-disable-next-line no-empty-pattern
    code: !!~Object.entries(visitedCache).findIndex(
      ([k, value]: [string, CacheValue]) => !value.visited || value.result instanceof Error
    )
  });
  network.complete();
}

function handleNetworkError(seed: string, graph: Graph, visitedCache: Cache, err: Error) {
  const dependents = getNeighborsByDirection(seed, graph, 'successors');
  dependents.forEach(dependent => {
    visitedCache[dependent].result = new Error(`Error due to ${seed}`);
    graph.removeNode(dependent);
  });
  visitedCache[seed].result = new Error(err.message);
  graph.removeNode(seed);
}

function createCapsuleVisitCache(capsules: ComponentCapsule[]): Cache {
  return capsules.reduce((accum, curr) => {
    accum[curr.component.id.toString()] = {
      visited: false,
      capsule: curr,
      result: null
    };
    return accum;
  }, {});
}

export function getWorkspaceGraph(consumer: Consumer) {
  return DependencyGraph.buildGraphFromWorkspace(consumer, false, true);
}
