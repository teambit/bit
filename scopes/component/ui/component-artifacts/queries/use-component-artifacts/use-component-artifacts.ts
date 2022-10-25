import { gql } from '@apollo/client';
import { useDataQuery, DataQueryResult } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { mapToArtifacts, Artifact } from '@teambit/component.ui.artifacts.models.component-artifacts-model';

const ARTIFACTS_QUERY = gql`
  query ComponentArtifacts($id: String!, $extensionId: String!) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        id {
          name
          version
          scope
        }
        pipelineReport {
          id
          taskId
          taskName
          artifact {
            id
            name
            description
            files {
              id
              name
              path
              content
              downloadUrl
            }
          }
        }
      }
    }
  }
`;

export function useComponentArtifacts(
  host: string,
  componentId: string
): DataQueryResult<Artifact[], { id: string; extensionId: string }> {
  const { data, ...rest } = useDataQuery(ARTIFACTS_QUERY, {
    variables: { id: componentId, extensionId: host },
  });

  const artifacts = mapToArtifacts(data?.getHost?.get?.pipelineReport || []);

  return {
    ...rest,
    data: artifacts,
  };
}
