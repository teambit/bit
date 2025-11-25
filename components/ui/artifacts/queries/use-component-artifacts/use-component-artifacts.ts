import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import type { Artifact } from '@teambit/component.ui.artifacts.models.component-artifacts-model';
import { mapToArtifacts } from '@teambit/component.ui.artifacts.models.component-artifacts-model';

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
              downloadUrl
              size
            }
          }
        }
      }
    }
  }
`;

export function useComponentArtifacts(
  host: string,
  componentId: string,
  skip?: boolean
): { data: Artifact[]; loading?: boolean } {
  const { data, loading } = useDataQuery(ARTIFACTS_QUERY, {
    variables: { id: componentId, extensionId: host },
    skip,
    fetchPolicy: 'no-cache',
  });

  const artifacts = mapToArtifacts(data?.getHost?.get?.pipelineReport || []);

  return {
    loading,
    data: artifacts,
  };
}

const ARTIFACTS_QUERY_WITH_FILE_CONTENT = gql`
  query ComponentArtifactsWithFileContent($id: String!, $extensionId: String!, $taskId: String, $path: String) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        id {
          name
          version
          scope
        }
        pipelineReport(taskId: $taskId) {
          id
          taskId
          taskName
          artifact(path: $path) {
            id
            name
            description
            files {
              id
              name
              path
              content
              downloadUrl
              size
            }
          }
        }
      }
    }
  }
`;

export function useComponentArtifactFileContent(
  host: string,
  options: { componentId: string; taskId?: string; filePath?: string },
  skip?: boolean
): { data: Artifact[]; loading?: boolean } {
  const { componentId, taskId, filePath } = options;
  const { data, ...rest } = useDataQuery(ARTIFACTS_QUERY_WITH_FILE_CONTENT, {
    variables: { id: componentId, extensionId: host, taskId, path: filePath },
    skip,
    fetchPolicy: 'no-cache',
  });

  const artifacts = mapToArtifacts(data?.getHost?.get?.pipelineReport || []);

  return {
    ...rest,
    data: artifacts,
  };
}
