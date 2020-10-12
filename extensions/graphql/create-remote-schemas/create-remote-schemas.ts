import fetch from 'node-fetch';
import { wrapSchema, introspectSchema, AsyncExecutor } from 'graphql-tools';
import { print } from 'graphql';
import { GraphQLServer } from '../graphql-server';

export function getExecutor(uri: string): AsyncExecutor {
  return async ({ document, variables }) => {
    const query = print(document);
    const fetchResult = await fetch(uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization: `Bearer ${context ? context.authKey || '' : ''}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    return fetchResult.json();
  };
}

export async function createRemoteSchemas(servers: GraphQLServer[]) {
  const schemasP = servers.map(async (server) => {
    const executor = getExecutor(server.uri);
    return wrapSchema({
      schema: await introspectSchema(executor),
      executor,
    });
  });

  return Promise.all(schemasP);
}
