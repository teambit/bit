import { SchemaNode, VariableSchema, FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, VariableDeclaration as VariableDeclarationNode, ArrowFunction } from 'typescript';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { ExportIdentifier } from '../export-identifier';

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

  private parseReturnValue(displayString?: string) {
    if (!displayString) return '';
    const array = displayString.split(':');
    return array[array.length - 1].trim();
  }

  private async getArgs(funcDec: ArrowFunction, context: SchemaExtractorContext) {
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

  async transform(varDec: VariableDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(varDec);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(varDec.name!);
    const displaySig = info?.body?.displayString;
    const typeStr = this.parseReturnValue(displaySig);
    if (varDec.initializer?.kind === ts.SyntaxKind.ArrowFunction) {
      const args = this.getArgs(varDec.initializer as ArrowFunction, context);
      const returnType = await context.resolveType(varDec.initializer, typeStr);
      return new FunctionSchema(name, args, returnType, displaySig);
    }
    const type = await context.resolveType(varDec, typeStr, false);
    return new VariableSchema(name || '', displaySig || '', type);
  }
}
