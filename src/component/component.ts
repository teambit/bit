import { FS as AnyFS } from '@teambit/any-fs';
import { SemVer } from 'semver';
import ComponentConfig from './component-config';
import ComponentFS from './component-fs';
import TagMap from './tag-map';
import { BitId as ComponentID } from '../bit-id';
import Snap from './snap';

/**
 * in-memory representation of a component. (initial concept)
 */
export default class Component {
  constructor(
    /**
     * component ID represented by the `ComponentID` type.
     */
    readonly id: ComponentID,

    /**
     * head version of the component. represented as an
     */
    readonly head: Snap,

    /**
     * list of all component tags
     */
    readonly tags: TagMap = new TagMap()
  ) {}

  /**
   * component configuration which is later generated to a component `package.json` and `bit.json`.
   */
  get config(): ComponentConfig {
    return this.current.config;
  }

  private _current: Snap = this.head;

  /**
   * current version of the component in the file system.
   */
  get current() {
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
    return this.current.dependencyGraph;
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
  diff(other: Component): Difference {}

  /**
   * merge two different components
   */
  merge(other: Component): Component {}

  /**
   * write a component to a given file system.
   * @param path root path to write the component
   * @param fs instance of any fs to use.
   */
  write(path: string, fs?: AnyFS) {}

  /**
   * transforms the component to a legacy `ComponentObjects` object. please do not use this method.
   */
  toLegacyComponentObjects() {}

  /**
   * transforms the component to a legacy `ConsumerComponent` object. please do not use this method.
   */
  toLegacyConsumerComponent() {}
}
