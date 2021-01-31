import { HttpLink, split } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import type { WebSocketLink } from '@apollo/client/link/ws';

/**
 * create a link which splits routes data depending on type of operation.
 * @param httpLink http link for apollo graphql
 * @param wsLink web socket link for apollo graphql
 */
export function createSplitLink(httpLink: HttpLink, wsLink: WebSocketLink) {
  return split(
    // split based on operation type
    ({ query }) => {
      const definition = getMainDefinition(query);
      return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
    },
    wsLink,
    httpLink
  );
}
