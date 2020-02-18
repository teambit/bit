import ComponentConfig from './config';
import ConsumerComponent from '../../consumer/component';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static fromLegacyConsumerComponent(consumerComponent: ConsumerComponent): ComponentState | undefined {
    // TODO: remove the | undefined when implementing
    return undefined;
  }

  /**
   * dependency graph of the component current. ideally package dependencies would be also placed here.
   */
  dependencyGraph() {
    // return buildOneGraphForComponents();
  }
}
