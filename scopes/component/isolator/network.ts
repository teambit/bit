import { ComponentID } from '@teambit/component';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import { compact } from 'lodash';
import CapsuleList from './capsule-list';

/**
 * collection of isolated components (capsules).
 * normally, "seeders" are the components that this network was created for.
 * "graphCapsules" is the graph created from the seeders and it includes also the dependencies.
 *
 * however, during "bit build"/"bit tag"/"bit snap", things are more complex because there is one more variable in the
 * picture, which is the "env". the Network is created per env.
 * in practice, for "build-task", a task is called per env, and the network passed to the task is relevant to that env.
 * the "originalSeeders" are the ones the network was created for, but only for this env.
 * the "seeders" are similar to the "graphCapsules" above, which contains also the dependencies, but only for this env.
 * the "graphCapsules" is the entire graph, including capsules from other envs.
 *
 * for example:
 * comp1 depends on comp2. comp1 env is "react". comp2 env is "aspect".
 *
 * when the user is running "bit build comp1", two `Network` instances will be created with the following:
 * Network for "react" env:  originalSeeders: ['comp1'], seeders: ['comp1'], graphCapsules: ['comp1', 'comp2'].
 * Network for "aspect" env: originalSeeders: [], seeders: ['comp2'], graphCapsules: ['comp2'].
 *
 * on the other hand, when the user is running "bit capsule create comp1", only one `Network` instance is created:
 * Network: originalSeeders: ['comp1'], seeders: ['comp1'], graphCapsules: ['comp1', 'comp2'].
 *
 * (as a side note, another implementation was attempt to have the "seeders" as the original-seeders for build,
 * however, it's failed. see https://github.com/teambit/bit/pull/5407 for more details).
 */
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

  /**
   * some of the capsules (non-modified) are written already with the dists files, so no need to re-compile them.
   * this method helps optimizing compilers that are running on the capsules.
   */
  async getCapsulesToCompile() {
    const originalSeedersCapsules = this.originalSeedersCapsules;
    const capsules = await Promise.all(
      this.seedersCapsules.map(async (seederCapsule) => {
        if (originalSeedersCapsules.getCapsule(seederCapsule.component.id)) {
          return seederCapsule;
        }
        const isModified = await seederCapsule.component.isModified();
        const shouldCompile = isModified || seederCapsule.component.buildStatus !== 'succeed';
        return shouldCompile ? seederCapsule : null;
      })
    );
    return CapsuleList.fromArray(compact(capsules));
  }

  /**
   * originalSeeders are not always set (currently, only during build process), so if they're missing, just provide the
   * seeders, which are probably the original-seeders
   */
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
