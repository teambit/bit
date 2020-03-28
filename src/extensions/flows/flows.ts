/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-classes-per-file */
import { path } from 'ramda';
import { Workspace } from '../workspace';
import { Network, GetFlow } from './network';
import { ComponentID } from '../component';
import { Flow } from './flow/flow';
import BitIdAndValueArray from '../../bit-id/bit-id-and-value-array';
import { ExecutionOptions } from './network/options';
import { BitId } from '../../bit-id';
import { Capsule } from '../isolator/capsule';

export class Flows {
  constructor(private workspace: Workspace) {}

  getIds(ids: string[]) {
    return ids.map(id => new ComponentID(this.workspace.consumer.getParsedId(id)));
  }
  createNetwork(seeders: ComponentID[], getFlow: GetFlow) {
    return new Network(this.workspace, seeders, getFlow);
  }

  createNetworkByFlowName(seeders: ComponentID[], name = 'build') {
    const getFlow = async (seed: ComponentID | BitId) => {
      const id = seed instanceof BitId ? seed : seed._legacy;
      const component = await this.workspace.get(id);
      if (!component) {
        return new Flow([]);
      }
      // const tasks = component.config.extensions.flows[name] || [];
      const tasks = path(['config', 'extensions', 'flows', name], component) || [];
      const flow = new Flow(tasks);
      return flow;
    };
    return this.createNetwork(seeders, getFlow);
  }

  async run(seeders: ComponentID[], name = 'build', options?: Partial<ExecutionOptions>, network?: Network) {
    network = network || this.createNetworkByFlowName(seeders, name);
    const opts = Object.assign(
      {
        caching: true,
        concurrency: 4,
        traverse: 'both'
      },
      options
    );
    const resultStream = await network.execute(opts);
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

  async runMultiple(flowsWithIds: IdsAndFlows, capsules: Capsule[], options?: Partial<ExecutionOptions>) {
    const getFlow = (id: ComponentID) => {
      const value = flowsWithIds.getValue(id._legacy);
      return Promise.resolve(new Flow(value || []));
    };
    const ids = flowsWithIds.map(withID => new ComponentID(withID.id));
    const network = this.createNetwork(ids, getFlow);
    return this.run(ids, '', options || {}, network);
  }
}

export class IdsAndFlows extends BitIdAndValueArray<string[]> {}
