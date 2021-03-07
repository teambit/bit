import { ComponentID } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Workspace } from '@teambit/workspace';
import { Consumer } from '@teambit/legacy/dist/consumer';
import DependencyGraph from '@teambit/legacy/dist/scope/graph/scope-graph';
import { EventEmitter } from 'events';
import { Graph } from 'graphlib';
import { from, ReplaySubject } from 'rxjs';
import { concatAll, filter, map, mergeAll, mergeMap, tap } from 'rxjs/operators';

import { Flow } from '../flow';
import { toposortByLevels } from '../util/sort-graph-by-levels';
import { ExecutionOptions } from './options';
import { createSubGraph, getNeighborsByDirection } from './sub-graph';

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
      startTime,
    });
    const graph = await this.createGraph(options);

    const createCapsuleStartTime = new Date();
    networkStream.next({
      type: 'network:capsules:start',
      startTime: createCapsuleStartTime,
    });

    const visitedCache = await createCapsuleVisitCache(graph, this.workspace);

    networkStream.next({
      type: 'network:capsules:end',
      startTime: createCapsuleStartTime,
      duration: new Date().getTime() - createCapsuleStartTime.getTime(),
    });

    this.emitter.emit('workspaceLoaded', Object.keys(visitedCache).length);
    this.traverse(graph, networkStream, visitedCache, startTime);
    return networkStream;
  }

  onWorkspaceLoaded(cb) {
    this.emitter.on('workspaceLoaded', cb);
  }

  traverse(graph: Graph, stream: ReplaySubject<any>, visitedCache: Cache, startTime: Date) {
    const sorted = toposortByLevels(graph);
    const getFlow = this.getFlow.bind(this);
    const postFlow = this.postFlow ? this.postFlow.bind(this) : null;
    from(sorted)
      .pipe(
        mergeMap((level) =>
          from(
            level.map((flowId) =>
              getFlow(visitedCache[flowId].capsule).then((flow) => {
                visitedCache[flowId].visited = true;
                return flow.execute(visitedCache[flowId].capsule);
              })
            )
          )
        ),
        concatAll(),
        map((flowStream) => {
          stream.next(flowStream);
          return flowStream;
        }),
        mergeAll(),
        filter((data: any) => data.type === 'flow:result'),
        tap((data) => (visitedCache[data.id.toString()].result = data)),
        tap((data) => handlePostFlow(postFlow, visitedCache[data.id.toString()]))
      )
      .subscribe({
        complete() {
          endNetwork(stream, startTime, visitedCache);
        },
        error(err: any) {
          handleNetworkError(err.id, graph, visitedCache, err);
        },
      });
  }

  private async createGraph(options: ExecutionOptions) {
    const fullGraph = await this.getGraph(this.workspace.consumer);
    if (this.seeders.length === 0) {
      return fullGraph;
    }

    const components = await this.workspace.getMany(this.seeders);
    const subGraph = createSubGraph(components, options, fullGraph);
    return subGraph;
  }
}

function handlePostFlow(postFlow: PostFlow | null, cacheValue: CacheValue) {
  if (postFlow) {
    postFlow(cacheValue.capsule).catch(() => {});
  }
}

function endNetwork(network: ReplaySubject<unknown>, startTime: Date, visitedCache: Cache) {
  const endMessage = {
    type: 'network:result',
    startTime,
    duration: new Date().getTime() - startTime.getTime(),
    value: Object.entries(visitedCache).reduce((accum, [key, val]) => {
      accum[key] = {
        result: val.result,
        visited: val.visited,
      };
      return accum;
    }, {}),
    // eslint-disable-next-line no-bitwise
    code: !!~Object.entries(visitedCache).findIndex(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ([_k, value]: [string, CacheValue]) => !value.visited || value.result instanceof Error
    ),
  };
  network.next(endMessage);
  network.complete();
}

function handleNetworkError(seed: string, graph: Graph, visitedCache: Cache, err: any) {
  const dependents = getNeighborsByDirection(seed, graph);
  dependents
    .map((dependent) => {
      visitedCache[dependent].result = new Error(`Error due to ${seed}`);
      return dependent;
    })
    .forEach((dependent) => graph.removeNode(dependent));
  visitedCache[seed].result = err;
  graph.removeNode(seed);
}

async function createCapsuleVisitCache(graph: Graph, workspace: Workspace): Promise<Cache> {
  const capsules = await workspace.loadCapsules(graph.nodes());
  return capsules.reduce((accum, curr) => {
    accum[curr.component.id.toString()] = {
      visited: false,
      capsule: curr,
      result: null,
    };
    return accum;
  }, {});
}

export function getWorkspaceGraph(consumer: Consumer) {
  return DependencyGraph.buildGraphFromWorkspace(consumer, false, true);
}
