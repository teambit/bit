import ComponentConfig from './component-config';
import { Hash } from 'crypto';
import ConsumerComponent from '../consumer/component';

/**
 * `Snap` represents the state of the component in the working tree.
 */
export default class ComponentState {
  constructor(
    /**
     * configuration of the component.
     */
    readonly config: ComponentConfig
  ) {}

  /**
   * Get a state representation by a legacy consumer component
   *
   * @static
   * @param {ConsumerComponent} consumerComponent
   * @returns {ComponentState}
   * @memberof ComponentState
   */
  static fromLegacyConsumerComponent(consumerComponent: ConsumerComponent): ComponentState {}

  /**
   * dependency graph of the component current. ideally package dependencies would be also placed here.
   */
  get dependencyGraph() {}
}
