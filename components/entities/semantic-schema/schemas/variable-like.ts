import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { DocSchema } from './docs';
import { SchemaRegistry } from '../schema-registry';

/**
 * can be also a property or property-signature
 */
export class VariableLikeSchema extends SchemaNode {
  type: SchemaNode;
  readonly doc?: DocSchema;
  readonly displaySchemaName = 'Variables';

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    readonly signature: string,
    type: SchemaNode,
    readonly isOptional: boolean,
    doc?: DocSchema,
    readonly defaultValue?: string
  ) {
    super();
    this.type = type;
    this.doc = doc;
  }

  getNodes() {
    return [this.type];
  }

  toString(options?: { color?: boolean }) {
    const bold = options?.color ? chalk.bold : (str: string) => str;
    return `${bold(this.name)}${this.isOptional ? '?' : ''}: ${this.type.toString(options)}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const namePart = `${this.name}${this.isOptional ? '?' : ''}`;
    const typeSignature = this.type.toFullSignature(options);
    let signature = `${namePart}: ${typeSignature}`;

    if (this.defaultValue !== undefined) {
      signature += ` = ${this.defaultValue}`;
    }

    if (options?.showDocs && this.doc) {
      const docString = this.doc.toFullSignature();
      signature = `${docString}\n${signature}`;
    }

    return signature;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      signature: this.signature,
      type: this.type.toObject(),
      isOptional: this.isOptional,
      doc: this.doc?.toObject(),
      defaultValue: this.defaultValue,
    };
  }

  static fromObject(obj: Record<string, any>): VariableLikeSchema {
    const location = obj.location;
    const name = obj.name;
    const signature = obj.signature;
    const type = SchemaRegistry.fromObject(obj.type);
    const isOptional = obj.isOptional;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    const defaultValue = obj.defaultValue;
    return new VariableLikeSchema(location, name, signature, type, isOptional, doc, defaultValue);
  }
}
