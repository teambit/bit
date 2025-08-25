import type { Node, ModuleDeclaration } from 'typescript';
import ts from 'typescript';
import { UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaTransformer } from '../schema-transformer';
import type { SchemaExtractorContext } from '../schema-extractor-context';
import type { Identifier } from '../identifier';

export class ModuleDeclarationTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === ts.SyntaxKind.ModuleDeclaration;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: ModuleDeclaration, context: SchemaExtractorContext) {
    const location = context.getLocation(node);
    return new UnImplementedSchema(location, node.getText(), ts.SyntaxKind[node.kind]);
  }
}
