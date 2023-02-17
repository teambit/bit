import ts, { Node, TypeLiteralNode } from 'typescript';
import { TypeLiteralSchema } from '@teambit/semantics.entities.semantic-schema';
import pMapSeries from 'p-map-series';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

/**
 * not to be confused with "LiteralType", which is string/boolean/null.
 * this "TypeLiteral" is an object with properties, such as: `{ a: string; b: number }`, similar to Interface.
 */
export class TypeLiteralTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeLiteral;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: TypeLiteralNode, context: SchemaExtractorContext) {
    const members = await pMapSeries(node.members, (member) => context.computeSchema(member));
    const location = context.getLocation(node);
    return new TypeLiteralSchema(location, members);
  }
}
