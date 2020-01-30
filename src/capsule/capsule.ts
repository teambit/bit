import capsuleOrchestrator from './orchestrator/orchestrator';
import { CreateConfig, WorkspaceCapsules } from './types';
import { Component } from '../extensions/component';
import { CapsuleOrchestrator } from './orchestrator/orchestrator';
import { ComponentCapsule } from '../capsule-ext';
import CapsuleBuilder from '../environment/capsule-builder';

export default class CapsuleFactory {
  constructor(
    /**
     * instance of the capsule orchestrator.
     */
    private orchestrator: CapsuleOrchestrator,

    readonly legacyBuilder: CapsuleBuilder
  ) {}

  /**
   * create a new capsule from a component.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  create(components: Component[], config?: CreateConfig) {
    return this.legacyBuilder.isolateComponents(components.map(component => component.id.toString()));
  }

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

  static async provide() {
    await capsuleOrchestrator.buildPools();
    return new CapsuleFactory(capsuleOrchestrator, new CapsuleBuilder('any'));
  }
}
