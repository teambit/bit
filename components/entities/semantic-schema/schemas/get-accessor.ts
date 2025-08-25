import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class GetAccessorSchema extends SchemaNode {
  readonly type: SchemaNode;
  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    type: SchemaNode,
    readonly signature: string
  ) {
    super();
    this.type = type;
  }
  getSignature() {
    return this.signature;
  }

  getNodes() {
    return [this.type];
  }

  toString(options?: { color?: boolean }): string {
    const bold = options?.color ? chalk.bold : (x: string) => x;
    return `get ${bold(this.name)}(): ${this.type.toString(options)}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let result = '';

    if (options?.showDocs && this.doc) {
      result += `${this.doc.toFullSignature()}\n`;
    }

    result += `get ${this.name}(): ${this.type.toFullSignature(options)}`;

    return result;
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
