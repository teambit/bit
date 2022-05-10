import { SchemaNode } from '../schema-node';
import { Parameter } from './function';

/**
 * e.g. `{ [key: string]: boolean };`
 * the "[key: string]" is the "parameter", and the "boolean" is the "type".
 */
export class IndexSignatureSchema implements SchemaNode {
  constructor(private parameters: Parameter[], private type: SchemaNode) {}
  toObject() {
    return {
      constructorName: this.constructor.name,
      parameters: this.parameters,
      type: this.type.toObject(),
    };
  }
  toString() {
    const parameters = this.parameters.map((arg) => `${arg.name}: ${arg.type.toString()}`).join(', ');
    return `[${parameters}]: ${this.type.toString()}`;
  }
}
