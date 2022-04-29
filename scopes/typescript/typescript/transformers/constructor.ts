import pMapSeries from 'p-map-series';
import { SchemaNode, ConstructorSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, ConstructorDeclaration } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';

export class Constructor implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.Constructor;
  }

  async getIdentifiers(node: ConstructorDeclaration) {
    return [new ExportIdentifier('constructor', node.getSourceFile().fileName)];
  }

  private async getArgs(constructorDec: ConstructorDeclaration, context: SchemaExtractorContext) {
    return pMapSeries(constructorDec.parameters, async (param) => {
      const type = param.type;
      return {
        name: param.name.getText(),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        type: await context.resolveType(type!, type?.getText() || 'any'),
      };
    });
  }

  async transform(constructorDec: ConstructorDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
    const args = await this.getArgs(constructorDec, context);

    return new ConstructorSchema(args);
  }
}
