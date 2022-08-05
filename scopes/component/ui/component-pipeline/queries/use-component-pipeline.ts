import { gql, QueryResult } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { TaskReport } from '@teambit/component.ui.component-pipeline';

const PIPELINE_REPORT_QUERY = gql`
  query ComponentPipeline($id: String!, $extensionId: String!, $taskId: String) {
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
          name
          description
          startTime
          endTime
          errors
          warnings
          artifact {
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
        buildStatus
      }
    }
  }
`;

export function useComponentPipelineQuery(
  host: string,
  componentId: string
): QueryResult<{ tasks: TaskReport[]; buildStatus?: string }> {
  const { data, ...rest } = useDataQuery(PIPELINE_REPORT_QUERY, {
    variables: { id: componentId, extensionId: host },
  });

  return {
    ...rest,
    data: { tasks: data?.getHost?.get?.pipelineReport || [], buildStatus: data?.getHost?.get?.buildStatus },
  };
}
