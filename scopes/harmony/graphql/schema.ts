import type { DocumentNode } from 'graphql';

/**
 * graphql schema for an extension.
 */
export type Schema = {
  typeDefs: DocumentNode;
  resolvers?: { [key: string]: any };
};
