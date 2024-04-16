import { useQuery as useDataQuery, DocumentNode } from '@apollo/client';
import { gql } from 'graphql-tag';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

const GET_SCHEMA: DocumentNode = gql`
  query Schema($componentId: String!, $skipInternals: Boolean) {
    getHost {
      id # used for GQL caching
      getSchema(id: $componentId, skipInternals: $skipInternals)
    }
  }
`;

export function useAPI(
  componentId?: string,
  apiNodeRenderers: APINodeRenderer[] = [],
  options?: {
    skipInternals?: boolean;
  }
): { apiModel?: APIReferenceModel; loading?: boolean } {
  const { data, loading } = useDataQuery(GET_SCHEMA, {
    variables: {
      componentId,
      skipInternals: options?.skipInternals,
      skip: !componentId,
    },
  });

  const apiModel = data?.getHost?.getSchema ? APIReferenceModel.from(data, apiNodeRenderers) : undefined;

  return {
    loading,
    apiModel,
  };
}
