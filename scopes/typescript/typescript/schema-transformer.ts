import { Node } from 'typescript';
import { JSONSchema } from '@teambit/semantics.entities.semantic-schema';

export type SchemaTransformer = {
  /**
   * determine whether to apply schema on given node.
   */
  predicate(node: Node): boolean;

  /**
   * transform the node into JSONSchema.
   */
  transform(node: Node): JSONSchema;
};
