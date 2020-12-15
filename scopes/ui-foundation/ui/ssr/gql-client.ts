import { ApolloProvider } from '@apollo/react-common';
import { ApolloClient } from 'apollo-client';
import { createHttpLink } from 'apollo-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import crossFetch from 'cross-fetch';

// WORK IN PROGRESS
// this will move to gql aspect

export function makeSsrGqlClient() {
  const client = new ApolloClient({
    ssrMode: true,
    link: createHttpLink({
      credentials: 'same-origin',
      uri: 'http://localhost:3000/graphql',
      headers: {},
      fetch: crossFetch,
    }),
    cache: new InMemoryCache({
      dataIdFromObject: () => null,
    }),
  });

  return client;
}

export function getGqlProvider() {
  return ApolloProvider;
}
