import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import type { SchemaChangeFact } from '../schema-diff';
import { typesAreSemanticallyEqual, typeStr, diffDoc } from '../schema-diff';
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

  diff(other: SchemaNode): SchemaChangeFact[] {
    if (!(other instanceof VariableLikeSchema)) return super.diff(other);
    const facts: SchemaChangeFact[] = [];
    if (!typesAreSemanticallyEqual(this.type.toObject(), other.type.toObject())) {
      facts.push({
        changeKind: 'type-annotation-changed',
        description: `type changed: ${typeStr(this.type.toObject())} → ${typeStr(other.type.toObject())}`,
        context: {
          fromType: typeStr(this.type.toObject()),
          toType: typeStr(other.type.toObject()),
          position: 'variable',
        },
        from: typeStr(this.type.toObject()),
        to: typeStr(other.type.toObject()),
      });
    }
    if (this.isOptional && !other.isOptional) {
      facts.push({
        changeKind: 'became-required',
        description: 'became required (was optional)',
        context: { position: 'variable' },
        from: 'optional',
        to: 'required',
      });
    } else if (!this.isOptional && other.isOptional) {
      facts.push({
        changeKind: 'became-optional',
        description: 'became optional (was required)',
        context: { position: 'variable' },
        from: 'required',
        to: 'optional',
      });
    }
    if (this.defaultValue !== other.defaultValue) {
      const changeKind =
        this.defaultValue === undefined
          ? 'parameter-default-added'
          : other.defaultValue === undefined
            ? 'parameter-default-removed'
            : 'parameter-default-changed';
      facts.push({
        changeKind,
        description: `default value changed: ${this.defaultValue ?? 'none'} → ${other.defaultValue ?? 'none'}`,
        context: { previousDefault: this.defaultValue, newDefault: other.defaultValue },
        from: this.defaultValue,
        to: other.defaultValue,
      });
    }
    facts.push(...diffDoc(this.doc?.toObject(), other.doc?.toObject()));
    return facts;
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
