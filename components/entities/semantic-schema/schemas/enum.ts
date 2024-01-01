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

  toString() {
    const membersStr = this.members.map((m) => `* ${m.toString()}`).join('\n');
    return `${chalk.bold.underline(this.name)}\n${membersStr}`;
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
