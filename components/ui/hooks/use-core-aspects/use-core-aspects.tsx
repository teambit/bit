import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from 'graphql-tag';
import { DocumentNode } from 'graphql';

export type CoreAspectIdByPackageName = {
  [packageName: string]: string;
};

const GET_CORE_ASPECTS: DocumentNode = gql`
  query CoreAspects {
    coreAspects
  }
`;

export function useCoreAspects(): CoreAspectIdByPackageName {
  const { data } = useDataQuery(GET_CORE_ASPECTS);
  return data?.coreAspects;
}
