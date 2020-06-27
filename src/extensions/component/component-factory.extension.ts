/* eslint-disable max-classes-per-file */
import { IsolatorExtension } from '../isolator';
import ConsumerComponent from '../../consumer/component';
import Component from './component';
import State from './state';
import ComponentID from './id';

export type ConfigFunc = () => any;

export default class ComponentFactory {
  static id = '@teambit/component';
  static dependencies = [IsolatorExtension];

  constructor(
    /**
     * instance of the capsule orchestrator
     */
    private isolateEnv: IsolatorExtension // private configsRegistry: Registry
  ) {}

  create() {}

  /**
   * instantiate a component object from a legacy `ConsumerComponent` type object.
   */
  fromLegacyComponent(legacyComponent: ConsumerComponent): Component {
    return new Component(ComponentID.fromLegacy(legacyComponent.id), null, State.fromLegacy(legacyComponent));
  }

  static async provider([isolator]: [IsolatorExtension]) {
    return new ComponentFactory(isolator);
  }
}
