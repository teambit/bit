import { getStringifyArgs } from '../../utils';
import BitObject from '../objects/object';
import Ref from '../objects/ref';

type ScopeMetaProps = {
  name: string;
  license: string;
};

// TODO: fix parse
// @ts-ignore
export default class ScopeMeta extends BitObject {
  license: string | null | undefined;
  name: string;

  constructor(props: ScopeMetaProps) {
    super();
    this.license = props.license;
    this.name = props.name;
  }

  toObject(): Record<string, any> {
    return {
      license: this.license,
      name: this.name,
    };
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  toString(pretty: boolean): string {
    const args = getStringifyArgs(pretty);
    return JSON.stringify(this.toObject(), ...args);
  }

  id(): string {
    return this.name;
  }

  toBuffer(pretty): Buffer {
    return Buffer.from(this.toString(pretty));
  }

  static fromScopeName(name: string): Ref {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return ScopeMeta.fromObject({ name }).hash();
  }

  static parse(propsStr: string | Buffer): ScopeMeta {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.fromObject(JSON.parse(propsStr));
  }

  static fromObject(props: ScopeMetaProps): ScopeMeta {
    return new ScopeMeta(props);
  }

  static from(props: ScopeMetaProps): ScopeMeta {
    return ScopeMeta.fromObject(props);
  }
}
