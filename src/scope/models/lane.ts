import { v4 } from 'uuid';
import { BitObject, Ref } from '../objects';
import { getStringifyArgs, filterObject, sha1 } from '../../utils';
import LaneId from '../../lane-id/lane-id';
import { BitId } from '../../bit-id';

export type LaneProps = {
  scope?: string;
  name: string;
  components?: Component[];
  hash: string;
};

type Component = { id: BitId; head: Ref };

export default class Lane extends BitObject {
  scope: string | null;
  name: string;
  components: Component[];
  _hash: string; // reason for the underscore prefix is that we already have hash as a method
  constructor(props: LaneProps) {
    super();
    if (!props.name) throw new TypeError('Lane constructor expects to get a name parameter');
    this.scope = props.scope || null;
    this.name = props.name;
    this.components = props.components || [];
    this._hash = props.hash;
  }
  id(): string {
    return this.scope ? [this.scope, this.name].join('/') : this.name;
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
    // @todo: implement
  }
  toObject() {
    return filterObject(
      {
        scope: this.scope,
        name: this.name,
        components: this.components.map(component => ({ id: component.id, head: component.head.toString() }))
      },
      val => !!val
    );
  }
  static from(props: LaneProps): Lane {
    return new Lane(props);
  }
  static create(id: LaneId) {
    return new Lane({ name: id.name, scope: id.scope, hash: sha1(v4()) });
  }
  static parse(contents: string, hash: string): Lane {
    const laneObject = JSON.parse(contents);
    return Lane.from({
      name: laneObject.name,
      scope: laneObject.scope,
      components: laneObject.components.map(component => ({
        id: new BitId({ scope: component.id.scope, name: component.id.name }),
        head: new Ref(component.head)
      })),
      hash: laneObject.hash || hash
    });
  }
  toBuffer(pretty: boolean) {
    const args = getStringifyArgs(pretty);
    const obj = this.toObject();
    const str = JSON.stringify(obj, ...args);
    if (this.validateBeforePersist) this.validateBeforePersisting(str);
    return Buffer.from(str);
  }
  addComponent(component: Component) {
    this.components.push(component);
  }
  getComponentHead(bitId: BitId): Ref | null {
    const found = this.components.find(c => c.id.isEqual(bitId));
    if (found) return found.head;
    return null;
  }
  toLaneId() {
    return new LaneId({ name: this.name, scope: this.scope });
  }
}
