import type { BindingElement, Node } from 'typescript';
import ts from 'typescript';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { Identifier } from '../identifier';

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
    return [new Identifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(node: BindingElement, context: SchemaExtractorContext) {
    const name = node.name.getText();
    const info = await context.getQuickInfo(node.name);
    const displaySig = info?.body?.displayString || '';
    const typeStr = parseTypeFromQuickInfo(info);
    const type = await context.resolveType(node, typeStr);
    const doc = await context.jsDocToDocSchema(node);
    const defaultValue = node.initializer ? node.initializer.getText() : undefined;
    return new VariableLikeSchema(context.getLocation(node), name, displaySig, type, false, doc, defaultValue);
  }
}
