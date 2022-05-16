import { SchemaNode, FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, MethodSignature as MethodSignatureNode } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { parseTypeFromQuickInfo } from './utils/parse-type-from-quick-info';
import { getParams } from './utils/get-params';

export class MethodSignatureTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.MethodSignature;
  }

  getName(node: MethodSignatureNode) {
    return node.name.getText();
  }

  async getIdentifiers() {
    return [];
  }

  async transform(methodSig: MethodSignatureNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(methodSig);
    const info = await context.getQuickInfo(methodSig.name);
    const displaySig = info?.body?.displayString;
    const returnTypeStr = parseTypeFromQuickInfo(info);
    const args = await getParams(methodSig.parameters, context);
    const returnType = await context.resolveType(methodSig, returnTypeStr);
    return new FunctionSchema(name, args, returnType, displaySig || '');
  }
}
