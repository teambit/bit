import pMapSeries from 'p-map-series';
import { SchemaNode, FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, MethodDeclaration as MethodDeclarationNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

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

  private async getArgs(funcDec: MethodDeclarationNode, context: SchemaExtractorContext) {
    return pMapSeries(funcDec.parameters, async (param) => {
      const type = param.type;
      console.log('type', type.kind);
      return {
        name: param.name.getText(),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        type: await context.resolveType(type!, type?.getText() || 'any'),
      };
    });
  }

  private parseReturnValue(displayString?: string) {
    if (!displayString) return '';
    const array = displayString.split(':');
    return array[array.length - 1].trim();
  }

  async transform(methodDec: MethodDeclarationNode, context: SchemaExtractorContext): Promise<SchemaNode> {
    const name = this.getName(methodDec);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const info = await context.getQuickInfo(methodDec.name!);
    const displaySig = info?.body?.displayString;
    const returnTypeStr = this.parseReturnValue(displaySig);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const args = await this.getArgs(methodDec, context);
    const returnType = await context.resolveType(methodDec, returnTypeStr, Boolean(methodDec.type));
    return new FunctionSchema(name || '', args, returnType, displaySig || '');
  }
}
