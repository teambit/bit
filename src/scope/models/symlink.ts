import BitObject from '../objects/object';
import { getStringifyArgs } from '../../utils';
import { BitId } from '../../bit-id';
import { LANE_SEPARATOR } from '../../constants';

export type SymlinkProp = {
  scope: string;
  name: string;
  realScope: string;
  lane?: string;
};

export default class Symlink extends BitObject {
  scope: string;
  name: string;
  realScope: string;
  lane?: string;

  constructor(props: SymlinkProp) {
    super();
    this.scope = props.scope;
    this.name = props.name;
    this.realScope = props.realScope;
    this.lane = props.lane;
  }

  id(): string {
    return this.lane ? this.lane + LANE_SEPARATOR + this.name : this.name;
  }

  getRealComponentId(): BitId {
    return new BitId({ scope: this.realScope, name: this.name });
  }

  static parse(contents: string): Symlink {
    const rawContent = JSON.parse(contents);
    if (rawContent.box) rawContent.name = `${rawContent.box}/${rawContent.name}`;
    return Symlink.from(rawContent);
  }

  toObject() {
    return {
      scope: this.scope,
      name: this.name,
      realScope: this.realScope
    };
  }

  toBitId(): BitId {
    return new BitId({ name: this.name });
  }

  toBuffer(pretty?: boolean) {
    const args = getStringifyArgs(pretty);
    return Buffer.from(JSON.stringify(this.toObject(), ...args));
  }

  static from(props: SymlinkProp) {
    return new Symlink(props);
  }
}
