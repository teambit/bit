/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable @typescript-eslint/no-empty-function */
import { ReplaySubject, queueScheduler, from } from 'rxjs';
import { concatMap } from 'rxjs/operators';

import PQueue from 'p-queue/dist';
import { Graph } from 'graphlib';
import { EventEmitter } from 'events';
import { Workspace } from '../../workspace';
import { Consumer } from '../../../consumer';
import DependencyGraph from '../../../scope/graph/scope-graph';
import { ExecutionOptions } from './options';
import { createSubGraph, getNeighborsByDirection } from './sub-graph';
import { Flow } from '../flow';
import { ComponentID } from '../../component';
import { Capsule } from '../../isolator/capsule';

export type GetFlow = (capsule: Capsule) => Promise<Flow>;
export type PostFlow = (capsule: Capsule) => Promise<void>; // runs when finishes flow successfully

type CacheValue = {
  visited: boolean;
  capsule: Capsule;
  result: any;
};

export type Cache = { [k: string]: CacheValue };

export class Network {
  constructor(
    private workspace: Workspace,
    private seeders: ComponentID[],
    private getFlow: GetFlow,
    private getGraph = getWorkspaceGraph,
    private postFlow?: PostFlow,
    private emitter = new EventEmitter()
  ) {}

  async execute(options: ExecutionOptions) {
    const networkStream = new ReplaySubject();
    const startTime = new Date();

    networkStream.next({
      type: 'network:start',
      startTime
    });

    const graph = await this.createGraph(options);
    const visitedCache = await createCapsuleVisitCache(graph, this.workspace);
    this.emitter.emit('workspaceLoaded', Object.keys(visitedCache).length);
    const q = new PQueue({ concurrency: options.concurrency });
    const walk = this.getWalker(networkStream, startTime, visitedCache, graph, q);
    await walk();
    this.emitter.emit('executionEnded');
    return networkStream;
  }

  onWorkspaceLoaded(cb) {
    this.emitter.on('workspaceLoaded', cb);
  }

  private getWalker(stream: ReplaySubject<any>, startTime: Date, visitedCache: Cache, graph: Graph, q: PQueue) {
    const getFlow = this.getFlow.bind(this);
    const postFlow = this.postFlow ? this.postFlow.bind(this) : null;
    const currenConcurrency = 0;
    const maxConcurrency = 5;
    return async function walk() {
      if (!graph.nodes().length) {
        endNetwork(stream, startTime, visitedCache);
        return;
      }

      getSeeders(graph, visitedCache).map(async function(seed) {
        const { capsule } = visitedCache[seed];
        const flow = await getFlow(capsule);
        visitedCache[seed].visited = true;
        queueScheduler.schedule(() => {
          const flowStream = flow.execute(capsule);
          stream.next(flowStream);
          flowStream.subscribe({
            next(data: any) {
              if (data.type === 'flow:result') {
                visitedCache[seed].result = data;
              }
              return data;
            },
            complete() {
              graph.removeNode(seed);
              if (postFlow) {
                postFlow(capsule);
              }
              const sources = getSources(graph, visitedCache);
              return sources.length || !q.pending ? walk() : Promise.resolve();
            },
            error(err) {
              handleNetworkError(seed, graph, visitedCache, err);
            }
          });
        }, 0);
      });
    };
  }

  private async createGraph(options: ExecutionOptions) {
    const fullGraph = await this.getGraph(this.workspace.consumer);
    if (this.seeders.length === 0) {
      return fullGraph;
    }

    const components = await this.workspace.getMany(this.seeders.map(seed => seed._legacy));
    const subGraph = createSubGraph(components, options, fullGraph);
    return subGraph;
  }
}

function getSeeders(g: Graph, cache: Cache) {
  const sources = getSources(g, cache);
  return sources.length ? sources : [g.nodes()[0]].filter(v => v);
}
function getSources(g: Graph, cache: Cache) {
  return g.sources().filter(seed => !cache[seed].visited);
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
  const dependents = getNeighborsByDirection(seed, graph);
  dependents
    .map(dependent => {
      visitedCache[dependent].result = new Error(`Error due to ${seed}`);
      return dependent;
      // graph.removeNode(dependent);
    })
    .forEach(dependent => graph.removeNode(dependent));
  visitedCache[seed].result = err;
  graph.removeNode(seed);
}

async function createCapsuleVisitCache(graph: Graph, workspace: Workspace): Promise<Cache> {
  const capsules = await workspace.loadCapsules(graph.nodes());
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
