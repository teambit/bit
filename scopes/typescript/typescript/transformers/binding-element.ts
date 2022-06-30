import ts, { BindingElement, Node } from 'typescript';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { jsDocToDocSchema } from './utils/jsdoc-to-doc-schema';

/**
 * for example:
 *
 * const objBindingElem = { elem1: 1, elem2: 2 };
 * const { elem1 } = objBindingElem;
 * export { elem1 };
 */
export class BindingElementTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.BindingElement;
  }

  async getIdentifiers(node: BindingElement) {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(node: BindingElement, context: SchemaExtractorContext) {
    const name = node.name.getText();
    const info = await context.getQuickInfo(node.name);
    const displaySig = info?.body?.displayString || '';
    const typeStr = parseTypeFromQuickInfo(info);
    const type = await context.resolveType(node, typeStr);
    const doc = await jsDocToDocSchema(node, context);
    return new VariableLikeSchema(context.getLocation(node), name, displaySig, type, false, doc);
  }
}
