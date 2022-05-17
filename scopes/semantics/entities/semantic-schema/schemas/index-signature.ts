import { SchemaNode } from '../schema-node';
import { ParameterSchema } from './parameter';

/**
 * e.g. `{ [key: string]: boolean };`
 * the "[key: string]" is the "parameter", and the "boolean" is the "type".
 */
export class IndexSignatureSchema implements SchemaNode {
  constructor(private params: ParameterSchema[], private type: SchemaNode) {}
  toObject() {
    return {
      constructorName: this.constructor.name,
      parameters: this.params,
      type: this.type.toObject(),
    };
  }
  toString() {
    const paramsStr = this.params.map((param) => param.toString()).join(', ');
    return `[${paramsStr}]: ${this.type.toString()}`;
  }
}
