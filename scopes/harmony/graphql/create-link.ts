import { split, ApolloLink } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';

/**
 * create a link which splits routes data depending on type of operation.
 * @param httpLink http link for apollo graphql
 * @param wsLink web socket link for apollo graphql
 */
export function createSplitLink(httpLink: ApolloLink, wsLink: ApolloLink) {
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
