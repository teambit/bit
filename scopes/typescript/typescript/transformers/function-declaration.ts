import { SchemaNode, FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, FunctionDeclaration as FunctionDeclarationNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { getParams } from './utils/get-params';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';

export class FunctionDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.FunctionDeclaration;
  }

  // need to check for anonymous functions assigned for vars, const and let.
  async getIdentifiers(funcDec: FunctionDeclarationNode) {
    return [new ExportIdentifier(this.getName(funcDec), funcDec.getSourceFile().fileName)];
  }

  private getName(funcDec: FunctionDeclarationNode) {
    return funcDec.name?.getText() || '';
  }

  async transform(funcDec: FunctionDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(funcDec);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(funcDec.name!);
    const displaySig = info?.body?.displayString;
    const returnTypeStr = parseTypeFromQuickInfo(displaySig);
    const args = await getParams(funcDec.parameters, context);
    const returnType = await context.resolveType(funcDec, returnTypeStr);

    return new FunctionSchema(name, args, returnType, displaySig || '');
  }
}
