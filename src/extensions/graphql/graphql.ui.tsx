import React from 'react';
import ApolloClient from 'apollo-client';
import { HttpLink } from 'apollo-link-http';
import { ApolloLink } from 'apollo-link';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { WebSocketLink } from 'apollo-link-ws';
import { onError } from 'apollo-link-error';
import { GraphQLProvider } from './graphql-provider';
import { createLink } from './create-link';

export class GraphQlUI {
  constructor(
    /**
     * apollo client.
     */
    private client: ApolloClient<any>
  ) {}

  /**
   * get the graphQL provider
   */
  getProvider = ({ children }: { children: JSX.Element }) => {
    return <GraphQLProvider client={this.client}>{children}</GraphQLProvider>;
  };

  static async provider() {
    const httpLink = new HttpLink({
      uri: 'http://localhost:4000/graphql'
    });

    const wsLink = new WebSocketLink({
      uri: 'ws://localhost:4000/subscriptions',
      options: {
        reconnect: true
      }
    });

    const client = new ApolloClient({
      link: ApolloLink.from([
        onError(({ graphQLErrors, networkError }) => {
          if (graphQLErrors)
            graphQLErrors.forEach(({ message, locations, path }) =>
              // eslint-disable-next-line no-console
              console.log(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`)
            );
          // eslint-disable-next-line no-console
          if (networkError) console.log(`[Network error]: ${networkError}`);
        }),
        createLink(httpLink, wsLink)
      ]),
      cache: new InMemoryCache()
    });

    return new GraphQlUI(client);
  }
}
