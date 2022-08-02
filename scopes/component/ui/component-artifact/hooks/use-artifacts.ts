import { gql, QueryResult } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { BuildArtifacts } from '@teambit/component.ui.component-artifact';

const GET_BUILD_INFO = gql`
  query ComponentBuildArtifacts($id: String!, $extensionId: String!, $aspectId: String) {
    getHost(id: $extensionId) {
      get(id: $id) {
          getBuilderData(aspectId: $aspectId) {
            pipelines {
              id
              name
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
  }
`;

export function useArtifacts(host: string, componentId: string): QueryResult<BuildArtifacts> {
  const result = useDataQuery<BuildArtifacts>(GET_BUILD_INFO, {
    variables: { id: componentId, extensionId: host },
  });
  console.log('🚀 ~ file: use-artifacts.ts ~ line 42 ~ useArtifacts ~ result', result);

  return result;
}
