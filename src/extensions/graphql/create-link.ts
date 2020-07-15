import { WebSocketLink } from 'apollo-link-ws';
import { split } from 'apollo-link';
import { HttpLink } from 'apollo-boost';
import { getMainDefinition } from 'apollo-utilities';

/**
 * create a link which splits routes data depending on type of operation.
 * @param httpLink http link for apollo graphql
 * @param wsLink web socket link for apollo graphql
 */
export function createLink(httpLink: HttpLink, wsLink: WebSocketLink) {
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
