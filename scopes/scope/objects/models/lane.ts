import { v4 } from 'uuid';
import { gte } from 'semver';
import { cloneDeep, isEqual, pickBy } from 'lodash';
import { BitError } from '@teambit/bit-error';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { isSnap } from '@teambit/component-version';
import { LaneId, DEFAULT_LANE, LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import type { Scope } from '@teambit/legacy.scope';
import { CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY, PREVIOUS_DEFAULT_LANE } from '@teambit/legacy.constants';
import { ValidationError } from '@teambit/legacy.cli.error';
import { logger } from '@teambit/legacy.logger';
import { getStringifyArgs } from '@teambit/legacy.utils';
import { sha1 } from '@teambit/toolbox.crypto.sha1';
import { hasVersionByRef } from '@teambit/component.snap-distance';
import type { Repository } from '../objects';
import { BitObject, Ref } from '../objects';
import type Version from './version';
import { getConfig } from '@teambit/config-store';

export type Log = { date: string; username?: string; email?: string; profileImage?: string };

export type LaneProps = {
  name: string;
  scope: string;
  log: Log;
  // hidden lane entries (formerly the separate `updateDependents` array) are part of `components`
  // with `skipWorkspace: true`. There is no separate `updateDependents` field on `LaneProps` —
  // `Lane.parse` hoists the wire-format `updateDependents` into `components` before constructing.
  components?: LaneComponent[];
  hash: string;
  schema?: string;
  readmeComponent?: LaneReadmeComponent;
  forkedFrom?: LaneId;
  overrideUpdateDependents?: boolean;
};

const OLD_LANE_SCHEMA = '0.0.0';
const SCHEMA_INCLUDING_DELETED_COMPONENTS_DATA = '1.0.0';
const CURRENT_LANE_SCHEMA = SCHEMA_INCLUDING_DELETED_COMPONENTS_DATA;

/**
 * `skipWorkspace: true` marks a component that participates in the lane's graph (Ripple CI builds
 * it, merges refresh it) but is hidden from workspace-facing flows (`bit status`, `bit compile`,
 * `bit install`, the bitmap). On the wire and on disk, these entries live in the separate
 * `updateDependents` array for backward compatibility with older clients; in-memory they are
 * hoisted into `components` so every per-component machinery (autotag, 3-way merge, reset,
 * garbage collection) operates on one unified list instead of branching on "regular vs. hidden".
 */
export type LaneComponent = { id: ComponentID; head: Ref; isDeleted?: boolean; skipWorkspace?: boolean };
export type LaneReadmeComponent = { id: ComponentID; head: Ref | null };
export default class Lane extends BitObject {
  name: string;
  scope: string;
  components: LaneComponent[];
  log: Log;
  schema: string;
  readmeComponent?: LaneReadmeComponent;
  forkedFrom?: LaneId;
  _hash: string; // reason for the underscore prefix is that we already have hash as a method
  isNew = false; // doesn't get saved in the object. only needed for in-memory instance
  hasChanged = false; // doesn't get saved in the object. only needed for in-memory instance
  private overrideUpdateDependents?: boolean;
  constructor(props: LaneProps) {
    super();
    if (!props.name) throw new TypeError('Lane constructor expects to get a name parameter');
    this.name = props.name;
    this.scope = props.scope;
    this.components = props.components || [];
    this.log = props.log || { date: Date.now().toString() };
    this._hash = props.hash;
    this.readmeComponent = props.readmeComponent;
    this.forkedFrom = props.forkedFrom;
    this.schema = props.schema || OLD_LANE_SCHEMA;
    this.overrideUpdateDependents = props.overrideUpdateDependents;
  }
  /**
   * Components that live only in the lane's graph (Ripple CI / merge / GC) but are hidden from
   * workspace-facing flows. Kept as a derived view over `components` for source-compat with
   * callers that read or assign to `lane.updateDependents` directly.
   */
  get updateDependents(): ComponentID[] | undefined {
    const hidden = this.components.filter((c) => c.skipWorkspace);
    if (!hidden.length) return undefined;
    return hidden.map((c) => c.id.changeVersion(c.head.toString()));
  }
  set updateDependents(next: ComponentID[] | undefined) {
    const currentHidden = this.components
      .filter((c) => c.skipWorkspace)
      .map((c) => c.id.changeVersion(c.head.toString()).toString())
      .sort();
    const nextHidden = (next || []).map((id) => {
      if (!id.hasVersion()) {
        throw new ValidationError(`Lane.updateDependents: component "${id.toString()}" is missing a version`);
      }
      return id.toString();
    });
    const nextHiddenSorted = [...nextHidden].sort();
    if (isEqual(currentHidden, nextHiddenSorted)) return;
    // drop every existing hidden entry, then add the replacement set. Preserves array-identity
    // semantics callers expect from `lane.updateDependents = lane.updateDependents` reassignment.
    // Also drop any *visible* entry whose id collides with an incoming hidden id — this handles
    // a remote-merge bucket flip (visible → hidden) without leaving two entries for the same
    // component, which would violate the no-duplicates invariant in `Lane.validate()`.
    const nextIdsWithoutVersion = new Set((next || []).map((id) => id.toStringWithoutVersion()));
    this.components = this.components.filter(
      (c) => !c.skipWorkspace && !nextIdsWithoutVersion.has(c.id.toStringWithoutVersion())
    );
    if (next?.length) {
      for (const id of next) {
        this.components.push({
          id: id.changeVersion(undefined),
          head: Ref.from(id.version as string),
          skipWorkspace: true,
        });
      }
    }
    this.hasChanged = true;
  }
  id(): string {
    return this.scope + LANE_REMOTE_DELIMITER + this.name;
  }
  hash(): Ref {
    if (!this._hash) {
      throw new Error('hash is missing from a Lane object');
    }
    return new Ref(this._hash);
  }
  changeName(name: string) {
    this.name = name;
    this.hasChanged = true;
  }
  changeScope(scope: string) {
    this.scope = scope;
    this.hasChanged = true;
  }
  refs(): Ref[] {
    return this.components.map((c) => c.head);
  }
  validateBeforePersisting(str: string) {
    logger.debug(`validating lane object: ${this.hash().toString()} ${this.id()}`);
    const lane = Lane.parse(str, this.hash().toString());
    lane.validate();
  }
  toObject() {
    // split the unified components list at the wire boundary so older clients (which only know
    // the separate `components` / `updateDependents` arrays) keep round-tripping cleanly.
    const visibleComponents = this.components.filter((c) => !c.skipWorkspace);
    const hiddenComponents = this.components.filter((c) => c.skipWorkspace);
    const updateDependents = hiddenComponents.length
      ? hiddenComponents.map((c) => c.id.changeVersion(c.head.toString()).toString())
      : undefined;
    const obj = pickBy(
      {
        name: this.name,
        scope: this.scope,
        components: visibleComponents.map((component) => ({
          id: { scope: component.id.scope, name: component.id.fullName },
          head: component.head.toString(),
          ...(component.isDeleted && { isDeleted: component.isDeleted }),
        })),
        log: this.log,
        readmeComponent: this.readmeComponent && {
          id: { scope: this.readmeComponent.id.scope, name: this.readmeComponent.id.fullName },
          head: this.readmeComponent.head?.toString() ?? null,
        },
        forkedFrom: this.forkedFrom && this.forkedFrom.toObject(),
        schema: this.schema,
        updateDependents,
        overrideUpdateDependents: this.overrideUpdateDependents,
      },
      (val) => !!val
    );
    return obj;
  }
  static from(props: LaneProps): Lane {
    return new Lane(props);
  }
  static create(
    name: string,
    scope: string,
    forkedFrom?: LaneId,
    bitCloudUser?: {
      username?: string;
      email?: string;
      profileImage?: string;
    }
  ) {
    const log = {
      date: Date.now().toString(),
      username: bitCloudUser?.username || getConfig(CFG_USER_NAME_KEY),
      email: bitCloudUser?.email || getConfig(CFG_USER_EMAIL_KEY),
      profileImage: bitCloudUser?.profileImage,
    };
    const lane = new Lane({ name, scope, hash: sha1(v4()), log, forkedFrom, schema: CURRENT_LANE_SCHEMA });
    lane.isNew = true;
    lane.hasChanged = true;
    return lane;
  }
  static parse(contents: string, hash: string): Lane {
    const laneObject = JSON.parse(contents);
    const visibleComponents: LaneComponent[] = laneObject.components.map((component) => ({
      id: ComponentID.fromObject({ scope: component.id.scope, name: component.id.name }),
      head: new Ref(component.head),
      isDeleted: component.isDeleted,
    }));
    // hoist wire-format `updateDependents` into the unified components list with
    // `skipWorkspace: true`. Old clients on the other side of the wire still see the separate
    // `updateDependents` array thanks to the reverse demote in `toObject()`.
    const hiddenComponents: LaneComponent[] = (laneObject.updateDependents || []).map((raw: string) => {
      const compId = ComponentID.fromString(raw);
      if (!compId.hasVersion()) {
        throw new ValidationError(`Lane.parse: updateDependents entry ${raw} is missing a version`);
      }
      return {
        id: compId.changeVersion(undefined),
        head: Ref.from(compId.version as string),
        skipWorkspace: true,
      };
    });
    return Lane.from({
      name: laneObject.name,
      scope: laneObject.scope,
      log: laneObject.log,
      components: [...visibleComponents, ...hiddenComponents],
      readmeComponent: laneObject.readmeComponent && {
        id: ComponentID.fromObject({
          scope: laneObject.readmeComponent.id.scope,
          name: laneObject.readmeComponent.id.name,
        }),
        head: laneObject.readmeComponent.head && new Ref(laneObject.readmeComponent.head),
      },
      forkedFrom: laneObject.forkedFrom && LaneId.from(laneObject.forkedFrom.name, laneObject.forkedFrom.scope),
      overrideUpdateDependents: laneObject.overrideUpdateDependents,
      hash: laneObject.hash || hash,
      schema: laneObject.schema,
    });
  }
  toBuffer(pretty?: boolean) {
    const args = getStringifyArgs(pretty);
    const obj = this.toObject();
    const str = JSON.stringify(obj, ...args);
    if (this.validateBeforePersist) this.validateBeforePersisting(str);
    return Buffer.from(str);
  }
  addComponent(component: LaneComponent) {
    const existsComponent = this.getComponent(component.id);
    if (existsComponent) {
      // note: `skipWorkspace` follows the incoming value (including undefined). That's how
      // scenario 6 "promote-on-import" works — a hidden entry being re-added without the flag
      // flips to a visible first-class lane component without a separate move operation.
      if (
        !existsComponent.head.isEqual(component.head) ||
        existsComponent.skipWorkspace !== component.skipWorkspace ||
        Boolean(existsComponent.isDeleted) !== Boolean(component.isDeleted)
      ) {
        this.hasChanged = true;
      }
      existsComponent.id = component.id;
      existsComponent.head = component.head;
      existsComponent.isDeleted = component.isDeleted;
      existsComponent.skipWorkspace = component.skipWorkspace;
    } else {
      logger.debug(`Lane.addComponent, adding component ${component.id.toString()} to lane ${this.id()}`);
      this.components.push(component);
      this.hasChanged = true;
    }
  }
  removeComponentFromUpdateDependentsIfExist(componentId: ComponentID) {
    const before = this.components.length;
    this.components = this.components.filter((c) => !(c.skipWorkspace && c.id.isEqualWithoutVersion(componentId)));
    if (this.components.length !== before) this.hasChanged = true;
  }
  addComponentToUpdateDependents(componentId: ComponentID) {
    if (!componentId.hasVersion()) {
      throw new ValidationError(`Lane.addComponentToUpdateDependents: ${componentId.toString()} is missing a version`);
    }
    // replace any existing entry (hidden or visible) for this id so we never land with two
    // entries for the same component, regardless of which bucket it was previously in.
    this.components = this.components.filter((c) => !c.id.isEqualWithoutVersion(componentId));
    this.components.push({
      id: componentId.changeVersion(undefined),
      head: Ref.from(componentId.version as string),
      skipWorkspace: true,
    });
    this.hasChanged = true;
  }
  removeAllUpdateDependents() {
    const before = this.components.length;
    this.components = this.components.filter((c) => !c.skipWorkspace);
    if (this.components.length !== before) this.hasChanged = true;
  }
  shouldOverrideUpdateDependents() {
    return this.overrideUpdateDependents;
  }
  /**
   * !!! important !!!
   * this should get called only on a "temp lane" — for example a bare scope running the
   * snap-from-scope cascade producer, where the scope gets destroyed after the command is done.
   * when the scope exports the lane, this "overrideUpdateDependents" is not saved to the
   * remote-scope.
   *
   * on a user local lane object, this prop should never be true. otherwise, it'll override the remote-scope data.
   */
  setOverrideUpdateDependents(overrideUpdateDependents: boolean) {
    this.overrideUpdateDependents = overrideUpdateDependents;
    this.hasChanged = true;
  }

  removeComponent(id: ComponentID): boolean {
    const existsComponent = this.getComponent(id);
    if (!existsComponent) return false;
    this.components = this.components.filter((c) => !c.id.isEqualWithoutVersion(id));
    this.hasChanged = true;
    return true;
  }
  getComponent(id: ComponentID): LaneComponent | undefined {
    return this.components.find((c) => c.id.isEqualWithoutVersion(id));
  }
  getComponentHead(bitId: ComponentID): Ref | null {
    const found = this.components.find((c) => c.id.isEqual(bitId));
    if (found) return found.head;
    return null;
  }
  setLaneComponents(laneComponents: LaneComponent[]) {
    // this gets called when adding lane-components from other lanes/remotes, so it's better to
    // clone the objects to not change the original data.
    this.components = laneComponents.map((c) => ({
      id: c.id.clone(),
      head: c.head.clone(),
      ...(c.isDeleted && { isDeleted: c.isDeleted }),
      ...(c.skipWorkspace && { skipWorkspace: c.skipWorkspace }),
    }));
    this.hasChanged = true;
  }
  setReadmeComponent(id?: ComponentID) {
    const previousReadme = this.readmeComponent;
    if (!id) {
      this.readmeComponent = undefined;
      if (previousReadme) this.hasChanged = true;
      return;
    }
    const readmeComponent = this.getComponent(id);
    if (!readmeComponent) {
      this.readmeComponent = { id, head: null };
    } else {
      this.readmeComponent = readmeComponent;
    }
    if (
      !previousReadme ||
      !previousReadme.id.isEqual(id) ||
      previousReadme.head?.toString() !== this.readmeComponent.head?.toString()
    ) {
      this.hasChanged = true;
    }
  }

  async isFullyMerged(scope: Scope): Promise<boolean> {
    const { unmerged } = await this.getMergedAndUnmergedIds(scope);
    return unmerged.length === 0;
  }
  async getMergedAndUnmergedIds(scope: Scope): Promise<{ merged: ComponentID[]; unmerged: ComponentID[] }> {
    const merged: ComponentID[] = [];
    const unmerged: ComponentID[] = [];
    await Promise.all(
      this.components.map(async (component) => {
        const modelComponent = await scope.getModelComponentIfExist(component.id);
        if (!modelComponent) {
          unmerged.push(component.id);
          return;
        }
        const startTraverseFrom = modelComponent.getHead() || null; // it's important to have it as null and not as undefined, see hasVersionByRef
        const headExist = await hasVersionByRef(modelComponent, component.head, scope.objects, startTraverseFrom);
        if (headExist) merged.push(component.id);
        else unmerged.push(component.id);
      })
    );
    return { merged, unmerged };
  }
  /**
   * @deprecated use toComponentIds instead
   */
  toBitIds(): ComponentIdList {
    return this.toComponentIds();
  }
  /**
   * Returns only visible (non-skipWorkspace) components — the workspace-facing view.
   * Callers that need every entry in the lane's graph (Ripple CI build set, garbage collector,
   * merge engine) should use {@link toComponentIdsIncludeUpdateDependents} instead.
   */
  toComponentIds(): ComponentIdList {
    return ComponentIdList.fromArray(
      this.components.filter((c) => !c.skipWorkspace).map((c) => c.id.changeVersion(c.head.toString()))
    );
  }
  toComponentIdsIncludeUpdateDependents(): ComponentIdList {
    return ComponentIdList.fromArray(this.components.map((c) => c.id.changeVersion(c.head.toString())));
  }
  toLaneId() {
    return new LaneId({ scope: this.scope, name: this.name });
  }
  collectObjectsById(repo: Repository): Promise<Array<{ id: ComponentID; objects: BitObject[] }>> {
    return Promise.all(
      this.components.map(async (component) => {
        const headVersion = (await component.head.load(repo)) as Version;
        const objects = [headVersion, ...headVersion.collect(repo)];
        return { id: component.id, objects };
      })
    );
  }
  includeDeletedData(): boolean {
    return gte(this.schema, SCHEMA_INCLUDING_DELETED_COMPONENTS_DATA);
  }
  setSchemaToSupportDeletedData() {
    this.schema = SCHEMA_INCLUDING_DELETED_COMPONENTS_DATA;
    this.hasChanged = true;
  }
  setSchemaToNotSupportDeletedData() {
    this.schema = OLD_LANE_SCHEMA;
    this.hasChanged = true;
  }
  getCompHeadIncludeUpdateDependents(componentId: ComponentID): Ref | undefined {
    // `getComponent` scans the unified `components` list, which already contains hidden entries
    // (formerly `updateDependents`), so the dual lookup collapses into a single call.
    return this.getComponent(componentId)?.head;
  }
  validate() {
    const message = `unable to save Lane object "${this.id()}"`;
    // validate over ALL components including hidden ones — a duplicate id across the visible and
    // hidden buckets is still an invariant violation (the wire format serializes them separately,
    // but the in-memory unified list must not carry the same id twice).
    const allBitIds = this.toComponentIdsIncludeUpdateDependents();
    this.components.forEach((component) => {
      if (allBitIds.filterWithoutVersion(component.id).length > 1) {
        throw new ValidationError(`${message}, the following component is duplicated "${component.id.fullName}"`);
      }
      if (!isSnap(component.head.hash)) {
        throw new ValidationError(
          `${message}, lane component ${component.id.toStringWithoutVersion()} head should be a hash, got ${
            component.head.hash
          }`
        );
      }
    });
    if (this.name === DEFAULT_LANE) {
      throw new BitError(`${message}, this name is reserved as the default lane`);
    }
    if (this.name === PREVIOUS_DEFAULT_LANE) {
      throw new BitError(`${message}, this name is reserved as the old default lane`);
    }
  }
  isEqual(lane: Lane): boolean {
    if (this.id() !== lane.id()) return false;
    // include every per-component bit that affects the wire format (id, head, skipWorkspace,
    // isDeleted), not just id+head. The three real callers (`importer.fetchLaneComponents`,
    // `importer.fetchLanesUsingScope`, `import-components`) use this to decide whether to write
    // a LaneHistory entry. A bucket flip (skipWorkspace) or a soft-delete flip with the same
    // head is still a meaningful state change — a different `toObject()` payload — so it must
    // trigger the history write. Sort by a stable key so order doesn't affect equality.
    const normalize = (l: Lane) =>
      l.components
        .map((c) => ({
          id: c.id.toStringWithoutVersion(),
          head: c.head.toString(),
          skipWorkspace: Boolean(c.skipWorkspace),
          isDeleted: Boolean(c.isDeleted),
        }))
        .sort((a, b) =>
          `${a.id}@${a.head}:${a.skipWorkspace ? 1 : 0}:${a.isDeleted ? 1 : 0}`.localeCompare(
            `${b.id}@${b.head}:${b.skipWorkspace ? 1 : 0}:${b.isDeleted ? 1 : 0}`
          )
        );
    return isEqual(normalize(this), normalize(lane));
  }
  clone() {
    return new Lane({
      ...this,
      hash: this._hash,
      overrideUpdateDependents: this.overrideUpdateDependents,
      components: cloneDeep(this.components),
    });
  }
}
