import { UIRuntime } from '@teambit/ui';
import { InMemoryCache } from 'apollo-cache-inmemory';
import ApolloClient, { ApolloQueryResult, QueryOptions } from 'apollo-client';
import { ApolloLink } from 'apollo-link';
import { onError } from 'apollo-link-error';
import { HttpLink } from 'apollo-link-http';
import { WebSocketLink } from 'apollo-link-ws';
import React from 'react';

import { createLink } from './create-link';
import { GraphQLProvider } from './graphql-provider';
import { GraphqlAspect } from './graphql.aspect';

export class GraphqlUI {
  constructor(
    /**
     * apollo client.
     */
    private client: ApolloClient<any>
  ) {}

  async query(options: QueryOptions): Promise<ApolloQueryResult<any>> {
    return this.client.query(options);
  }

  /**
   * get the graphQL provider
   */
  getProvider = ({ children }: { children: JSX.Element }) => {
    return <GraphQLProvider client={this.client}>{children}</GraphQLProvider>;
  };

  static runtime = UIRuntime;

  static async provider() {
    const httpLink = new HttpLink({
      uri: `${(window.location.protocol === 'https:' ? 'https://' : 'http://') + window.location.host}/graphql`,
    });

    const wsLink = new WebSocketLink({
      uri: `${(window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host}/subscriptions`,
      options: {
        reconnect: true,
      },
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
        createLink(httpLink, wsLink),
      ]),
      cache: new InMemoryCache({
        // @ts-ignore TODO: @uri please fix this: see https://stackoverflow.com/questions/48840223/apollo-duplicates-first-result-to-every-node-in-array-of-edges
        dataIdFromObject: (o) => (o._id ? `${o.__typename}:${o._id}` : null),
      }),
    });

    return new GraphqlUI(client);
  }
}

GraphqlAspect.addRuntime(GraphqlUI);
