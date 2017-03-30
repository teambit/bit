import bit from 'bit-js';
import { BitObject, Ref } from '../objects';
const bufferFrom = bit('buffer/from');

type ScopeMetaProps = {
  name: string;
  license: string;
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
      name: this.name,
    };
  }
  
  toString(): string {
    return JSON.stringify(this.toObject());
  }
      
  id(): Object {
    return this.name;
  }
  
  toBuffer(): Buffer {
    return bufferFrom(this.toString());
  }
  
  static fromScopeName(name: string): Ref {
    return ScopeMeta.fromObject({ name }).hash();
  }
  
  static parse(propsStr: string|Buffer): ScopeMeta {
    return this.fromObject(JSON.parse(propsStr));
  }
  
  static fromObject(props: ScopeMetaProps): ScopeMeta {
    return new ScopeMeta(props);
  }
}
