import { Node, SyntaxKind, TypeParameterDeclaration } from 'typescript';
import { TypeParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaTransformer } from '../schema-transformer';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { Identifier } from '../identifier';

export class TypeParameterTransformer implements SchemaTransformer {
  predicate(node: Node) {
    return node.kind === SyntaxKind.TypeParameter;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: TypeParameterDeclaration, context: SchemaExtractorContext) {
    const location = context.getLocation(node);
    return new TypeParameterSchema(location, node.name.getText());
  }
}
