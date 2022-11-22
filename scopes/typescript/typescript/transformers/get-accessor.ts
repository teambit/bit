import ts, { Node, GetAccessorDeclaration } from 'typescript';
import { GetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';

export class GetAccessorTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.GetAccessor;
  }

  async getIdentifiers(): Promise<ExportIdentifier[]> {
    return [];
  }

  async transform(node: GetAccessorDeclaration, context: SchemaExtractorContext) {
    const info = await context.getQuickInfo(node.name);
    const displaySig = info?.body?.displayString || '';
    const typeStr = parseTypeFromQuickInfo(info);
    const type = await context.resolveType(node, typeStr);
    return new GetAccessorSchema(context.getLocation(node), node.name.getText(), type, displaySig);
  }
}
