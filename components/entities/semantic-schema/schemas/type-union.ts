import { uniqBy } from 'lodash';
import type { GetMembersContext, SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';
import { VariableLikeSchema } from './variable-like';

export class TypeUnionSchema extends SchemaNode {
  readonly types: SchemaNode[];
  constructor(
    readonly location: SchemaLocation,
    types: SchemaNode[]
  ) {
    super();
    this.types = types;
  }

  /**
   * a union of object types contributes one member per name, in first-seen order. a member the
   * alternatives type differently gets the union of those types (`{ value: string } | { value: number }`
   * contributes `value: string | number`). a value of the union only surely has a member every alternative
   * requires, so a member some alternative lacks or leaves optional is contributed as optional.
   */
  getMembers(context: GetMembersContext = {}) {
    const perAlternative = this.types.map((type) => SchemaNode.membersOf(type, context));
    const variables = perAlternative.flat().filter(VariableLikeSchema.isVariableLikeSchema);
    const others = perAlternative.flat().filter((member) => !VariableLikeSchema.isVariableLikeSchema(member));

    const byName = new Map<string, VariableLikeSchema[]>();
    variables.forEach((member) => byName.set(member.name, [...(byName.get(member.name) || []), member]));

    const merged = [...byName.entries()].map(([name, declarations]) => {
      const [first] = declarations;
      const requiredEverywhere = perAlternative.every((members) =>
        members.some((m) => m.name === name && VariableLikeSchema.isVariableLikeSchema(m) && !m.isOptional)
      );
      const types = uniqBy(
        declarations.map((declaration) => declaration.type),
        (type) => type.toString()
      );
      const type = types.length === 1 ? first.type : new TypeUnionSchema(first.location, types);
      if (type === first.type && requiredEverywhere === !first.isOptional) return first;

      return new VariableLikeSchema(
        first.location,
        name,
        first.signature,
        type,
        !requiredEverywhere,
        declarations.find((declaration) => declaration.doc)?.doc,
        declarations.find((declaration) => declaration.defaultValue !== undefined)?.defaultValue
      );
    });

    return [...merged, ...others];
  }
  toString(options?: { color?: boolean }) {
    return `${this.types.map((type) => type.toString(options)).join(' | ')}`;
  }
  toFullSignature(options?: { showDocs?: boolean }): string {
    const typeSignatures = this.types.map((type) => type.toFullSignature(options));
    let signature = typeSignatures.join(' | ');

    if (options?.showDocs && this.doc) {
      const docString = this.doc.toFullSignature();
      signature = `${docString}\n${signature}`;
    }

    return signature;
  }
  getNodes() {
    return this.types;
  }
  toObject() {
    return {
      ...super.toObject(),
      types: this.types.map((type) => type.toObject()),
    };
  }
  static fromObject(obj: Record<string, any>): TypeUnionSchema {
    const location = obj.location;
    const types = obj.types.map((type: any) => SchemaRegistry.fromObject(type));
    return new TypeUnionSchema(location, types);
  }
}
