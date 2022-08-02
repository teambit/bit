import { gql, QueryResult } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { BuildArtifacts } from '@teambit/component.ui.component-artifact';

const GET_BUILD_INFO = gql`
  query ComponentBuildArtifacts($id: String!, $extensionId: String!, $aspectId: String) {
    getHost(id: $extensionId) {
      get(id: $id) {
        buildArtifacts(extensionId: $aspectId) {
          pipelines {
            id
            taskId
            taskName
            startTime
            endTime
            errors
            warnings
            description
          }
          artifacts {
            id
            taskId
            taskName
            files {
              content
              path
              name
              downloadUrl
            }
          }
        }
      }
    }
  }
`;

export function useArtifacts(host: string, componentId: string): QueryResult<BuildArtifacts> {
  const { data, ...rest } = useDataQuery(GET_BUILD_INFO, {
    variables: { id: componentId, extensionId: host },
  });

  return {
    ...rest,
    data: {
      pipelines: data?.getHost?.get?.buildArtifacts?.pipelines || [],
      artifacts: data?.getHost?.get?.buildArtifacts?.pipelines || [],
    },
  };
}
