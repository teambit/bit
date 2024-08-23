import { ApolloClient, InMemoryCache, HttpLink, split, NormalizedCacheObject, ApolloLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getMainDefinition } from '@apollo/client/utilities';
import { fetch as crossFetch } from 'cross-fetch';
import { getIntrospectionQuery, buildClientSchema, GraphQLSchema } from 'graphql';
import { wrapSchema } from '@graphql-tools/wrap';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import ws from 'ws';
import { createClient } from 'graphql-ws';
import { GraphQLServer } from '../graphql-server';

async function createApolloClient(
  uri: string,
  subscriptionsUri?: string
): Promise<{
  client: ApolloClient<NormalizedCacheObject>;
  remoteSchema: GraphQLSchema;
}> {
  const httpLink = new HttpLink({ uri, fetch: crossFetch });
  const introspectionResponse = await crossFetch(uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });

  const { data } = await introspectionResponse.json();
  const remoteSchema = buildClientSchema(data);

  const wrappingLink = new ApolloLink((operation, forward) => {
    return forward(operation).map((response) => {
      const context = operation.getContext();
      if (context?.response?.headers?.get('set-cookie')) {
        context?.graphqlContext?.res?.setHeader('set-cookie', context?.response?.headers?.get('set-cookie'));
      }
      return response;
    });
  });
  const contextLink = setContext((_, prevContext) => {
    return {
      headers: prevContext.graphqlContext?.req?.headers,
      req: prevContext.graphqlContext?.req,
      rootValue: { req: prevContext.graphqlContext?.req },
    };
  });

  const link = contextLink.concat(wrappingLink).concat(httpLink);

  if (subscriptionsUri) {
    const wsLink = new GraphQLWsLink(
      createClient({
        url: subscriptionsUri,
        webSocketImpl: ws,
      })
    );

    const splitLink = split(
      ({ query }) => {
        const definition = getMainDefinition(query);
        return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
      },
      wsLink,
      link
    );

    return {
      client: new ApolloClient({
        link: splitLink,
        cache: new InMemoryCache(),
      }),
      remoteSchema,
    };
  }

  return {
    client: new ApolloClient({
      link,
      cache: new InMemoryCache(),
    }),
    remoteSchema,
  };
}

async function getRemoteSchema({
  uri,
  subscriptionsUri,
}: {
  uri: string;
  subscriptionsUri?: string;
}): Promise<GraphQLSchema> {
  const { client, remoteSchema } = await createApolloClient(uri, subscriptionsUri);

  return wrapSchema({
    schema: remoteSchema,
    executor: async ({ document, variables, context }) => {
      const fetchResult: any = await client.query({
        query: document,
        variables,
        fetchPolicy: 'network-only',
        context: {
          graphqlContext: context,
        },
      });
      return fetchResult as any;
    },
  });
}

export async function createRemoteSchemas(servers: GraphQLServer[]): Promise<GraphQLSchema[]> {
  const schemasP = servers.map(async (server) => {
    return getRemoteSchema({
      uri: server.uri,
      subscriptionsUri: server.subscriptionsUri,
    });
  });

  return Promise.all(schemasP);
}
