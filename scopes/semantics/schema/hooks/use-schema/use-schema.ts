import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';

const GET_SCHEMA = gql`
  query Schema($extensionId: String!, $componentId: String!) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      getSchema(id: $componentId)
    }
  }
`;

export function useSchema(host: string, componentId: string) {
  const { data } = useDataQuery(GET_SCHEMA, {
    variables: {
      extensionId: host,
      componentId,
    },
  });

  console.dir(APISchema.fromObject(data.getHost.getSchema));
}
