import { Node } from 'typescript';
import { JSONSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { SchemaExtractorContext } from './schema-extractor-context';

export type SchemaTransformer = {
  /**
   * determine whether to apply schema on given node.
   */
  predicate(node: Node): boolean;

  /**
   * transform the node into JSONSchema.
   */
  transform(node: Node, tsserver: SchemaExtractorContext): Promise<SchemaNode>;
};
