import capsuleOrchestrator from '../network/orchestrator/orchestrator';
import { WorkspaceCapsules } from './types';
import { Component } from '../component';
import { CapsuleOrchestrator } from '../network/orchestrator/orchestrator';
import { ComponentCapsule } from '../capsule/component-capsule';
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
  }
}
