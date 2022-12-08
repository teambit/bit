import ts, { Node, TypeReferenceNode } from 'typescript';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

/**
 * In the following example, `AriaButtonProps` is a type reference
 * ```ts
 * import type { AriaButtonProps } from '@react-types/button';
 * export type ButtonProps = AriaButtonProps & { a: string };
 * ```
 */
export class TypeReferenceTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeReference;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: TypeReferenceNode, context: SchemaExtractorContext) {
    const name = node.typeName.getText();
    // console.log("🚀 ~ file: type-reference.ts:27 ~ TypeReferenceTransformer ~ transform ~ name", name)
    const type = await context.resolveType(node, name, false);
    // console.log("🚀 ~ file: type-reference.ts:28 ~ TypeReferenceTransformer ~ transform ~ type", type)
    if (node.typeArguments && type instanceof TypeRefSchema) {
      const args = await pMapSeries(node.typeArguments, (arg) => context.computeSchema(arg));
      type.typeArgs = args;
    }
    return type;
  }
}
