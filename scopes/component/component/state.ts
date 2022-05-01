import { IssuesList } from '@teambit/component-issues';
import { ComponentID } from '@teambit/component-id';
import ComponentFS from './component-fs';
import Config from './config';
import { AspectList } from './aspect-list';
import { MainFileNotFound } from './exceptions';

export class State {
  constructor(
    /**
     * component configuration which is later generated to a component `package.json` and `bit.json`.
     * @deprecated please use `aspects` instead.
     */
    readonly config: Config,

    /**
     * list of aspects configured on the component.
     */
    private _aspects: AspectList,

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
   * get the main file of the component.
   */
  get mainFile() {
    const file = this.filesystem.files.find((componentFile) => {
      return componentFile.relative === this._consumer.mainFile;
    });

    if (!file) throw new MainFileNotFound(ComponentID.fromLegacy(this._consumer.id), this._consumer.mainFile);

    return file;
  }

  /**
   * calculate the hash of this state
   */
  get hash() {
    return '';
  }

  get issues(): IssuesList {
    return (this._consumer.issues ||= new IssuesList());
  }

  /**
   * @deprecated please use `component.isModified`.
   * the way it's implemented here is unreliable and will only work if in the legacy the "isModified" was calculated.
   */
  get isModified(): boolean {
    return this._consumer._isModified;
  }

  get aspects(): AspectList {
    return this._aspects;
  }

  set aspects(aspects: AspectList) {
    this._aspects = aspects;
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
