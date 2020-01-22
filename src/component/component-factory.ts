import { Capsule as CapsuleOrchestrator } from '../capsule';
import ConsumerComponent from '../consumer/component';
import Component from './component';

export default class ComponentFactory {
  constructor(
    /**
     * instance of the capsule orchestrator
     */
    private capsuleOrchestrator: CapsuleOrchestrator
  ) {}

  create() {}

  /**
   * instantiate a component object from a legacy `ComponentVersions` type object.
   */
  fromComponentVersions() {}

  /**
   * instantiate a component object from a legacy `ConsumerComponent` type object.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fromLegacyComponent(legacyComponent: ConsumerComponent): Component | undefined {
    // const state = new State();
    // return new Component(legacyComponent.id, );
    // TODO: remove the undefined from return value once implemented
    return undefined;
  }
}
