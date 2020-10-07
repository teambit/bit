import { v4 } from 'uuid';

import { Scope } from '..';
import { BitId } from '../../bit-id';
import { DEFAULT_LANE } from '../../constants';
import ValidationError from '../../error/validation-error';
import LaneId, { RemoteLaneId } from '../../lane-id/lane-id';
import logger from '../../logger/logger';
import { filterObject, getStringifyArgs, sha1 } from '../../utils';
import { hasVersionByRef } from '../component-ops/traverse-versions';
import { BitObject, Ref, Repository } from '../objects';
import { Version } from '.';

export type LaneProps = {
  name: string;
  scope?: string;
  components?: LaneComponent[];
  hash: string;
};

export type LaneComponent = { id: BitId; head: Ref };

export default class Lane extends BitObject {
  name: string;
  // @todo: delete this. seems like it being written to the filesystem and it should not
  scope?: string; // scope is only needed to know where a lane came from, it should not be written to the fs
  remoteLaneId?: RemoteLaneId;
  components: LaneComponent[];
  _hash: string; // reason for the underscore prefix is that we already have hash as a method
  constructor(props: LaneProps) {
    super();
    if (!props.name) throw new TypeError('Lane constructor expects to get a name parameter');
    this.name = props.name;
    this.scope = props.scope;
    this.components = props.components || [];
    this._hash = props.hash;
  }
  id(): string {
    return this.name;
  }
  hash(): Ref {
    if (!this._hash) {
      throw new Error('hash is missing from a Lane object');
    }
    return new Ref(this._hash);
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
    return filterObject(
      {
        name: this.name,
        scope: this.scope,
        components: this.components.map((component) => ({
          id: { scope: component.id.scope, name: component.id.name },
          head: component.head.toString(),
        })),
      },
      (val) => !!val
    );
  }
  static from(props: LaneProps): Lane {
    return new Lane(props);
  }
  static create(name: string) {
    return new Lane({ name, hash: sha1(v4()) });
  }
  static parse(contents: string, hash: string): Lane {
    const laneObject = JSON.parse(contents);
    return Lane.from({
      name: laneObject.name,
      scope: laneObject.scope,
      components: laneObject.components.map((component) => ({
        id: new BitId({ scope: component.id.scope, name: component.id.name }),
        head: new Ref(component.head),
      })),
      hash: laneObject.hash || hash,
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
    const existsComponent = this.getComponentByName(component.id);
    if (existsComponent) {
      existsComponent.id = component.id;
      existsComponent.head = component.head;
    } else {
      this.components.push(component);
    }
  }
  removeComponent(id: BitId): boolean {
    const existsComponent = this.getComponentByName(id);
    if (!existsComponent) return false;
    this.components = this.components.filter((c) => !c.id.isEqualWithoutScopeAndVersion(id));
    return true;
  }
  getComponentByName(bitId: BitId): LaneComponent | undefined {
    return this.components.find((c) => c.id.isEqualWithoutScopeAndVersion(bitId));
  }
  getComponent(id: BitId): LaneComponent | undefined {
    return this.components.find((c) => c.id.isEqualWithoutVersion(id));
  }
  getComponentHead(bitId: BitId): Ref | null {
    const found = this.components.find((c) => c.id.isEqual(bitId));
    if (found) return found.head;
    return null;
  }
  setLaneComponents(laneComponents: LaneComponent[]) {
    // this gets called when adding lane-components from other lanes/remotes, so it's better to
    // clone the objects to not change the original data.
    this.components = laneComponents.map((c) => ({ id: c.id.clone(), head: c.head.clone() }));
  }
  async isFullyMerged(scope: Scope): Promise<boolean> {
    const { unmerged } = await this.getMergedAndUnmergedIds(scope);
    return unmerged.length === 0;
  }
  async getMergedAndUnmergedIds(scope: Scope): Promise<{ merged: BitId[]; unmerged: BitId[] }> {
    const merged: BitId[] = [];
    const unmerged: BitId[] = [];
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
  toBitIds(): BitId[] {
    return this.components.map((c) => c.id.changeVersion(c.head.toString()));
  }
  toLaneId() {
    return new LaneId({ name: this.name });
  }
  collectObjectsById(repo: Repository): Promise<Array<{ id: BitId; objects: BitObject[] }>> {
    return Promise.all(
      this.components.map(async (component) => {
        const headVersion = (await component.head.load(repo)) as Version;
        const objects = [headVersion, ...headVersion.collect(repo)];
        return { id: component.id, objects };
      })
    );
  }
  validate() {
    const message = `unable to save Lane object "${this.id()}"`;
    this.components.forEach((component) => {
      if (this.components.filter((c) => c.id.name === component.id.name).length > 1) {
        throw new ValidationError(`${message}, the following component is duplicated "${component.id.name}"`);
      }
    });
    if (this.name === DEFAULT_LANE) {
      throw new ValidationError(`${message}, this name is reserved as the default lane`);
    }
  }
}
