// @flow
import { BitObject, Ref } from '../objects';
import { bufferFrom, getStringifyArgs } from '../../utils';

type ScopeMetaProps = {
  name: string,
  license: string
};

export default class ScopeMeta extends BitObject {
  license: ?string;
  name: string;

  constructor(props: ScopeMetaProps) {
    super();
    this.license = props.license;
    this.name = props.name;
  }

  toObject(): Object {
    return {
      license: this.license,
      name: this.name
    };
  }

  toString(pretty: boolean): string {
    const args = getStringifyArgs(pretty);
    return JSON.stringify(this.toObject(), ...args);
  }

  id(): Object {
    return this.name;
  }

  toBuffer(pretty): Buffer {
    return bufferFrom(this.toString(pretty));
  }

  static fromScopeName(name: string): Ref {
    return ScopeMeta.fromObject({ name }).hash();
  }

  static parse(propsStr: string | Buffer): ScopeMeta {
    return this.fromObject(JSON.parse(propsStr));
  }

  static fromObject(props: ScopeMetaProps): ScopeMeta {
    return new ScopeMeta(props);
  }

  static from(props: ScopeMetaProps): ScopeMeta {
    return ScopeMeta.fromObject(props);
  }
}
