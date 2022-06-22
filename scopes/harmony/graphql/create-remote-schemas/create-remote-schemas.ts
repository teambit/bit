import fetch from 'cross-fetch';
import { makeRemoteExecutableSchema, introspectSchema } from 'apollo-server';
import { createClient } from 'graphql-ws';
import { ApolloLink, HttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { setContext } from '@apollo/client/link/context';

import { GraphQLServer } from '../graphql-server';

async function getRemoteSchema({ uri, subscriptionsUri }) {
  const wrappingLink = new ApolloLink((operation, forward) => {
    return forward(operation).map((response) => {
      const context = operation.getContext();
      if (context?.response?.headers?.get('set-cookie')) {
        context?.graphqlContext?.res?.setHeader('set-cookie', context?.response?.headers?.get('set-cookie'));
      }
      return response;
    });
  });
  const http = new HttpLink({ uri, fetch });
  const httpLink = setContext((request, previousContext) => {
    return {
      headers: previousContext?.graphqlContext?.headers,
    };
  })
    .concat(wrappingLink)
    .concat(http);

  if (!subscriptionsUri) {
    return makeRemoteExecutableSchema({
      // TODO
      schema: await introspectSchema(httpLink),
      link: httpLink,
    });
  }

  // Create WebSocket link with custom client
  const wsLink = new GraphQLWsLink(createClient({ url: subscriptionsUri }));

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
    // TODO
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
