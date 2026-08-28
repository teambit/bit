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
   * a union of object types contributes the members of every alternative, in order. a value of the union
   * only surely has a member every alternative requires, so a member some alternative lacks or leaves
   * optional is contributed as optional.
   */
  getMembers(context: GetMembersContext = {}) {
    const perAlternative = this.types.map((type) => SchemaNode.membersOf(type, context));
    const requiredEverywhere = (name: string) =>
      perAlternative.every((members) =>
        members.some(
          (member) => member.name === name && VariableLikeSchema.isVariableLikeSchema(member) && !member.isOptional
        )
      );

    return perAlternative.flat().map((member) => {
      if (!VariableLikeSchema.isVariableLikeSchema(member) || member.isOptional || !member.name) return member;
      if (requiredEverywhere(member.name)) return member;
      return new VariableLikeSchema(
        member.location,
        member.name,
        member.signature,
        member.type,
        true,
        member.doc,
        member.defaultValue
      );
    });
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
