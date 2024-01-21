import chalk from 'chalk';
import { SchemaLocation, SchemaNode } from '../schema-node';
import { DocSchema } from './docs';
import { ExpressionWithTypeArgumentsSchema } from './expression-with-arguments';
import { SchemaRegistry } from '../schema-registry';

export class InterfaceSchema extends SchemaNode {
  readonly members: SchemaNode[];
  readonly doc?: DocSchema;

  constructor(
    readonly location: SchemaLocation,
    readonly name: string,
    readonly signature: string,
    readonly extendsNodes: ExpressionWithTypeArgumentsSchema[],
    members: SchemaNode[],
    doc?: DocSchema,
    readonly typeParams?: string[]
  ) {
    super();
    this.members = members;
    this.doc = doc;
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
      extendsNodes: this.extendsNodes?.map((node) => node.toObject()),
      typeParams: this.typeParams,
    };
  }

  static fromObject(obj: Record<string, any>): InterfaceSchema {
    const location = obj.location;
    const name = obj.name;
    const signature = obj.signature;
    const extendsNodes = obj.extendsNodes?.map((node: any) => ExpressionWithTypeArgumentsSchema.fromObject(node));
    const members = obj.members.map((member: any) => SchemaRegistry.fromObject(member));
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    const typeParams = obj.typeParams;
    return new InterfaceSchema(location, name, signature, extendsNodes, members, doc, typeParams);
  }
}
