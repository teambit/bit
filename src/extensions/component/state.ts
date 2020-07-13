import Config from './config';
import { Store } from './store';
import ComponentFS from './component-fs';
import ConsumerComponent from '../../consumer/component';

export default class State {
  constructor(
    /**
     * component configuration which is later generated to a component `package.json` and `bit.json`.
     */
    readonly config: Config,

    /**
     * in-memory representation of the component current filesystem.
     */
    readonly filesystem: ComponentFS,

    /**
     * metadata store of the component
     */
    readonly store: Store,

    /**
     * dependency graph of the component current. ideally package dependencies would be also placed here.
     */
    // readonly dependencies: Dependencies
    readonly dependencies,

    readonly _consumer: ConsumerComponent
  ) {}

  /**
   * calculate the hash of this state
   */
  get hash() {
    return '';
  }

  dependencyGraph() {}

  static fromLegacy(consumerComponent: ConsumerComponent) {
    return new State(
      new Config(consumerComponent.extensions),
      ComponentFS.fromVinyls(consumerComponent.files),
      Store.fromArray([]),
      consumerComponent.dependencies,
      consumerComponent
    );
  }
}
