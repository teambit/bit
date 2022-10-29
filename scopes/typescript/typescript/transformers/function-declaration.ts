import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, FunctionDeclaration as FunctionDeclarationNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { toFunctionLikeSchema } from './utils/to-function-like-schema';

export class FunctionDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.FunctionDeclaration || node.kind === ts.SyntaxKind.ArrowFunction;
  }

  // need to check for anonymous functions assigned for vars, const and let.
  async getIdentifiers(funcDec: FunctionDeclarationNode) {
    return [new ExportIdentifier(this.getName(funcDec), funcDec.getSourceFile().fileName)];
  }

  private getName(funcDec: FunctionDeclarationNode) {
    return funcDec.name?.getText() || '';
  }

  async transform(funcDec: FunctionDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    return toFunctionLikeSchema(funcDec, context);
  }
}
