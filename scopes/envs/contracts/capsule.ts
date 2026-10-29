import type { ComponentID } from '@teambit/component-id';
import type { Component } from './component';

/**
 * an isolated directory where a component is built.
 */
export interface Capsule {
  /**
   * absolute path of the capsule.
   */
  readonly path: string;

  readonly component: Component;
}

export interface CapsuleList extends Array<Capsule> {
  getCapsule(id: ComponentID): Capsule | undefined;
  getIdByPathInCapsule(pathInCapsule: string): ComponentID | null;
  getAllComponents(): Component[];
}

/**
 * the capsules of a build.
 */
export interface Network {
  /**
   * all capsules, including the dependencies of the seeders.
   */
  readonly graphCapsules: CapsuleList;

  /**
   * capsules of the components that were requested to build.
   */
  readonly seedersCapsules: CapsuleList;

  /**
   * seeders capsules before the capsules of other envs were filtered out.
   */
  readonly originalSeedersCapsules: CapsuleList;

  readonly capsulesRootDir: string;

  getCapsulesToCompile(): Promise<CapsuleList>;
}
