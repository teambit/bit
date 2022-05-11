import { SchemaNode, FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, MethodDeclaration as MethodDeclarationNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { getParams } from './utils/get-params';

export class MethodDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.MethodDeclaration;
  }

  async getIdentifiers(funcDec: MethodDeclarationNode) {
    return [new ExportIdentifier(this.getName(funcDec), funcDec.getSourceFile().fileName)];
  }

  private getName(funcDec: MethodDeclarationNode) {
    return funcDec.name?.getText() || '';
  }

  async transform(methodDec: MethodDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(methodDec);
    const info = await context.getQuickInfo(methodDec.name);
    const displaySig = info?.body?.displayString;
    const returnTypeStr = parseTypeFromQuickInfo(info);
    const args = await getParams(methodDec.parameters, context);
    const returnType = await context.resolveType(methodDec, returnTypeStr);
    return new FunctionSchema(name, args, returnType, displaySig || '');
  }
}
