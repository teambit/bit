import React from 'react';
import ApolloClient from 'apollo-boost';
import { GraphQLProvider } from './graphql-provider';

export class GraphQlUI {
  constructor(private client: ApolloClient<any>) {}

  /**
   * get the graphQL provider
   */
  getProvider(rootComponent: JSX.Element) {
    return <GraphQLProvider client={this.client} root={rootComponent} />;
  }

  static async provider() {
    const client = new ApolloClient({
      uri: 'http://localhost:4000/graphql'
    });

    return new GraphQlUI(client);
  }
}
