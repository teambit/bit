import { SchemaNode } from '../schema-node';

export class ClassSchema implements SchemaNode {
  constructor(readonly className: string, readonly members: SchemaNode[]) {}

  toObject(): Record<string, any> {
    return {
      name: this.className,
      members: this.members.map((member) => member.toObject()),
    };
  }
}
