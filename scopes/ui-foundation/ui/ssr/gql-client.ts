import { ApolloProvider } from '@apollo/react-common';
import { ApolloClient } from 'apollo-client';
import { createHttpLink } from 'apollo-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import crossFetch from 'cross-fetch';
import { ComponentID } from '@teambit/component';

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
      dataIdFromObject: (o) => {
        switch (o.__typename) {
          case 'Component':
            return ComponentID.fromObject(o.id).toString();
          case 'ComponentHost':
            return 'ComponentHost';
          case 'ComponentID':
            return `id__${ComponentID.fromObject(o).toString()}`;
          case 'ReactDocs':
            return null;
          default:
            // @ts-ignore
            return o.__id || o.id || null;
        }
      },
    }),
  });

  return client;
}

export function getGqlProvider() {
  return ApolloProvider;
}
