import { SchemaNode, VariableSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, PropertyDeclaration as PropertyDeclarationNode } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class PropertyDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.PropertyDeclaration;
  }

  getName(node: PropertyDeclarationNode) {
    return node.name.getText();
  }

  async getIdentifiers(node: PropertyDeclarationNode) {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(propertyDec: PropertyDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(propertyDec);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(propertyDec.name!);
    const displaySig = info?.body?.displayString;

    return new VariableSchema(name || '', displaySig || '');
  }
}
