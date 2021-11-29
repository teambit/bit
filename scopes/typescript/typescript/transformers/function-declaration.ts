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

  private async getArgs(funcDec: FunctionDeclarationNode, context: SchemaExtractorContext) {
    return Promise.all(
      funcDec.parameters.map(async (param) => {
        const type = param.type;
        return {
          name: param.name.getText(),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          type: await context.resolveType(type!, type?.getText() || 'any'),
        };
      })
    );
  }

  private parseReturnValue(displayString?: string) {
    if (!displayString) return '';
    const array = displayString.split(':');
    return array[array.length - 1].trim();
  }

  async transform(node: Node, context: SchemaExtractorContext): Promise<SchemaNode> {
    const funcDec = node as FunctionDeclarationNode;
    const name = this.getName(funcDec);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(funcDec.name!);
    const displaySig = info?.body?.displayString;
    const returnTypeStr = this.parseReturnValue(displaySig);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const args = await this.getArgs(funcDec, context);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const returnType = await context.resolveType(funcDec.name!, returnTypeStr);

    return new FunctionSchema(name || '', [], returnType);
  }
}
