import type { Node, TypeReferenceNode } from 'typescript';
import ts from 'typescript';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

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
    let type = await context.resolveType(node, name);
    if (!(type instanceof TypeRefSchema)) {
      type = new TypeRefSchema(context.getLocation(node), name);
    }
    if (node.typeArguments && type instanceof TypeRefSchema) {
      const args = await pMapSeries(node.typeArguments, (arg) => context.computeSchema(arg));
      type.withTypeArgs(args);
    }
    return type;
  }
}
