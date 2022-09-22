import { DataQueryResult, useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { APISchema } from '@teambit/semantics.entities.semantic-schema';
import { SchemaQueryResult } from '@teambit/api-reference.models.api-reference-model';

const GET_SCHEMA = gql`
  query Schema($extensionId: String!, $componentId: String!) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      getSchema(id: $componentId)
    }
  }
`;

export function useSchema(
  host: string,
  componentId: string
): { api?: APISchema } & Omit<
  DataQueryResult<SchemaQueryResult, { extensionId: string; componentId: string }>,
  'data'
> {
  const { data, ...rest } = useDataQuery(GET_SCHEMA, {
    variables: {
      extensionId: host,
      componentId,
    },
  });

  return {
    ...rest,
    api: data?.getHost?.getSchema && APISchema.fromObject(data.getHost.getSchema),
  };
}
