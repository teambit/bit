import { AnyFS } from '@teambit/any-fs';
import { capitalize } from '@teambit/toolbox.string.capitalize';
import { SemVer } from 'semver';
import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import { BuildStatus } from '@teambit/legacy.constants';
import { ComponentLog } from '@teambit/scope.objects';
import type { DependencyList } from '@teambit/dependency-resolver';
import { slice } from 'lodash';
import { ComponentFactory } from './component-factory';
import ComponentFS from './component-fs';
// import { NothingToSnap } from './exceptions';
import { Config as ComponentConfig } from './config';
// eslint-disable-next-line import/no-cycle
import { Snap } from './snap';
import { State } from './state';
import { TagMap } from './tag-map';
import { Tag } from './tag';
import { CouldNotFindLatest } from './exceptions';
import { IComponent, RawComponentMetadata } from './component-interface';
// import { Author } from './types';

type SnapsIterableOpts = {
  firstParentOnly?: boolean;
  stopFn?: (snap: Snap) => Promise<boolean>;
};

export type InvalidComponent = { id: ComponentID; err: Error };

/**
 * in-memory representation of a component.
 */
export class Component implements IComponent {
  constructor(
    /**
     * component ID represented by the `ComponentId` type.
     */
    readonly id: ComponentID,

    /**
     * head version of the component. can be `null` for new components.
     * if on main, returns the head on main.
     * if on a lane, returns the head on the lane.
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

  get mainFile() {
    return this.state.mainFile;
  }

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

  /**
   * build status of the component
   */
  get buildStatus(): BuildStatus {
    return this._state._consumer.buildStatus;
  }

  get homepage(): string | undefined {
    return this._state._consumer._getHomepage();
  }

  get headTag() {
    if (!this.head) return undefined;
    return this.tags.byHash(this.head.hash);
  }

  get latest(): string | undefined {
    if (!this.head) return undefined;
    try {
      return this.tags.getLatest();
    } catch (err: any) {
      if (err instanceof CouldNotFindLatest) {
        return this.head.hash;
      }
      throw err;
    }
  }

  /**
   * get aspect data from current state.
   */
  get(id: string): RawComponentMetadata | undefined {
    return this.state.aspects.get(id)?.serialize();
  }

  async getLogs(filter?: {
    type?: string;
    offset?: number;
    limit?: number;
    head?: string;
    sort?: string;
  }): Promise<ComponentLog[]> {
    const allLogs = await this.factory.getLogs(this.id, false, filter?.head);

    if (!filter) return allLogs;

    const { type, limit, offset, sort } = filter;

    const typeFilter = (snap) => {
      if (type === 'tag') return snap.tag;
      if (type === 'snap') return !snap.tag;
      return true;
    };

    let filteredLogs = (type && allLogs.filter(typeFilter)) || allLogs;
    if (sort !== 'asc') filteredLogs = filteredLogs.reverse();

    if (limit) {
      filteredLogs = slice(filteredLogs, offset, limit + (offset || 0));
    }

    return filteredLogs;
  }

  getDependencies(): DependencyList {
    return this.factory.getDependencies(this);
  }

  getPackageName(): string {
    return this.factory.componentPackageName(this);
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
    return this.factory.isModified(this);
  }

  /**
   * whether a component is marked as deleted.
   * warning! if this component is not the head, it might be deleted by a range later on.
   * to get accurate results, please use teambit.component/remove aspect, "isDeleted" method.
   */
  isDeleted(): boolean {
    return this.state._consumer.isRemoved();
  }

  /**
   * is component isOutdated
   */
  isOutdated(): boolean {
    if (!this.latest) return false;
    const latestTag = this.tags.byVersion(this.latest);
    if (!latestTag) return false;
    if (this.head?.hash !== latestTag?.hash) return true;
    return false;
  }

  /**
   * determines whether this component is new.
   */
  isNew(): Promise<boolean> {
    return Promise.resolve(this.head === null);
  }

  /**
   * whether the component exists on the remote.
   */
  isExported(): boolean {
    return this.factory.isExported(this.id);
  }

  // TODO: @david after snap we need to make sure to refactor here.
  loadState(snapId: string): Promise<State> {
    return this.factory.getState(this.id, snapId);
  }

  loadSnap(snapId?: string): Promise<Snap> {
    const snapToGet = snapId || this.head?.hash;
    if (!snapToGet) {
      throw new BitError('could not load snap for new components');
    }
    return this.factory.getSnap(this.id, snapToGet);
  }

  /**
   * Get iterable which iterate over snap parents lazily
   * @param snapId
   * @param options
   */
  snapsIterable(snapId?: string, options: SnapsIterableOpts = {}): AsyncIterable<Snap> {
    const snapToStart = snapId || this.head?.hash;
    let nextSnaps = [snapToStart];
    let done;
    if (!snapToStart) {
      done = true;
    }

    const iterator: AsyncIterator<Snap> = {
      next: async () => {
        if (done) {
          return { value: undefined, done };
        }
        const currSnapId = nextSnaps.shift();
        const snap = await this.loadSnap(currSnapId);
        if (snap.parents && snap.parents.length) {
          if (options.firstParentOnly) {
            nextSnaps.push(snap.parents[0]);
          } else {
            nextSnaps = nextSnaps.concat(snap.parents);
          }
        }
        if (!nextSnaps.length) {
          done = true;
        } else if (options.stopFn) {
          done = await options.stopFn(snap);
        }
        return { value: snap, done: undefined };
      },
    };
    return {
      [Symbol.asyncIterator]: () => iterator,
    };
  }

  /**
   * traverse recursively from the provided snap (or head) upwards until it finds a tag
   * @param snapToStartFrom
   */
  async getClosestTag(snapToStartFrom?: string): Promise<Tag | undefined> {
    const tagsHashMap = this.tags.getHashMap();
    const stopFn = async (snap: Snap) => {
      if (tagsHashMap.has(snap.hash)) {
        return true;
      }
      return false;
    };
    const iterable = this.snapsIterable(snapToStartFrom, { firstParentOnly: true, stopFn });
    const snaps: Snap[] = [];
    for await (const snap of iterable) {
      snaps.push(snap);
    }
    if (snaps.length) {
      const hashOfLastSnap = snaps[snaps.length - 1].hash;
      return tagsHashMap.get(hashOfLastSnap);
    }
    return undefined;
  }

  /**
   * id.version can be either a tag or a hash.
   * if it's a hash, it may have a tag point to it. if it does, return the tag.
   */
  getTag(): Tag | undefined {
    const currentVersion = this.id.version;
    if (!currentVersion) return undefined;
    return this.tags.byVersion(currentVersion) || this.tags.byHash(currentVersion);
  }

  /**
   * id.version can be either a tag or a hash.
   * if it's a tag, find the hash it points to.
   */
  getSnapHash(): string | undefined {
    if (!this.id.hasVersion()) return undefined;
    const tag = this.tags.byVersion(this.id.version);
    if (tag) return tag.hash;
    return this.id.version;
  }

  /**
   * in case a component is new, it returns undefined.
   * otherwise, it returns the Snap object (hash/parents/log) of the current component (according to the version in the id)
   */
  async getCurrentSnap(): Promise<Snap | undefined> {
    const snap = this.getSnapHash();
    if (!snap) return undefined;
    return this.loadSnap(snap);
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
