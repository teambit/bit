/**
 * graphql schema for an extension.
 */
export type Schema = {
  typeDefs: string;
  resolvers: { [key: string]: any };
};
