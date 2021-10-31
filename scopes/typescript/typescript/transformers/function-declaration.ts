import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { FunctionSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, FunctionDeclaration as FunctionDeclarationNode } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';

export class FunctionDeclaration implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.FunctionDeclaration;
  }

  // need to check for anonymous functions assigned for vars, const and let.
  private getName(funcDec: FunctionDeclarationNode) {
    return funcDec.name?.getText();
  }

  private getArgs(funcDec: FunctionDeclarationNode) {
    return funcDec.parameters.map((param) => {
      return {
        name: param.name.getText(),
        type: param.type?.getText(),
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
    console.log(info, signature);

    return new FunctionSchema(name || '', [], info?.body?.displayString);
  }
}
