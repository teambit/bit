import ts, { Node, VariableStatement } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

export class VariableStatementTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.VariableStatement;
  }

  async getIdentifiers(node: VariableStatement) {
    return node.declarationList.declarations.map((dec) => {
      return new ExportIdentifier(dec.name.getText(), dec.getSourceFile().fileName);
    });
  }

  async transform() {
    return {};
  }
}
