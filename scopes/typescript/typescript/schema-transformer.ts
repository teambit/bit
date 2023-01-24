import { Node } from 'typescript';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { SchemaExtractorContext } from './schema-extractor-context';
import { Identifier } from './identifier';

export type SchemaTransformer = {
  /**
   * determine whether to apply schema on given node.
   */
  predicate(node: Node): boolean;

  getIdentifiers(node: Node, context: SchemaExtractorContext): Promise<Identifier[]>;

  /**
   * transform the node into JSONSchema.
   */
  transform(node: Node, context: SchemaExtractorContext): Promise<SchemaNode>;
};
