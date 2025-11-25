import { ComponentID } from '@teambit/component-id';
import { BitId } from '@teambit/legacy-bit-id';
import { getStringifyArgs } from '@teambit/legacy.utils';
import { BitObject } from '../objects';

export type SymlinkProp = {
  scope: string;
  name: string;
  realScope: string;
};

/**
 * @deprecated
 * this is not used since component-schema 2.0.0, where the component-id is always the full id.
 */
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

  getRealComponentId(): ComponentID {
    return ComponentID.fromObject({ scope: this.realScope, name: this.name });
  }

  toComponentId(): ComponentID {
    return this.getRealComponentId();
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
