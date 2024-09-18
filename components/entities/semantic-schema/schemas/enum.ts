import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';
import { SchemaRegistry } from '..';

export class EnumSchema extends SchemaNode {
  readonly doc?: DocSchema;
  readonly members: SchemaNode[];

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    members: SchemaNode[],
    readonly signature: string,
    doc?: DocSchema
  ) {
    super();
    this.doc = doc;
    this.members = members;
  }

  getNodes() {
    return this.members;
  }

  toString(options) {
    const boldUnderline = options?.color ? chalk.bold.underline : (str: string) => str;
    const membersStr = this.members.map((m) => `* ${m.toString(options)}`).join('\n');
    return `${boldUnderline(this.name)}\n${membersStr}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let result = '';

    if (options?.showDocs && this.doc) {
      result += `${this.doc.toFullSignature()}\n`;
    }

    result += `enum ${this.name} {\n`;

    const membersStr = this.members
      .map((member) => {
        const memberStr = member.toFullSignature(options);
        return `  ${memberStr}`;
      })
      .join(',\n');

    result += `${membersStr}\n`;

    result += `}`;

    return result;
  }

  toObject() {
    return {
      ...super.toObject(),
      name: this.name,
      members: this.members.map((member) => member.toObject()),
      doc: this.doc?.toObject(),
      signature: this.signature,
    };
  }

  static fromObject(obj: Record<string, any>): EnumSchema {
    const location = obj.location;
    const name = obj.name;
    const members = obj.members.map((member: any) => SchemaRegistry.fromObject(member));
    const signature = obj.signature;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    return new EnumSchema(location, name, members, signature, doc);
  }
}
