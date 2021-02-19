import type { DocumentNode } from 'graphql';

/**
 * graphql schema for an extension.
 */
export type Schema = {
  typeDefs?: string | DocumentNode;
  resolvers?: { [key: string]: any };
};
