import { SchemaNode } from '../schema-node';
import { Parameter } from './function';
import { TypeRefSchema } from './type-ref';

/**
 * e.g. `{ [key: string]: boolean };`
 * the "[key: string]" is the "parameter", and the "boolean" is the "type".
 */
export class IndexSignatureSchema implements SchemaNode {
  constructor(private parameters: Parameter[], private type: TypeRefSchema) {}
  toObject(): Record<string, any> {
    return {
      parameters: this.parameters,
      type: this.type.toObject(),
    };
  }
  toString() {
    const parameters = this.parameters.map((arg) => `${arg.name}: ${arg.type.toString()}`).join(', ');
    return `[${parameters}]: ${this.type.toString()}`;
  }
}
