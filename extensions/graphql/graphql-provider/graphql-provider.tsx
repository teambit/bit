import React from 'react';
import ApolloClient from 'apollo-boost';
import { ApolloProvider } from '@apollo/react-hooks';

export type GraphQLProviderProps = {
  client: ApolloClient<any>;
  children: JSX.Element;
};

export function GraphQLProvider({ client, children }: GraphQLProviderProps) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
