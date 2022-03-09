import type { DocumentNode } from 'graphql';
import { SchemaDirectiveVisitor } from 'graphql-tools';

/**
 * graphql schema for an extension.
 */

export type Schema = {
  typeDefs: DocumentNode;
  resolvers?: { [key: string]: any };
  schemaDirectives?: { [key: string]: SchemaDirectiveVisitor };
};
