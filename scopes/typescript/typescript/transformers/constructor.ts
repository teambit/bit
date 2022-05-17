import { SchemaNode, ConstructorSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, ConstructorDeclaration } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { ExportIdentifier } from '../export-identifier';
import { getParams } from './utils/get-params';

export class Constructor implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.Constructor;
  }

  async getIdentifiers(node: ConstructorDeclaration) {
    return [new ExportIdentifier('constructor', node.getSourceFile().fileName)];
  }

  async transform(constructorDec: ConstructorDeclaration, context: SchemaExtractorContext): Promise<SchemaNode> {
    const args = await getParams(constructorDec.parameters, context);

    return new ConstructorSchema(args);
  }
}
