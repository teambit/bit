import { SchemaNode, VariableSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, VariableDeclaration as VariableDeclarationNode } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

export class VariableDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.VariableDeclaration;
  }

  getName(node: VariableDeclarationNode) {
    return node.name.getText();
  }

  async getIdentifiers(node: VariableDeclarationNode) {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform(varDec: VariableDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(varDec);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(varDec.name!);
    const displaySig = info?.body?.displayString;

    return new VariableSchema(name || '', displaySig || '');
  }
}
