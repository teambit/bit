import { SchemaNode, VariableSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { isComputedPropertyName, Node, PropertySignature as PropertySignatureNode } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';

export class PropertySignature implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.PropertySignature;
  }

  getName(node: PropertySignatureNode) {
    return node.name.getText();
  }

  async getIdentifiers() {
    return [];
  }

  async transform(prop: PropertySignatureNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(prop);
    const info = isComputedPropertyName(prop.name) ? undefined : await context.getQuickInfo(prop.name);
    const displaySig = info?.body?.displayString || '';
    const typeStr = parseTypeFromQuickInfo(info);
    const type = await context.resolveType(prop, typeStr);
    return new VariableSchema(context.getLocation(prop), name, displaySig, type);
  }
}
