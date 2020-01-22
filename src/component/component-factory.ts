import { Capsule as CapsuleOrchestrator } from '../capsule';
import ConsumerComponent from '../consumer/component';
import Component from './component';
import State from './state';
import ComponentID from './id';

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
  fromLegacyComponent(legacyComponent: ConsumerComponent): Component {
    console.log(legacyComponent);
    return new Component(ComponentID.fromLegacy(legacyComponent.id), null, State.fromLegacy());
    // const state = new State();
    // return new Component(legacyComponent.id, );
  }
}
