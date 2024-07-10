import { ComponentID } from '@teambit/component';
import { PathOsBasedAbsolute } from '@teambit/legacy.utils';
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
 *
 *
 * A more detailed explanation about the "seeders" vs "originalSeeders" vs "graphCapsules" is provided below:
 * an example: comp1 -> comp2 -> comp3 (as in comp1 uses comp2, comp2 uses comp3).
 * I changed only comp2.
 * From comp2 perspective, comp1 is a “dependent”, comp3 is a “dependency”.
 *
 * When I run bit build with no args, it finds only one modified component: comp2, however, it doesn’t stop here. It also look for the dependents, in this case, comp1. So the seeders of this bit-build command are two: “comp1” and “comp2".
 * The reason why the dependents are included is because you modified comp2, it’s possible you broke comp1. We want to build comp1 as well to make sure it’s still okay.
 * (btw, bit test command also include dependents when it provided with no args).
 *
 * Keep in mind that also bit tag normally runs on the dependents as well (when it runs the build pipeline), because these are the “auto-tag”.
 * With these two seeders it builds the graph. The graph calculates all the dependencies of the given seeders recursively. Eventually, it puts them in an instance of Network class.
 * In our case, if all components use the same env, the Network consist of:
 * seedersCapsules:          [comp1, comp2]
 * originalSeedersCapsules:  [comp1, comp2]
 * graphCapsules:            [comp1, comp2, comp3].
 *
 * It gets more complex when multiple envs involved.
 * Imagine that comp1 uses env1, comp2 uses env2 and comp3 uses env3.
 * Because bit build runs the tasks per env, it needs to create 3 networks. Each per env.
 * The “seeders” refer to the seeders of the same env and includes only components from the same env.
 * The “originalSeeders” refer to the ones that originally started the build command and are from the same env.
 * Network1:
 * seedersCapsules:          [comp1]
 * originalSeedersCapsules:  [comp1]
 * graphCapsules:            [comp1, comp2, comp3].
 * Network2:
 * seedersCapsules:          [comp2]
 * originalSeedersCapsules:  [comp2]
 * graphCapsules:            [comp2, comp3].
 * Network3:
 * seedersCapsules:          [comp3]
 * originalSeedersCapsules:  []
 * graphCapsules:            [comp3].
 * As you can see, in network3, the originalSeeders is empty, because comp3 wasn’t part of the original seeders.
 * These 3 networks are created for build-pipeline. This pipeline asks for all components in the graph and then create the network per env.
 * Snap/Tag pipelines are different. They ask only for the components about to tag/snap, which are the original-seeders, and create the network per env. For them, we end up with 2 network instances only. network1 and network2. Also, the seedersCapsules and originalSeedersCapsules are the same because we create the network instances out of the seeders only, without the dependencies.
 * A build-task provides context with a network instance to the execute() method. (it also provide Component[] which are the “seeders”. not “originalSeeders”).
 *
 * Each build-task can decide on what components to operate. It has 3 options:
 * run on graphCapsules. If you do that, you risk running your task multiple times on the same components. In the example above, a task of build-pipeline, will run 3 times on comp3, because this component is part of the graphCapsules in each one of the network instance. So this is probably not recommended for most tasks.
 * run on seedersCapsules. With this option you make sure that your task is running for each one of the capsules and it runs only once. This is good for example for the compiler task. It needs to make sure all capsules are built. Otherwise, if it’s running only on originalSeedersCapsules, the comp3 won’t be compiled, the dists will be missing and comp2 won’t be able to run its tests.
 * run on originalSeedersCapsules . With this option you ensure that your task runs only on the ids you started with and you don’t run them on the dependencies. This is the option that most tasks probably need. An example is the test task, it should test only the seeders, no need to test the dependencies.
 *
 * Again, the distinction between seedersCapsules and originalSeedersCapsules is relevant for build-pipeline only. For tag-pipeline and snap-pipeline, these two are the same. You can see for example that Publisher task runs on seedersCapsules and that’s fine, it won’t be running on dependencies unexpectedly, only on the components it’s now tagging.
 */
export class Network {
  _originalSeeders: ComponentID[] | undefined;
  constructor(
    private _graphCapsules: CapsuleList,
    private seedersIds: ComponentID[],
    private _capsulesRootDir: string
  ) {}

  /**
   * for non build-tasks, this includes the original components the network was created for.
   *
   * for build-tasks (during bit build/tag/snap), this `Network` instance is created per env, and it depends on the pipeline.
   * build-pipeline: includes the component graph (meaning include the dependencies) of the current env.
   * snap/tag pipeline: it's the same as `this.originalSeedersCapsules`. it includes only the original to
   * tag/snap/build of the current env.
   *
   * for example comp1 of env1 is using comp2 of env2. when running build/tag/snap on comp1 only, two networks are created
   * for build pipeline:
   * network1: seedersCapsules: [comp1], originalSeedersCapsules: [comp1], graphCapsules: [comp1, comp2]
   * network2: seedersCapsules: [comp2], originalSeedersCapsules: [], graphCapsules: [comp2]
   *
   * for snap/tag pipeline, only network1 is created, and it includes only the originalSeedersCapsules.
   *
   * see the description of this Network class for more info.
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
   * for non build-tasks, this is the same as `this.seedersCapsules`, which includes the original components the
   * network was created for.
   *
   * for build-tasks (during bit build/tag/snap), this includes the component to build/tag/snap of the current env.
   * see the description of this Network class for more info.
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
        const capsuleUsePreviouslySavedDists = await CapsuleList.capsuleUsePreviouslySavedDists(
          seederCapsule.component
        );
        return capsuleUsePreviouslySavedDists ? null : seederCapsule;
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
