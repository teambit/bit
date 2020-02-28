import Capsule from '../network/capsule-builder';
import ConsumerComponent from '../../consumer/component';
import Component from './component';
import State from './state';
import ComponentID from './id';

export default class ComponentFactory {
  constructor(
    /**
     * instance of the capsule orchestrator
     */
    private capsuleOrchestrator: Capsule
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
    return new Component(
      ComponentID.fromLegacy(legacyComponent.id),
      null,
      State.fromLegacy(legacyComponent),
      undefined,
      this.capsuleOrchestrator
    );
  }
}
