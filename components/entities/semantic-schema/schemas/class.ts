import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { DocSchema } from './docs';
import { ExpressionWithTypeArgumentsSchema } from './expression-with-arguments';
import { SchemaRegistry } from '../schema-registry';

export class ClassSchema extends SchemaNode {
  readonly members: SchemaNode[];
  readonly doc?: DocSchema;

  constructor(
    readonly name: string,
    members: SchemaNode[],
    readonly location: SchemaLocation,
    readonly signature: string,
    doc?: DocSchema,
    readonly typeParams?: string[],
    readonly extendsNodes?: ExpressionWithTypeArgumentsSchema[],
    readonly implementNodes?: ExpressionWithTypeArgumentsSchema[],
    readonly decorators?: SchemaNode[]
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
    const decoratorsStr = this.decorators?.map((decorator) => decorator.toString(options)).join('\n');
    return `${this.decorators ? `${decoratorsStr}\n` : ''}${boldUnderline(this.name)}\n${membersStr}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    let result = '';

    if (options?.showDocs && this.doc) {
      result += `${this.doc.toFullSignature()}\n`;
    }

    const decoratorsStr = this.decorators?.map((decorator) => decorator.toFullSignature(options)).join('\n');
    if (decoratorsStr) {
      result += `${decoratorsStr}\n`;
    }

    let classDeclaration = `class ${this.name}`;

    if (this.typeParams && this.typeParams.length > 0) {
      classDeclaration += `<${this.typeParams.join(', ')}>`;
    }

    if (this.extendsNodes && this.extendsNodes.length > 0) {
      const extendsStr = this.extendsNodes.map((node) => node.toFullSignature(options)).join(', ');
      classDeclaration += ` extends ${extendsStr}`;
    }

    if (this.implementNodes && this.implementNodes.length > 0) {
      const implementsStr = this.implementNodes.map((node) => node.toFullSignature(options)).join(', ');
      classDeclaration += ` implements ${implementsStr}`;
    }

    result += `${classDeclaration} {\n`;

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
      typeParams: this.typeParams,
      extendsNodes: this.extendsNodes?.map((node) => node.toObject()),
      implementNodes: this.implementNodes?.map((node) => node.toObject()),
      decorators: this.decorators?.map((decorator) => decorator.toObject()),
    };
  }

  static fromObject(obj: Record<string, any>): ClassSchema {
    const name = obj.name;
    const members = obj.members.map((member: any) => SchemaRegistry.fromObject(member));
    const location = obj.location;
    const signature = obj.signature;
    const doc = obj.doc ? DocSchema.fromObject(obj.doc) : undefined;
    const typeParams = obj.typeParams;
    const extendsNodes = obj.extendsNodes?.map((node: any) => ExpressionWithTypeArgumentsSchema.fromObject(node));
    const implementNodes = obj.implementNodes?.map((node: any) => ExpressionWithTypeArgumentsSchema.fromObject(node));
    const decorators = obj.decorators?.map((decorator: any) => SchemaRegistry.fromObject(decorator));
    return new ClassSchema(
      name,
      members,
      location,
      signature,
      doc,
      typeParams,
      extendsNodes,
      implementNodes,
      decorators
    );
  }

  static fromSchema(node: ClassSchema, memberTransformer: (_node: SchemaNode) => SchemaNode = (_node) => _node) {
    return new ClassSchema(
      node.name,
      node.members.map(memberTransformer),
      node.location,
      node.signature,
      node.doc,
      node.typeParams,
      node.extendsNodes,
      node.implementNodes,
      node.decorators
    );
  }
}
