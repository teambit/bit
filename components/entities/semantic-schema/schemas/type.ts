import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import type { SchemaChangeDetail } from '../schema-diff';
import { SchemaChangeImpact, typesAreSemanticallyEqual, diffDoc } from '../schema-diff';
import { DocSchema } from './docs';
import { SchemaRegistry } from '../schema-registry';

export class TypeSchema extends SchemaNode {
  readonly type: SchemaNode;
  readonly doc?: DocSchema;

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    type: SchemaNode,
    readonly signature: string,
    doc?: DocSchema
  ) {
    super();
    this.type = type;
    this.doc = doc;
  }

  toString(options?: { color?: boolean }) {
    const bold = options?.color ? chalk.bold : (str: string) => str;
    return `type ${bold(this.name)}: ${this.type.toString(options)}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const typeSignature = this.type.toFullSignature(options);

    let signature = `type ${this.name}: ${typeSignature}`;

    if (options?.showDocs && this.doc) {
      const docString = this.doc.toFullSignature();
      signature = `${docString}\n${signature}`;
    }

    return signature;
  }

  getNodes() {
    return [this.type];
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      type: this.type.toObject(),
      signature: this.signature,
    };
  }

  diff(other: SchemaNode): SchemaChangeDetail[] {
    if (!(other instanceof TypeSchema)) return super.diff(other);
    const details: SchemaChangeDetail[] = [];
    if (!typesAreSemanticallyEqual(this.type.toObject(), other.type.toObject())) {
      details.push({
        aspect: 'type-definition',
        description: 'type definition changed',
        impact: SchemaChangeImpact.BREAKING,
        from: this.signature,
        to: other.signature,
      });
    }
    details.push(...diffDoc(this.toObject().doc, other.toObject().doc));
    return details;
  }

  static fromObject(obj: Record<string, any>): TypeSchema {
    const location = obj.location;
    const name = obj.name;
    const type = SchemaRegistry.fromObject(obj.type);
    const signature = obj.signature;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new TypeSchema(location, name, type, signature, doc);
  }
}
