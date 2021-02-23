import { ComponentID } from '@teambit/component';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import CapsuleList from './capsule-list';

export class Network {
  constructor(
    private _graphCapsules: CapsuleList,
    private seedersIds: ComponentID[],
    private _capsulesRootDir: string
  ) {}

  /**
   * seeders capsules only without the entire graph. normally, this includes the capsules of one
   * env.
   */
  get seedersCapsules(): CapsuleList {
    const capsules = this.seedersIds.map((seederId) => {
      const capsule = this.graphCapsules.getCapsule(seederId);
      if (!capsule) throw new Error(`unable to find ${seederId.toString()} in the capsule list`);
      return capsule;
    });
    return CapsuleList.fromArray(capsules);
  }

  /**
   * all capsules, including the dependencies of the seeders. (even when they belong to another env)
   */
  get graphCapsules(): CapsuleList {
    return this._graphCapsules;
  }

  get capsulesRootDir(): PathOsBasedAbsolute {
    return this._capsulesRootDir;
  }
}
