import { SchemaNode, FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, FunctionDeclaration as FunctionDeclarationNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

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

  private getArgs(funcDec: FunctionDeclarationNode, context: SchemaExtractorContext) {
    return funcDec.parameters.map((param) => {
      return {
        name: param.name.getText(),
        type: context.resolveType(param.type!),
      };
    });
  }

  private parseReturnValue(displayString?: string) {
    if (!displayString) return '';
    const [, type] = displayString.split(':');
    return type.trim();
  }

  async transform(node: Node, context: SchemaExtractorContext): Promise<SchemaNode> {
    const funcDec = node as FunctionDeclarationNode;
    const name = this.getName(funcDec);
    const info = await context.getQuickInfo(funcDec.name!);
    const displaySig = info?.body?.displayString;
    const signature = this.parseReturnValue(displaySig);
    const returnType = await context.resolveType(funcDec.type);
    console.log(info, signature);

    return new FunctionSchema(name || '', this.getArgs(funcDec, context), info?.body?.displayString);
  }
}
