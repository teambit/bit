import chalk from 'chalk';
import type { SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import type { SchemaChangeFact } from '../schema-diff';
import { deepEqualNoLocation, diffDoc } from '../schema-diff';
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

  diff(other: SchemaNode): SchemaChangeFact[] {
    if (!(other instanceof EnumSchema)) return super.diff(other);
    const facts: SchemaChangeFact[] = [];
    const baseMembers: Record<string, any>[] = this.toObject().members || [];
    const compareMembers: Record<string, any>[] = other.toObject().members || [];
    const baseMap = new Map(baseMembers.map((m) => [m.name || '', m]));
    const compareMap = new Map(compareMembers.map((m) => [m.name || '', m]));

    for (const [name, member] of compareMap) {
      if (!baseMap.has(name)) {
        facts.push({
          changeKind: 'enum-member-added',
          description: `enum member '${name}' added`,
          context: { memberName: name },
          to: member.signature || name,
        });
      }
    }
    for (const [name, member] of baseMap) {
      if (!compareMap.has(name)) {
        facts.push({
          changeKind: 'enum-member-removed',
          description: `enum member '${name}' removed`,
          context: { memberName: name },
          from: member.signature || name,
        });
      }
    }
    for (const [name, bm] of baseMap) {
      const cm = compareMap.get(name);
      if (cm && !deepEqualNoLocation(bm, cm)) {
        facts.push({
          changeKind: 'enum-member-value-changed',
          description: `enum member '${name}' value changed`,
          context: { memberName: name },
          from: bm.signature || name,
          to: cm.signature || name,
        });
      }
    }
    facts.push(...diffDoc(this.toObject().doc, other.toObject().doc));
    return facts;
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
