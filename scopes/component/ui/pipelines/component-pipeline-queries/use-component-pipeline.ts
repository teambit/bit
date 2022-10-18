import { gql } from '@apollo/client';
import { useDataQuery, DataQueryResult } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { TaskReport } from '@teambit/component.ui.pipelines.component-pipeline-model';

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
          taskId
          taskName
          description
          startTime
          endTime
          errors
          warnings
          artifact {
            id
            name
            description
            files {
              id
              name
              path
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
): DataQueryResult<{ tasks: TaskReport[]; buildStatus?: string }, { id: string; extensionId: string }> {
  const { data, ...rest } = useDataQuery(PIPELINE_REPORT_QUERY, {
    variables: { id: componentId, extensionId: host },
  });

  return {
    ...rest,
    data: { tasks: data?.getHost?.get?.pipelineReport || [], buildStatus: data?.getHost?.get?.buildStatus },
  };
}
