import type { DocumentNode } from 'graphql';
import type { SchemaDirectives } from '@graphql-modules/core';

/**
 * graphql schema for an extension.
 */
export type Schema = {
  typeDefs: DocumentNode;
  resolvers?: { [key: string]: any };
  schemaDirectives?: SchemaDirectives;
};
