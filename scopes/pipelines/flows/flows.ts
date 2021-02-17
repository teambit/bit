/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-classes-per-file */
import { ComponentID } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Workspace } from '@teambit/workspace';
import { BitId } from '@teambit/legacy-bit-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { EventEmitter } from 'events';

import { getExecutionCache } from './cache';
import { Flow } from './flow/flow';
import { GetFlow, Network } from './network';
import { getWorkspaceGraph, PostFlow } from './network/network';
import { ExecutionOptions } from './network/options';

export class Flows {
  private emitter = new EventEmitter();
  constructor(private workspace: Workspace) {}

  getIds(ids: string[]) {
    return ids.map((id) => new ComponentID(this.workspace.consumer.getParsedId(id)));
  }

  /**
   * Creates a custom network from workspace.
   *
   * @param seeders - array of components to build.
   * @param getFlow - function which provide component flow.
   * @param postFlow - postFlow callback.
   */
  createNetwork(seeders: ComponentID[], getFlow: GetFlow, postFlow: PostFlow = () => Promise.resolve()) {
    const network = new Network(this.workspace, seeders, getFlow, getWorkspaceGraph, postFlow);
    network.onWorkspaceLoaded((...args) => {
      this.emitter.emit('workspaceLoaded', args);
    });
    return network;
  }

  /**
   * Creates network which runs named flow according to project configuration.
   *
   * @param seeders array of components to build
   * @param name flow name
   * @param options
   */
  createNetworkByFlowName(seeders: ComponentID[], name = 'build', options: ExecutionOptions) {
    const getFlow = async (capsule: Capsule) => {
      const seed = capsule.component.id;
      const id = seed instanceof BitId ? seed : seed._legacy;
      const component = await this.workspace.get(seed);
      if (!component) {
        return new Flow([]);
      }
      const isCached = await getExecutionCache().compareToCache(capsule, name);
      const flowsConfig = component.config.extensions.findCoreExtension('flows')?.config;
      const tasks = flowsConfig && flowsConfig.tasks ? flowsConfig.tasks[name] : [];
      const flow = isCached && options.caching ? new Flow([]) : new Flow(tasks);

      return flow;
    };
    const postFlow = async (capsule: Capsule) => {
      const cache = getExecutionCache();
      return cache.saveHashValue(capsule, name);
    };
    return this.createNetwork(seeders, getFlow, postFlow);
  }

  /**
   * Executes named flow on network and returns a promise with network:result message.
   *
   * @param seeders array of components to build
   * @param name flow name
   * @param options
   * @param network optional custom network
   */
  async runToPromise(seeders: ComponentID[], name = 'build', options?: Partial<ExecutionOptions>, network?: Network) {
    logger.debug(`flowsExt, runToPromise is running ${name} on ${seeders.map((s) => s.toString()).join(', ')}`);
    const resultStream = await this.run(seeders, name, options, network);
    logger.debug(`flowsExt, runToPromise got resultStream`);
    return new Promise((resolve, reject) => {
      resultStream.subscribe({
        next(data: any) {
          if (data.type === 'network:result') {
            logger.debug(`flowsExt, runToPromise going to resolve the promise.`);
            resolve(data);
          } else {
            logger.debug(`flowsExt, runToPromise data.type is ${data.type}. the promise is not resolved nor rejected`);
          }
        },
        error(err: any) {
          logger.debug(`flowsExt, runToPromise going to reject the promise.`);
          reject(err);
        },
        complete() {
          logger.debug(`flowsExt, runToPromise in complete()`);
        },
      });
    });
  }

  /**
   * Executes named flow on network and returns an execution stream.
   *
   * @param seeders array of components to build
   * @param name flow name
   * @param options
   * @param network optional custom network
   */
  // @todo: @qballer please add return type
  async run(
    seeders: ComponentID[],
    name = 'build',
    options?: Partial<ExecutionOptions>,
    network?: Network
  ): Promise<any> {
    const opts: ExecutionOptions = Object.assign(
      {
        caching: true,
        concurrency: 4,
        traverse: 'both',
      },
      options
    );
    network = network || this.createNetworkByFlowName(seeders, name, opts);
    const resultStream = await network.execute(opts);
    return resultStream;
  }

  /**
   *  runs custom flow on network.
   *
   * @param flowsWithIds
   * @param options
   */
  async runMultiple(flowsWithIds: IdsAndFlows, options?: Partial<ExecutionOptions>) {
    const getFlow = (capsule: Capsule) => {
      const id = capsule.component.id;
      // @ts-ignore for some reason the capsule.component here is ConsumerComponent
      const value = flowsWithIds.getFlows(id);
      return Promise.resolve(new Flow(value || []));
    };

    const ids = flowsWithIds.map((withID) => new ComponentID(withID.id));
    const network = this.createNetwork(ids, getFlow);
    return this.runToPromise(ids, '', options || {}, network);
  }

  onWorkspaceLoaded(cb) {
    this.emitter.on('workspaceLoaded', cb);
  }
}

export class IdsAndFlows extends Array<{ id: BitId; value: string[] }> {
  getFlows(id: BitId): string[] | null {
    const found = this.find((item) => item.id.isEqual(id));
    return found ? found.value : null;
  }
  getFlowsIgnoreVersion(id: BitId): string[] | null {
    const found = this.find((item) => item.id.isEqualWithoutVersion(id));
    return found ? found.value : null;
  }
  getFlowsIgnoreScopeAndVersion(id: BitId): string[] | null {
    const found = this.find((item) => item.id.isEqualWithoutScopeAndVersion(id));
    return found ? found.value : null;
  }
  toString() {
    return this.map(({ id, value }) => `id: ${id}, task: ${value.join(', ')}`).join('; ');
  }
}
