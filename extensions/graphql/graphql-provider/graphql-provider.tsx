import { ApolloProvider } from '@apollo/react-hooks';
import ApolloClient from 'apollo-boost';
import React from 'react';

export type GraphQLProviderProps = {
  client: ApolloClient<any>;
  children: JSX.Element;
};

export function GraphQLProvider({ client, children }: GraphQLProviderProps) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
