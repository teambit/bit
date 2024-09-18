import { SchemaLocation, SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

export class ObjectLiteralExpressionSchema extends SchemaNode {
  constructor(readonly members: SchemaNode[], readonly location: SchemaLocation) {
    super();
  }

  getNodes() {
    return this.members;
  }

  toString(options?: { color?: boolean }): string {
    return `{\n${this.members.map((member) => `\t${member.toString(options)}`).join('\n')}\n}`;
  }

  toFullSignature(options?: { showDocs?: boolean }): string {
    const membersStr = this.members.map((member) => member.toFullSignature(options)).join(',\n');

    return `{\n${membersStr
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n')}\n}`;
  }

  toObject() {
    return {
      ...super.toObject(),
      members: this.members.map((element) => element.toObject()),
      location: this.location,
    };
  }

  static fromObject(obj: Record<string, any>): ObjectLiteralExpressionSchema {
    const members = obj.members.map((member) => SchemaRegistry.fromObject(member));
    const location = obj.location;
    return new ObjectLiteralExpressionSchema(members, location);
  }
}
