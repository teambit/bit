import { useQuery } from '@teambit/graphql.hooks.use-query';
import { gql } from '@apollo/client';

export type CoreAspectIdByPackageName = {
  [packageName: string]: string;
};

const GET_CORE_ASPECTS = gql`
  query CoreAspects {
    coreAspects
  }
`;

export function useCoreAspects(): CoreAspectIdByPackageName {
  const { data } = useQuery(GET_CORE_ASPECTS);
  return data?.coreAspects;
}
