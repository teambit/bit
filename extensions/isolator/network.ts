import { ComponentID } from '@teambit/component';
import Graph from 'bit-bin/dist/scope/graph/graph';

import { Capsule } from './capsule';
import CapsuleList from './capsule-list';

export class Network {
  constructor(
    public capsules: CapsuleList,
    public components: Graph,
    public seedersIds: ComponentID[],
    public capsulesRootDir: string
  ) {}

  get seedersCapsules(): Capsule[] {
    return this.seedersIds.map((seederId) => {
      const capsule = this.capsules.getCapsule(seederId);
      if (!capsule) throw new Error(`unable to find ${seederId.toString()} in the capsule list`);
      return capsule;
    });
  }
}
