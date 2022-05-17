import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, MethodDeclaration as MethodDeclarationNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { toFunctionLikeSchema } from './utils/to-function-schema';

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
    return toFunctionLikeSchema(methodDec, context);
  }
}
