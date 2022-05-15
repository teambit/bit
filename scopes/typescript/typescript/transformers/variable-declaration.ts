import { SchemaNode, VariableSchema, FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, VariableDeclaration as VariableDeclarationNode, ArrowFunction } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';
import { getParams } from './utils/get-params';
import { parseReturnTypeFromQuickInfo, parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';

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
    const info = await context.getQuickInfo(varDec.name);
    const displaySig = info?.body?.displayString || '';
    if (varDec.initializer?.kind === ts.SyntaxKind.ArrowFunction) {
      const args = await getParams((varDec.initializer as ArrowFunction).parameters, context);
      const typeStr = parseReturnTypeFromQuickInfo(info);
      const returnType = await context.resolveType(varDec, typeStr);
      return new FunctionSchema(name, args, returnType, displaySig);
    }
    const typeStr = parseTypeFromQuickInfo(info);
    const type = await context.resolveType(varDec, typeStr);
    return new VariableSchema(name, displaySig, type);
  }
}
