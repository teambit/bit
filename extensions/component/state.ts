import ComponentFS from './component-fs';
import Config from './config';
import { AspectList } from './aspect-list';

export class State {
  constructor(
    /**
     * component configuration which is later generated to a component `package.json` and `bit.json`.
     * @deprecated
     */
    readonly config: Config,

    /**
     * list of aspects configured on the component.
     */
    readonly aspects: AspectList,

    /**
     * in-memory representation of the component current filesystem.
     */
    readonly filesystem: ComponentFS,

    /**
     * dependency graph of the component current. ideally package dependencies would be also placed here.
     */
    // readonly dependencies: Dependencies
    readonly dependencies,

    /**
     * instance of legacy consumer component.
     */
    readonly _consumer: any
  ) {}

  /**
   * calculate the hash of this state
   */
  get hash() {
    return '';
  }

  // static fromLegacy(consumerComponent: ConsumerComponent) {
  //   return new State(
  //     new Config(consumerComponent.mainFile, consumerComponent.extensions),
  //     consumerComponent.version || 'new',
  //     ComponentFS.fromVinyls(consumerComponent.files),
  //     Store.fromArray([]),
  //     consumerComponent.dependencies,
  //     consumerComponent
  //   );
  // }
}
