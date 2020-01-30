import { SemVer } from 'semver';
import { AnyFS } from '@teambit/any-fs';
import { NothingToSnap } from './exceptions';
import ComponentConfig from './config';
import ComponentFS from './component-fs';
import TagMap from './tag-map';
import ComponentID from './id';
import State from './state';
import Snap, { Author } from './snap';
import Capsule from '../environment/capsule-builder';
import { NodeData } from 'cleargraph';

/**
 * in-memory representation of a component.
 */
export default class Component implements NodeData {
  constructor(
    /**
     * component ID represented by the `ComponentId` type.
     */
    readonly id: ComponentID,

    /**
     * head version of the component. can be `null` for new components.
     */
    readonly head: Snap | null = null,

    /**
     * state of the component.
     */
    readonly state: State,

    /**
     * list of all component tags
     */
    readonly tags: TagMap = new TagMap(),

    private capsuleOrchestrator: Capsule
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
   * dependency graph of the component current. ideally package dependencies would be also placed
   * here through an external extension.
   */
  async graph() {
    return this.state.dependencies;
  }

  /*
   * isolates the component in a capsule.
   */
  async isolate() {
    const id = this.id.toString();
    const capsules = await this.capsuleOrchestrator.isolateComponents([id]);
    return capsules[id];
  }

  /**
   * record component changes in the `Scope`.
   */
  snap(author: Author, message = '') {
    if (!this.isModified()) throw new NothingToSnap();
    const snap = Snap.create(this, author, message);

    return new Component(this.id, snap, snap.state, this.tags, this.capsuleOrchestrator);
  }

  /**
   * tag a component `Snap` with a semantic version. we follow SemVer specs as defined [here](https://semver.org/)).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tag(version: SemVer) {
    // const snap = this.snap();
    // const tag = new Tag(version, snap);
    // this.tags.set(tag);
  }

  /**
   * determines whether this component is modified in the workspace.
   */
  isModified() {
    if (!this.head) return true;
    return this.state.hash !== this.head.hash;
  }

  /**
   * determines whether this component is new.
   */
  isNew() {
    return this.head === null;
  }

  /**
   * checkout the component to a different version in its working tree.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  write(path: string, fs?: AnyFS) {}

  /**
   * transforms the component to a legacy `ComponentObjects` object. please do not use this method.
   */
  toLegacyComponentObjects() {}

  /**
   * transforms the component to a legacy `ConsumerComponent` object. please do not use this method.
   */
  toLegacyConsumerComponent() {}

  /**
   *
   * Check if 2 components are equal
   * @param {Component} component
   * @returns {boolean}
   * @memberof Component
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  equals(component: Component): boolean {
    return true;
  }
}
