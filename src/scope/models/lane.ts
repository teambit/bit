import { v4 } from 'uuid';
import { BitObject, Ref, Repository } from '../objects';
import { getStringifyArgs, filterObject, sha1 } from '../../utils';
import LaneId from '../../lane-id/lane-id';
import { BitId } from '../../bit-id';
import logger from '../../logger/logger';
import ValidationError from '../../error/validation-error';
import { DEFAULT_LANE } from '../../constants';
import LaneObjects from '../lane-objects';
import { Version } from '.';

export type LaneProps = {
  name: string;
  components?: Component[];
  hash: string;
};

type Component = { id: BitId; head: Ref };

export default class Lane extends BitObject {
  name: string;
  components: Component[];
  _hash: string; // reason for the underscore prefix is that we already have hash as a method
  constructor(props: LaneProps) {
    super();
    if (!props.name) throw new TypeError('Lane constructor expects to get a name parameter');
    this.name = props.name;
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
    return this.components.map(c => c.head);
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
        components: this.components.map(component => ({
          id: { scope: component.id.scope, name: component.id.name },
          head: component.head.toString()
        }))
      },
      val => !!val
    );
  }
  static from(props: LaneProps): Lane {
    return new Lane(props);
  }
  static create(id: LaneId) {
    return new Lane({ name: id.name, hash: sha1(v4()) });
  }
  static parse(contents: string, hash: string): Lane {
    const laneObject = JSON.parse(contents);
    return Lane.from({
      name: laneObject.name,
      components: laneObject.components.map(component => ({
        id: new BitId({ scope: component.id.scope, name: component.id.name }),
        head: new Ref(component.head)
      })),
      hash: laneObject.hash || hash
    });
  }
  toBuffer(pretty?: boolean) {
    const args = getStringifyArgs(pretty);
    const obj = this.toObject();
    const str = JSON.stringify(obj, ...args);
    if (this.validateBeforePersist) this.validateBeforePersisting(str);
    return Buffer.from(str);
  }
  addComponent(component: Component) {
    const existsComponent = this.getComponentByName(component.id);
    if (existsComponent) {
      existsComponent.id = component.id;
      existsComponent.head = component.head;
    } else {
      this.components.push(component);
    }
  }
  getComponentByName(bitId: BitId): Component | undefined {
    return this.components.find(c => c.id.isEqualWithoutScopeAndVersion(bitId));
  }
  getComponentHead(bitId: BitId): Ref | null {
    const found = this.components.find(c => c.id.isEqual(bitId));
    if (found) return found.head;
    return null;
  }
  toLaneId() {
    return new LaneId({ name: this.name });
  }
  collectObjects(repo: Repository): Promise<LaneObjects> {
    return Promise.all([this.asRaw(repo), this.collectRaw(repo)])
      .then(([rawComponent, objects]) => new LaneObjects(rawComponent, objects))
      .catch(err => {
        if (err.code === 'ENOENT') {
          throw new Error(
            `fatal: an object of "${this.id()}" was not found at ${err.path}\nplease try to re-import the lane`
          );
        }
        throw err;
      });
  }
  collectObjectsById(repo: Repository): Promise<Array<{ id: BitId; objects: BitObject[] }>> {
    return Promise.all(
      this.components.map(async component => {
        const headVersion = (await component.head.load(repo)) as Version;
        const objects = [headVersion, ...headVersion.collect(repo)];
        return { id: component.id, objects };
      })
    );
  }
  validate() {
    const message = `unable to save Lane object "${this.id()}"`;
    this.components.forEach(component => {
      if (this.components.filter(c => c.id.name === component.id.name).length > 1) {
        throw new ValidationError(`${message}, the following component is duplicated "${component.id.name}"`);
      }
    });
    if (this.name === DEFAULT_LANE) {
      throw new ValidationError(`${message}, this name is reserved as the default lane`);
    }
  }
}
