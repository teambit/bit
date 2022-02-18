import { ComponentID } from '@teambit/component';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import CapsuleList from './capsule-list';

export class Network {
  _originalSeeders: ComponentID[] | undefined;
  constructor(
    private _graphCapsules: CapsuleList,
    private seedersIds: ComponentID[],
    private _capsulesRootDir: string
  ) {}

  /**
   * for build-tasks (during bit build/tag/snap), this includes the component graph of the current env only.
   * otherwise, this includes the original components the network was created for.
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
   * for build-tasks (during bit build/tag/snap), this includes the original components of the current env.
   * otherwise, this is the same as `this.seedersCapsules()`.
   */
  get originalSeedersCapsules(): CapsuleList {
    const capsules = this.getOriginalSeeders().map((seederId) => {
      const capsule = this.graphCapsules.getCapsule(seederId);
      if (!capsule) throw new Error(`unable to find ${seederId.toString()} in the capsule list`);
      return capsule;
    });
    return CapsuleList.fromArray(capsules);
  }

  private getOriginalSeeders(): ComponentID[] {
    return this._originalSeeders || this.seedersIds;
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
