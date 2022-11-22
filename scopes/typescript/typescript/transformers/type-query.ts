import ts, { Node, TypeQueryNode } from 'typescript';
import { TypeQuerySchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class TypeQueryTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeQuery;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: TypeQueryNode, context: SchemaExtractorContext) {
    const displaySig = await context.getQuickInfoDisplayString(node.exprName);
    const type = await context.resolveType(node.exprName, node.exprName.getText(), false);
    const location = context.getLocation(node);
    return new TypeQuerySchema(location, type, displaySig);
  }
}
