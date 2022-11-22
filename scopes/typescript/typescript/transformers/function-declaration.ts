import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, SignatureDeclaration } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { toFunctionLikeSchema } from './utils/to-function-like-schema';

export class FunctionDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return (
      node.kind === ts.SyntaxKind.FunctionDeclaration ||
      node.kind === ts.SyntaxKind.ArrowFunction ||
      node.kind === ts.SyntaxKind.MethodDeclaration ||
      node.kind === ts.SyntaxKind.CallSignature ||
      node.kind === ts.SyntaxKind.ConstructSignature ||
      node.kind === ts.SyntaxKind.IndexSignature ||
      node.kind === ts.SyntaxKind.FunctionType
    );
  }

  // need to check for anonymous functions assigned for vars, const and let.
  async getIdentifiers(funcDec: SignatureDeclaration) {
    return [new ExportIdentifier(this.getName(funcDec), funcDec.getSourceFile().fileName)];
  }

  private getName(funcDec: SignatureDeclaration) {
    if (funcDec.kind === ts.SyntaxKind.ConstructSignature) return 'new';
    return funcDec.name?.getText() || '';
  }

  async transform(funcDec: SignatureDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
    return toFunctionLikeSchema(funcDec, context);
  }
}
