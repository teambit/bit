import { CreateConfig, WorkspaceCapsules } from './types';
import { Component } from '../component';
import { CapsuleOrchestrator } from './orchestrator/orchestrator';
import { ComponentCapsule } from '../capsule-ext';

export default class Capsule {
  constructor(
    /**
     * instance of the capsule orchestrator.
     */
    private orchestrator: CapsuleOrchestrator
  ) {}

  /**
   * create a new capsule from a component.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  create(component: Component, config: CreateConfig) {
    // @ts-ignore
    component.write();
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
}
