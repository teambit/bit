import capsuleOrchestrator from '../network/orchestrator/orchestrator';
import { WorkspaceCapsules } from './types';
import { Component } from '../component';
import { CapsuleOrchestrator } from '../network/orchestrator/orchestrator';
import { ComponentCapsule } from '../capsule/component-capsule';
// import CapsuleBuilder from '../network/capsule-builder';
import { CapsuleOptions } from '../network/orchestrator/types';
import { PackageManager } from '../package-manager';

export type CapsuleFactoryDeps = [PackageManager];

export default class CapsuleFactory {
  constructor(
    /**
     * instance of the capsule orchestrator.
     */
    readonly orchestrator: CapsuleOrchestrator // readonly builder: CapsuleBuilder
  ) {}

  /**
   * create a new capsule from a component.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //   create(components: Component[], config?: CapsuleOptions) {
  //     return this.builder.isolateComponents(
  //       components.map(component => component.id.toString()),
  //       config
  //     );
  //   }
  /**
   * list all of the existing workspace capsules.
   */
  list(): ComponentCapsule[] {
    return [];
  }

  /**
   * list capsules from all workspaces.
   */
  listAll(): WorkspaceCapsules {
    // @ts-ignore
    return '';
  }

  static async provide(config: any, [packageManager]: any) {
    await capsuleOrchestrator.buildPools();
    return new CapsuleFactory(capsuleOrchestrator);
    // return new CapsuleFactory(capsuleOrchestrator, new CapsuleBuilder('any', packageManager));
  }
}
