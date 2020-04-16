/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-classes-per-file */
import { path } from 'ramda';
import { EventEmitter } from 'events';
import { Workspace } from '../workspace';
import { Network, GetFlow } from './network';
import { ComponentID } from '../component';
import { Flow } from './flow/flow';
import BitIdAndValueArray from '../../bit-id/bit-id-and-value-array';
import { ExecutionOptions } from './network/options';
import { BitId } from '../../bit-id';
import { Capsule } from '../isolator/capsule';
import { PostFlow, getWorkspaceGraph } from './network/network';
import { getExecutionCache } from './cache';

export class Flows {
  private emitter = new EventEmitter();
  constructor(private workspace: Workspace) {}

  getIds(ids: string[]) {
    return ids.map(id => new ComponentID(this.workspace.consumer.getParsedId(id)));
  }
  createNetwork(seeders: ComponentID[], getFlow: GetFlow, postFlow: PostFlow) {
    const network = new Network(this.workspace, seeders, getFlow, getWorkspaceGraph, postFlow);
    network.onWorkspaceLoaded((...args) => {
      this.emitter.emit('workspaceLoaded', args);
    });
    return network;
  }

  createNetworkByFlowName(seeders: ComponentID[], name = 'build', options: ExecutionOptions) {
    const getFlow = async (capsule: Capsule) => {
      const seed = capsule.component.id;
      const id = seed instanceof BitId ? seed : seed._legacy;
      const component = await this.workspace.get(id);
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

  async run(seeders: ComponentID[], name = 'build', options?: Partial<ExecutionOptions>, network?: Network) {
    const resultStream = await this.runStream(seeders, name, options, network);
    return new Promise((resolve, reject) => {
      resultStream.subscribe({
        next(data: any) {
          if (data.type === 'network:result') {
            resolve(data);
          }
        },
        error(err: any) {
          reject(err);
        },
        complete() {}
      });
    });
  }

  async runStream(seeders: ComponentID[], name = 'build', options?: Partial<ExecutionOptions>, network?: Network) {
    const opts: ExecutionOptions = Object.assign(
      {
        caching: true,
        concurrency: 4,
        traverse: 'both'
      },
      options
    );
    network = network || this.createNetworkByFlowName(seeders, name, opts);
    const resultStream = await network.execute(opts);
    return resultStream;
  }

  async runMultiple(flowsWithIds: IdsAndFlows, options?: Partial<ExecutionOptions>) {
    const getFlow = (capsule: Capsule) => {
      const id = capsule.component.id;
      // @ts-ignore for some reason the capsule.component here is ConsumerComponent
      const value = flowsWithIds.getValue(id);
      return Promise.resolve(new Flow(value || []));
    };
    const postFlow = (_capsule: Capsule) => Promise.resolve();

    const ids = flowsWithIds.map(withID => new ComponentID(withID.id));
    const network = this.createNetwork(ids, getFlow, postFlow);
    return this.run(ids, '', options || {}, network);
  }

  onWorkspaceLoaded(cb) {
    this.emitter.on('workspaceLoaded', cb);
  }
}

export class IdsAndFlows extends BitIdAndValueArray<string[]> {}
