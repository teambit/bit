import { SchemaNode } from '../schema-node';

export class TypeOperatorSchema implements SchemaNode {
  constructor(private operatorName: string, private type: SchemaNode) {}
  toObject() {
    return {
      constructorName: this.constructor.name,
      operatorName: this.operatorName,
      type: this.type.toObject(),
    };
  }
  toString() {
    return `${this.operatorName} ${this.type.toString()}`;
  }
}
