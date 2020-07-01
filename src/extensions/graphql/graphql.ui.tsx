import React from 'react';
import ApolloClient from 'apollo-boost';
import { GraphQLProvider } from './graphql-provider';

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

  // @HACK should be async
  static provider() {
    const client = new ApolloClient({
      uri: 'http://localhost:4000/graphql'
    });

    return new GraphQlUI(client);
  }
}
