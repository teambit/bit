import { useMemo } from 'react';
import { gql } from 'apollo-boost';

import { WorkspaceModel } from './workspace-model';
import { useDataQuery } from '../../../ui/ui/data/use-data-query';

const WORKSPACE = gql`
  {
    workspace {
      name
      path
      components {
        id
      }
    }
  }
`;

export function useWorkspaceQuery() {
  const res = useDataQuery(WORKSPACE);
  const { data } = res;

  const workspace = useMemo(() => {
    if (!data?.workspace) return undefined;

    return WorkspaceModel.from(data.workspace);
  }, [data?.workspace]);

  return { ...res, workspace };
}
