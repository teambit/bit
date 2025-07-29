import type { Node } from 'typescript';
import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import type { SchemaExtractorContext } from './schema-extractor-context';
import type { Identifier } from './identifier';

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

export type SchemaNodeTransformer = {
  predicate(node: SchemaNode): boolean;
  transform(node: SchemaNode, context: SchemaExtractorContext): Promise<SchemaNode | null>;
};
