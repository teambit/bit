import ts, { Node, TypeAliasDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

export class TypeAliasTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeAliasDeclaration;
  }

  async getIdentifiers(node: TypeAliasDeclaration) {
    return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
  }

  async transform() {
    return {};
  }
}
