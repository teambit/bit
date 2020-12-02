import { AnyFS } from '@teambit/any-fs';
import { capitalize } from '@teambit/string.capitalize';
import { SemVer } from 'semver';

import { ComponentFactory } from './component-factory';
import ComponentFS from './component-fs';
// import { NothingToSnap } from './exceptions';
import ComponentConfig from './config';
// eslint-disable-next-line import/no-cycle
import { ComponentID } from './id';
// eslint-disable-next-line import/no-cycle
import { Snap } from './snap';
import { State } from './state';
import { TagMap } from './tag-map';
// import { Author } from './types';

/**
 * in-memory representation of a component.
 */
export class Component {
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
    private _state: State,

    /**
     * tags of the component.
     */
    readonly tags: TagMap = new TagMap(),

    /**
     * the component factory
     */
    private factory: ComponentFactory
  ) {}

  get state(): State {
    return this._state;
  }

  set state(state: State) {
    this._state = state;
  }

  /**
   * component configuration which is later generated to a component `package.json` and `bit.json`.
   */
  get config(): ComponentConfig {
    return this.state.config;
  }

  /**
   * in-memory representation of the component current filesystem.
   */
  get filesystem(): ComponentFS {
    return this.state.filesystem;
  }

  get headTag() {
    if (!this.head) return undefined;
    return this.tags.byHash(this.head.hash);
  }

  get latest(): string | undefined {
    if (!this.head) return undefined;
    return this.tags.getLatest();
  }

  stringify(): string {
    return JSON.stringify({
      id: this.id,
      head: this.head,
    });
  }

  /**
   * record component changes in the `Scope`.
   */
  // snap(author: Author, message = '') {
  // if (!this.isModified()) throw new NothingToSnap();
  // const snap = new Snap(this, author, message);

  // return new Component(this.id, snap, snap.state);
  // }

  /**
   * display name of the component.
   */
  get displayName() {
    const tokens = this.id.name.split('-').map((token) => capitalize(token));
    return tokens.join(' ');
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
  isModified(): Promise<boolean> {
    if (!this.head) return Promise.resolve(true);
    return Promise.resolve(this.state.isModified);
    // return Promise.resolve(this.state.hash !== this.head.hash);
  }

  /**
   * determines whether this component is new.
   */
  isNew(): Promise<boolean> {
    return Promise.resolve(this.head === null);
  }

  // TODO: @david after snap we need to make sure to refactor here.
  loadState(snapId: string): Promise<State> {
    return this.factory.getState(this.id, snapId);
  }

  /**
   * checkout the component to a different version in its working tree.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  checkout(version: SemVer) {}

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
   *
   * Check if 2 components are equal
   * @param {Component} component
   * @returns {boolean}
   * @memberof Component
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  equals(component: Component): boolean {
    return component.id.toString() === this.id.toString();
  }
}
