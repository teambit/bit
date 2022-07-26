import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql, QueryResult } from '@apollo/client';

const QUERY_COMPONENT_COMPARE = gql`
  query ComponentCompare($baseId: String!, $compareId: String!, $fileName: String) {
    getHost {
      id
      compareComponent(baseId: $baseId, compareId: $compareId) {
        id
        code(fileName: $fileName) {
          status
          fileName
          diffOutput
          baseContent
          compareContent
        }
      }
    }
  }
`;

export function useComponentCompareQuery(
  baseId: string,
  compareId: string,
  options?: { fileName?: string }
): QueryResult<ComponentCompareQueryResponse> {
  const response = useDataQuery<ComponentCompareQueryResponse>(QUERY_COMPONENT_COMPARE, {
    variables: {
      baseId,
      compareId,
      fileName: options?.fileName,
    },
  });
  return response;
}
