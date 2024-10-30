import { PropertyAssignmentSchema } from '@teambit/semantics.entities.semantic-schema';
import ts, { Node, PropertyAssignment } from 'typescript';
import { SchemaExtractorContext } from '../schema-extractor-context';
import { SchemaTransformer } from '../schema-transformer';
import { Identifier } from '../identifier';

export class PropertyAssignmentTransformer implements SchemaTransformer {
  predicate(node: Node): boolean {
    return node.kind === ts.SyntaxKind.PropertyAssignment;
  }

  async getIdentifiers(): Promise<Identifier[]> {
    return [];
  }

  async transform(node: PropertyAssignment, context: SchemaExtractorContext): Promise<any> {
    const name = node.name.getText();
    const value = await context.computeSchema(node.initializer);
    const location = context.getLocation(node);
    const docs = await context.jsDocToDocSchema(node);
    return new PropertyAssignmentSchema(name, value, location, docs);
  }
}
