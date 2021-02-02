import fetch from 'node-fetch';
import { setContext } from 'apollo-link-context';
import { HttpLink } from 'apollo-link-http';
import { makeRemoteExecutableSchema, introspectSchema } from 'apollo-server';
import { WebSocketLink } from 'apollo-link-ws';
import { split } from 'apollo-link';
import { getMainDefinition } from 'apollo-utilities';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import ws from 'ws';
import { GraphQLServer } from '../graphql-server';

async function getRemoteSchema({ uri, subscriptionsUri }) {
  // @ts-ignore
  const http = new HttpLink({ uri, fetch });
  const httpLink = setContext((request, previousContext) => {
    return {
      headers: previousContext?.graphqlContext?.headers,
    };
  }).concat(http);

  if (!subscriptionsUri) {
    return makeRemoteExecutableSchema({
      schema: await introspectSchema(httpLink),
      link: httpLink,
    });
  }

  // Create WebSocket link with custom client
  const client = new SubscriptionClient(subscriptionsUri, { reconnect: true }, ws);
  const wsLink = new WebSocketLink(client);

  // Using the ability to split links, we can send data to each link
  // depending on what kind of operation is being sent
  const link = split(
    (operation) => {
      const definition = getMainDefinition(operation.query);
      return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
    },
    wsLink,
    httpLink
  );

  return makeRemoteExecutableSchema({
    schema: await introspectSchema(httpLink),
    link,
  });
}

export async function createRemoteSchemas(servers: GraphQLServer[]) {
  const schemasP = servers.map(async (server) => {
    return getRemoteSchema({
      uri: server.uri,
      subscriptionsUri: server.subscriptionsUri,
    });
  });

  return Promise.all(schemasP);
}
