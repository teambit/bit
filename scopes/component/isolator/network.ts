import { ComponentID } from '@teambit/component';
import Graph from 'bit-bin/dist/scope/graph/graph';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';

/**
 * todo: this class is confusing.
 * it has the entire graph including the dependencies of the seeder components.
 * the `capsules` should be maybe `capsuleListOfEntireGraph`, and `seederCapsules` should be `capsules`.
 * Also, the CapsuleList should be refactored to be just Array<Capsule>.
 */
export class Network {
  constructor(
    /**
     * all capsules, including the dependencies of the seeders.
     */
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
