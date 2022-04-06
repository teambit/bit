import ts, { Node, TypeAliasDeclaration } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
// import { ExportIdentifier } from '../export-identifier';

export class TypeAliasTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.TypeAliasDeclaration;
  }

  async getIdentifiers(node: TypeAliasDeclaration) {
    // return [new ExportIdentifier(node.name.getText(), node.getSourceFile().fileName)];
    return [];
  }

  async transform(node: Node) {
    const typeAlias = node as TypeAliasDeclaration;
    typeAlias.typeParameters;
    // typeAlias.
    return {};
  }
}
