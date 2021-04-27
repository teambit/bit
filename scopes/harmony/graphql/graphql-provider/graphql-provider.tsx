import React, { ReactNode } from 'react';
import { ApolloProvider } from '@apollo/client';
import type { GraphQLClient } from '../graphql.ui.runtime';

export type GraphQLProviderProps = {
  client: GraphQLClient<any>;
  children: ReactNode;
};

export function GraphQLProvider({ client, children }: GraphQLProviderProps) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
