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

  toString(options?: { color?: boolean }): string {
    const boldUnderline = options?.color ? chalk.bold.underline : (str: string) => str;
    const membersStr = this.members.map((m) => `* ${m.toString(options)}`).join('\n');
    return `${boldUnderline(this.name)}\n${membersStr}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let result = '';

    if (options?.showDocs && this.doc) {
      result += `${this.doc.toFullSignature()}\n`;
    }

    let interfaceDeclaration = `interface ${this.name}`;

    if (this.typeParams && this.typeParams.length > 0) {
      interfaceDeclaration += `<${this.typeParams.join(', ')}>`;
    }

    if (this.extendsNodes && this.extendsNodes.length > 0) {
      const extendsStr = this.extendsNodes.map((node) => node.toFullSignature(options)).join(', ');
      interfaceDeclaration += ` extends ${extendsStr}`;
    }

    result += `${interfaceDeclaration} {\n`;

    const membersStr = this.members
      .map((member) => {
        const memberStr = member.toFullSignature(options);
        return memberStr
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n');
      })
      .join('\n');

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
