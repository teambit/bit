import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { ComponentCompareQueryResponse } from '@teambit/component.ui.component-compare.models.component-compare-model';

export const QUERY_COMPONENT_COMPARE = gql`
  query ComponentCompare(
    $baseId: String!
    $compareId: String!
    $fileName: String
    $aspectName: String
    $testFileName: String
  ) {
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
        aspects(aspectName: $aspectName) {
          fieldName
          diffOutput
        }
        tests(fileName: $testFileName) {
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

export type UseComponentCompareQuery = (
  baseId?: string,
  compareId?: string,
  options?: { fileName?: string; aspectName?: string },
  skip?: boolean
) => { loading?: boolean; componentCompareData?: ComponentCompareQueryResponse };

export const useComponentCompareQuery: UseComponentCompareQuery = (
  baseId?: string,
  compareId?: string,
  options?: { fileName?: string; aspectName?: string },
  skip?: boolean
) => {
  const { data, loading } = useDataQuery<{ getHost: { compareComponent: ComponentCompareQueryResponse } }>(
    QUERY_COMPONENT_COMPARE,
    {
      variables: {
        ...(options || {}),
        baseId,
        compareId,
      },
      skip: skip || !baseId || !compareId,
    }
  );

  return {
    loading,
    componentCompareData: data?.getHost.compareComponent,
  };
};
