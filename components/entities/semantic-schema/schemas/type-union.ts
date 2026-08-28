import type { GetMembersContext, SchemaLocation } from '../schema-node';
import { SchemaNode } from '../schema-node';
import { SchemaRegistry } from '../schema-registry';

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
   * a union of object types contributes the members of every alternative, in order. a member that only
   * some alternatives declare is still listed, as declared by the first alternative that has it.
   */
  getMembers(context: GetMembersContext = {}) {
    return this.types.flatMap((type) => SchemaNode.membersOf(type, context));
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
