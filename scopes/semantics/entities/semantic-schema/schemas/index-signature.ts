import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';
import { ParameterSchema } from './parameter';

/**
 * e.g. `{ [key: string]: boolean };`
 * the "[key: string]" is the "parameter", and the "boolean" is the "type".
 */
export class IndexSignatureSchema extends SchemaNode {
  readonly params: ParameterSchema[];
  readonly type: SchemaNode;
  constructor(readonly location: SchemaLocation, params: ParameterSchema[], type: SchemaNode) {
    super();
    this.params = params;
    this.type = type;
  }

  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    return `[${paramsStr}]: ${this.type.toString()}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      location: this.location,
      params: this.params.map((param) => param.toObject()),
      type: this.type.toObject(),
    };
  }

  static fromObject(obj: Record<string, any>): IndexSignatureSchema {
    const location = obj.location;
    const params = obj.params.map((param: any) => ParameterSchema.fromObject(param));
    const type = SchemaRegistry.fromObject(obj.type);
    return new IndexSignatureSchema(location, params, type);
  }
}
