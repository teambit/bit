import React from 'react';
import ApolloClient from 'apollo-boost';
import { ApolloProvider } from '@apollo/react-hooks';

export type GraphQLProviderProps = {
  client: ApolloClient<any>;
  root: JSX.Element;
};

export function GraphQLProvider({ client, root }: GraphQLProviderProps) {
  return <ApolloProvider client={client}>{root}</ApolloProvider>;
}
