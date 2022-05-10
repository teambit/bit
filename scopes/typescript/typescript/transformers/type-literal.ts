import ts, { Node, TypeLiteralNode } from 'typescript';
import pMapSeries from 'p-map-series';
import { TypeLiteralSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

/**
 * not to be confused with "LiteralType", which is string/boolean/null.
 * this "TypeLiteral" is an object with properties, such as: `{ a: string; b: number }`, similar to Interface.
 */
export class TypeLiteralTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeLiteral;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(typeLiteral: TypeLiteralNode, context: SchemaExtractorContext) {
    const members = await pMapSeries(typeLiteral.members, async (member) => {
      const typeSchema = await context.computeSchema(member);
      return typeSchema;
    });
    return new TypeLiteralSchema(members);
  }
}
