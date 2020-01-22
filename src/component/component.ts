import R from 'ramda';
import { FS as AnyFS } from '@teambit/any-fs';
import ComponentConfig from './component-config';
import ComponentFS from './component-fs';
import TagMap from './tag-map';
import { BitId as ComponentId } from '../bit-id';
import ConsumerComponent from '../consumer/component';
import { ModelComponent } from '../scope/models';
import Snap from './snap';
import ComponentState from './component-state';
import { Repository } from '../scope/objects';

/**
 * in-memory representation of a component. (initial concept)
 */
export default class Component {
  constructor(
    /**
     * component ID represented by the `ComponentId` type.
     */
    readonly id: ComponentId,

    /**
     * list of all component tags
     */
    readonly tags: TagMap = new TagMap(),

    /**
     * list of all component snaps
     */
    readonly snaps: Array<Snap> = [],

    /**
     * current version of the component in the file system
     */
    readonly _current: Snap | ComponentState = snaps[0]
  ) {}

  /**
   * Create a new instance of component based on a legacy consumer component and the component model
   *
   * @static
   * @param {ComponentId} componentId
   * @param {ConsumerComponent} [legacyConsumerComponent]
   * @param {ModelComponent} [legacyModelComponent]
   * @param {Repository} [repository]
   * @returns {Component}
   * @memberof Component
   */
  static async fromLegacy(
    componentId: ComponentId,
    legacyConsumerComponent?: ConsumerComponent,
    legacyModelComponent?: ModelComponent,
    repository?: Repository
  ): Promise<Component> {
    let current;
    const tags: TagMap = new TagMap();
    const snaps: Array<Snap> = [];
    if (legacyConsumerComponent) {
      current = ComponentState.fromLegacyConsumerComponent(legacyConsumerComponent);
    }
    if (legacyModelComponent && repository) {
      R.forEachObjIndexed(async (versionRef, versionId) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const version = await legacyModelComponent.loadVersion(versionId, repository);
        // TODO: Uncomment those lines when the Snap.fromVersionModel is implemented
        // const snap = Snap.fromVersionModel(version);
        // snaps.push(snap);
        // tags.set(versionId, snap);
      }, legacyModelComponent.versions);
    }
    return new Component(componentId, tags, snaps, current);
  }

  /**
   * component configuration which is later generated to a component `package.json` and `bit.json`.
   */
  get config(): ComponentConfig {
    return this.current.config;
  }

  /**
   * head version of the component. represented as an
   */
  readonly head: Snap = this.snaps[0];

  /**
   * current version of the component in the file system.
   */
  get current(): ComponentState {
    return this._current;
  }

  /**
   * in-memory representation of the component current filesystem.
   */
  get filesystem(): ComponentFS {
    return new ComponentFS();
  }

  /**
   * dependency graph of the component current. ideally package dependencies would be also placed here.
   */
  get dependencyGraph() {
    return this.head.dependencyGraph;
  }

  /**
   * record component changes in the `Scope`.
   */
  snap() {}

  /**
   * tag a component `Snap` with a semantic version. we follow SemVer specs as defined [here](https://semver.org/)).
   */
  tag() {}

  /**
   * determines whether this component is modified in the workspace.
   */
  isModified() {}

  /**
   * returns an object representing (diff?) all modifications applied on a component.
   */
  modifications() {}

  /**
   * checkout the component to a different version in its working tree.
   */
  checkout() {}

  /**
   * examine difference between two components.
   */
  diff(other: Component): any | undefined {
    // eslint-disable-line @typescript-eslint/no-unused-vars
    // TODO: remove the | undefined from return type when implement
    // TODO: add exact type when implement
    return undefined;
  }

  /**
   * merge two different components
   */
  merge(other: Component): Component | undefined {
    // eslint-disable-line @typescript-eslint/no-unused-vars
    // TODO: remove the | undefined from return type when implement
    return undefined;
  }

  /**
   * write a component to a given file system.
   * @param path root path to write the component
   * @param fs instance of any fs to use.
   */
  write(path: string, fs?: AnyFS) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  /**
   * transforms the component to a legacy `ComponentObjects` object. please do not use this method.
   */
  toLegacyComponentObjects() {}

  /**
   * transforms the component to a legacy `ConsumerComponent` object. please do not use this method.
   */
  toLegacyConsumerComponent() {}
}
