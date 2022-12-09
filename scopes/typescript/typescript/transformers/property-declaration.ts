import { Node, PropertyDeclaration, PropertySignature, SyntaxKind } from 'typescript';
import { VariableLikeSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { Identifier } from '../identifier';

export class PropertyDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.PropertyDeclaration || node.kind === SyntaxKind.PropertySignature;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  // [computedName]: string
  private isComputedProperty(node: PropertyDeclaration | PropertySignature) {
    return node.name.kind === SyntaxKind.ComputedPropertyName;
  }

  // @todo - handle arrow function objects
  async transform(node: PropertyDeclaration | PropertySignature, context: SchemaExtractorContext) {
    // console.log("🚀 ~ file: property-declaration.ts:19 ~ PropertyDeclarationTransformer ~ transform ~ node", node)

    const name = node.name.getText();
    const info = this.isComputedProperty(node) ? undefined : await context.getQuickInfo(node.name);
    const displaySig = info?.body?.displayString || node.getText();
    const typeStr = parseTypeFromQuickInfo(info);
    // console.log("🚀 ~ file: property-declaration.ts:24 ~ PropertyDeclarationTransformer ~ transform ~ typeStr", typeStr)
    const type = await context.resolveType(node, typeStr);
    const isOptional = Boolean(node.questionToken);
    const doc = await context.jsDocToDocSchema(node);
    return new VariableLikeSchema(context.getLocation(node), name, displaySig, type, isOptional, doc);
  }
}
