import { SemVer } from 'semver';
import { FS as AnyFS } from '@teambit/any-fs';
import { NothingToSnap } from './exceptions';
import ComponentConfig from './config';
import ComponentFS from './component-fs';
import TagMap from './tag-map';
import { BitId as ComponentID } from '../bit-id';
import State from './state';
import Tag from './tag';
import Snap, { Author } from './snap';

/**
 * in-memory representation of a component. (initial concept)
 */
export default class Component {
  constructor(
    /**
     * component ID represented by the `ComponentId` type.
     */
    readonly id: ComponentID,

    /**
     * head version of the component. represented as an
     */
    readonly head: Snap,

    /**
     * list of all component tags
     */
    readonly tags: TagMap = new TagMap(),

    /**
     * state of the component.
     */
    readonly state: State = head.state
  ) {}

  /**
   * component configuration which is later generated to a component `package.json` and `bit.json`.
   */
  get config(): ComponentConfig {
    return this.config;
  }

  /**
   * in-memory representation of the component current filesystem.
   */
  get filesystem(): ComponentFS {
    return this.state.filesystem;
  }

  /**
   * dependency graph of the component current. ideally package dependencies would be also placed here.
   */
  get dependencyGraph() {
    return this.state.dependencyGraph;
  }
  /**
   * record component changes in the `Scope`.
   */
  snap(author: Author, message = '') {
    if (!this.isModified()) throw new NothingToSnap();
    const snap = Snap.create(this, author, message);
  }

  /**
   * tag a component `Snap` with a semantic version. we follow SemVer specs as defined [here](https://semver.org/)).
   */
  tag(version: SemVer) {
    // const snap = this.snap();
    // const tag = new Tag(version, snap);
    // this.tags.set(tag);
  }

  /**
   * determines whether this component is modified in the workspace.
   */
  isModified() {
    return this.state.hash !== this.head.hash;
  }

  /**
   * checkout the component to a different version in its working tree.
   */
  checkout(version: SemVer) {
    // const version = this.tags.get(version);
  }

  /**
   * examine difference between two components.
   */
  // diff(other: Component): Difference {}

  /**
   * merge two different components
   */
  // merge(other: Component): Component {}

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
