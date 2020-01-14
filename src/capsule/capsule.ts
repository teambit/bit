import { CreateConfig, WorkspaceCapsules } from './types';
import { Component } from '../component';
import { CapsuleOrchestrator } from './orchestrator/orchestrator';
import capsuleExtension from 'environment/capsule.extension';

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
  create(component: Component, config: CreateConfig) {
    component.write(capsuleFs);
  }

  /**
   * list all of the existing workspace capsules.
   */
  list(): ComponentCapsule[] {}

  /**
   * list capsules from all workspaces.
   */
  listAll(): WorkspaceCapsules {}
}
