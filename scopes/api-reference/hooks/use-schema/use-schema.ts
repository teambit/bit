import { useQuery as useDataQuery, DocumentNode } from '@apollo/client';
import { gql } from 'graphql-tag';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';

const GET_SCHEMA: DocumentNode = gql`
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
  apiNodeRenderers: APINodeRenderer[]
): { apiModel?: APIReferenceModel; loading?: boolean } {
  const { data, loading } = useDataQuery(GET_SCHEMA, {
    variables: {
      extensionId: host,
      componentId,
    },
  });

  const apiModel = data?.getHost?.getSchema ? APIReferenceModel.from(data, apiNodeRenderers) : undefined;

  return {
    loading,
    apiModel,
  };
}
