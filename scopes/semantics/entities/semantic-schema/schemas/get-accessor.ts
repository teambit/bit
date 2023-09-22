import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class GetAccessorSchema extends SchemaNode {
  readonly type: SchemaNode;
  constructor(readonly location: SchemaLocation, readonly name: string, type: SchemaNode, readonly signature: string) {
    super();
    this.type = type;
  }
  getSignature() {
    return this.signature;
  }

  getNodes() {
    return [this.type];
  }

  toString() {
    return `get ${chalk.bold(this.name)}(): ${this.type.toString()}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type.toObject(),
      signature: this.signature,
    };
  }

  static fromObject(obj: Record<string, any>): GetAccessorSchema {
    const location = obj.location;
    const name = obj.name;
    const type = SchemaRegistry.fromObject(obj.type);
    const signature = obj.signature;
    return new GetAccessorSchema(location, name, type, signature);
  }
}
