import { DataQueryResult, useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { SchemaQueryResult, APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

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
  componentId: string,
  apiNodeRenderers?: APINodeRenderer[]
): { apiModel?: APIReferenceModel } & Omit<
  DataQueryResult<SchemaQueryResult, { extensionId: string; componentId: string }>,
  'data'
> {
  const { data, ...rest } = useDataQuery(GET_SCHEMA, {
    variables: {
      extensionId: host,
      componentId,
    },
  });

  const apiModel = data?.getHost?.getSchema ? APIReferenceModel.from(data, apiNodeRenderers) : undefined;

  return {
    ...rest,
    apiModel,
  };
}
