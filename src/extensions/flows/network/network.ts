/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-this-alias */
import { ReplaySubject, from, zip, Observable } from 'rxjs';
import { mergeMap, map, filter, mergeAll, tap } from 'rxjs/operators';

import { Graph } from 'graphlib';
import { EventEmitter } from 'events';
import { Workspace } from '../../workspace';
import { Consumer } from '../../../consumer';
import DependencyGraph from '../../../scope/graph/scope-graph';
import { ExecutionOptions } from './options';
import { createSubGraph, getNeighborsByDirection } from './sub-graph';
import { Flow } from '../flow';
import { ComponentID } from '../../component';
import { Capsule } from '../../isolator';
import logger from '../../../logger/logger';

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

    const createCapsuleStartTime = new Date();
    networkStream.next({
      type: 'network:capsules:start',
      startTime: createCapsuleStartTime
    });

    const visitedCache = await createCapsuleVisitCache(graph, this.workspace);

    networkStream.next({
      type: 'network:capsules:end',
      startTime: createCapsuleStartTime,
      duration: new Date().getTime() - createCapsuleStartTime.getTime()
    });

    this.emitter.emit('workspaceLoaded', Object.keys(visitedCache).length);
    const walk = this.getWalker(networkStream, startTime, visitedCache, graph);

    walk();
    this.emitter.emit('executionEnded');
    return networkStream;
  }

  onWorkspaceLoaded(cb) {
    this.emitter.on('workspaceLoaded', cb);
  }

  // remove emitter
  private getWalker(stream: ReplaySubject<any>, startTime: Date, visitedCache: Cache, graph: Graph) {
    const getFlow = this.getFlow.bind(this);
    const postFlow = this.postFlow ? this.postFlow.bind(this) : null;
    let seederAmount = 0;

    return function walk() {
      logger.debug(`flowsExt, network.walk graph.nodes().length: ${graph.nodes().length}`);
      if (!graph.nodes().length) {
        logger.debug('flowsExt, network.walk endNetwork going to send network:result');
        endNetwork(stream, startTime, visitedCache);
        return;
      }

      const seeders: string[] = getSeeders(graph, visitedCache, seederAmount);
      logger.debug(`flowsExt, network.walk, seeders: ${seeders.join(', ')}`);
      const seedersObservables: Observable<string> = from(seeders);
      const flows: Observable<Flow> = seedersObservables.pipe(
        mergeMap(seed => from(getFlow(visitedCache[seed].capsule)))
      );
      seederAmount += seeders.length;
      logger.debug(`flowsExt, network.walk, amount: ${seederAmount}`);

      zip(
        zip(seedersObservables, flows).pipe(map(([seed, flow]) => flow.execute(visitedCache[seed].capsule))),
        seedersObservables
      )
        .pipe(
          map(([flowStream, seed]) => {
            // console.log('visited ', seed)
            visitedCache[seed].visited = true;
            stream.next(flowStream);
            return flowStream;
          }),
          mergeAll(),
          // tap((x: any) =>
          //   console.log('~~~~~got this', x.type, 'from', typeof x.id === 'string' ? x.id : x.id && x.id.toString())
          // ),
          filter((data: any) => data.type === 'flow:result')
        )
        .subscribe({
          next(data: any) {
            const seed = data.id.toString();
            const cacheValue = visitedCache[seed];
            cacheValue.result = data;
            seederAmount -= 1;
            logger.debug(`flowsExt, network.walk, next, removing ${seed}. amount is decreased to ${seederAmount}`);
            graph.removeNode(seed);
            // console.log(`got ${data.type} from ${seed} amount is now ${amount}`, graph.nodes());
            handlePostFlow(postFlow, cacheValue);
            if (seederAmount === 0) {
              walk();
            }
            return data;
          },
          error(err) {
            const seed = err.id;
            seederAmount -= 1;
            logger.debug(`flowsExt, network.walk, ERROR, removing ${seed}. amount is decreased to ${seederAmount}`);
            graph.removeNode(seed);
            handleNetworkError(seed, graph, visitedCache, err);
            if (seederAmount === 0) {
              walk();
            }
          }
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

function handlePostFlow(postFlow: PostFlow | null, cacheValue: CacheValue) {
  if (postFlow) {
    postFlow(cacheValue.capsule).catch(() => {});
  }
}

function getSeeders(g: Graph, cache: Cache, amount = 0): string[] {
  const nonVisited = getNonVisitedNodes(g, cache);
  return nonVisited.length ? nonVisited.slice(0, Math.max(5 - amount, 1)) : [g.nodes()[0]].filter(v => v);
}
function getNonVisitedNodes(g: Graph, cache: Cache): string[] {
  return g.sources().filter(seed => !cache[seed].visited);
}

function endNetwork(network: ReplaySubject<unknown>, startTime: Date, visitedCache: Cache) {
  const endMessage = {
    type: 'network:result',
    startTime,
    duration: new Date().getTime() - startTime.getTime(),
    value: Object.entries(visitedCache).reduce((accum, [key, val]) => {
      accum[key] = {
        result: val.result,
        visited: val.visited
      };
      return accum;
    }, {}),
    code: !!~Object.entries(visitedCache).findIndex(
      ([k, value]: [string, CacheValue]) => !value.visited || value.result instanceof Error
    )
  };
  network.next(endMessage);
  network.complete();
}

function handleNetworkError(seed: string, graph: Graph, visitedCache: Cache, err: Error) {
  const dependents = getNeighborsByDirection(seed, graph);
  dependents
    .map(dependent => {
      visitedCache[dependent].result = new Error(`Error due to ${seed}`);
      return dependent;
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
