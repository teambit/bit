import { Workspace } from '../workspace';
import { Network, GetFlow } from './network';
import { ComponentID } from '../component';
import { Flow } from './flow/flow';

export class Flows {
  constructor(private workspace: Workspace) {}

  createNetwork(seeders: ComponentID[], getFlow: GetFlow) {
    return new Network(this.workspace, seeders, getFlow);
  }

  createNetworkByFlowName(seeders: ComponentID[], name = 'build') {
    const getFlow = async (seed: ComponentID) => {
      const component = await this.workspace.get(seed._legacy);
      if (!component) {
        return new Flow([]);
      }
      const tasks = component.config.extensions.flows[name] || [];
      const flow = new Flow(tasks);
      return flow;
    };
    return this.createNetwork(seeders, getFlow);
  }
}

const network = ({} as Flows).createNetworkByFlowName([]);
// eslint-disable-next-line promise/catch-or-return
network
  .execute({
    traverse: 'both',
    caching: true,
    concurrency: 5
  })
  .then(subject => {
    subject.subscribe({
      next(data: any) {
        if (data.type === 'network:start') {
          //
        } else if (data.type === 'network:result') {
          //
        }
      },
      complete() {}
    });
  })
  .catch(e => e);
