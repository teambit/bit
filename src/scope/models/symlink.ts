import { BitId } from '../../bit-id';
import { getStringifyArgs } from '../../utils';
import BitObject from '../objects/object';

export type SymlinkProp = {
  scope: string;
  name: string;
  realScope: string;
};

// TODO: fix me, parse
// @ts-ignore
export default class Symlink extends BitObject {
  scope: string;
  name: string;
  realScope: string;

  constructor(props: SymlinkProp) {
    super();
    this.scope = props.scope;
    this.name = props.name;
    this.realScope = props.realScope;
  }

  id(): string {
    return this.name;
  }

  getRealComponentId(): BitId {
    return new BitId({ scope: this.realScope, name: this.name });
  }

  static parse(contents: Buffer): Symlink {
    const rawContent = JSON.parse(contents.toString());
    if (rawContent.box) rawContent.name = `${rawContent.box}/${rawContent.name}`;
    return Symlink.from(rawContent);
  }

  toObject() {
    return {
      scope: this.scope,
      name: this.name,
      realScope: this.realScope,
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
