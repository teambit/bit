import CapsuleList from './capsule-list';
import Graph from '../../scope/graph/graph';
import { ComponentID } from '../component';
import { Capsule } from './capsule';

export class Network {
  constructor(public capsules: CapsuleList, public components: Graph, public seedersIds: ComponentID[]) {}

  get seedersCapsules(): Capsule[] {
    return this.seedersIds.map(seederId => {
      const capsule = this.capsules.getCapsule(seederId);
      if (!capsule) throw new Error(`unable to find ${seederId.toString()} in the capsule list`);
      return capsule;
    });
  }
}
